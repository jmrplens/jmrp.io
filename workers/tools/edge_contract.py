#!/usr/bin/env python3
"""G2: the edge delivery contract of jmrp.io, mcp.jmrp.io and docs.jmrp.io.

Edge delivery audit, fix F19 (2026-11-05). About 50 requests through Cloudflare
(about 30 of them on Worker routes) and 4 straight to GitHub Pages, that pin what
the fixes of 2026-11-04 made true, so a later Worker version or zone rule cannot
quietly undo it:

- a Range on a text type answers 200 with the whole file (M01, M02, M03, the
  jmrp.io Range fix), and no false Accept-Ranges on it (F17);
- a Range on a binary type answers 206 with exactly the requested bytes;
- the precompressed twins under every `^~` prefix of jmrp.io answer 404 (J32);
- HTML never answers 304 to a conditional and never repeats a nonce (BJ1);
- the redirects that must keep the query string keep it (M17);
- negotiation follows q values and case (M05), its 302 is open to other origins
  (A8), and docs' /_astro/ 304 keeps the year (F08);
- no CertificateRequest in the TLS handshake and an Alt-Svc on HTML (F03).

Checks are MUST (a failure exits 1) or PENDING (a fix not yet live: printed,
never fails; promote it to MUST when the fix ships) or OBS (recorded only).

Run it by hand after every Worker version or zone rule change, never in CI: it
spends the account's shared Workers quota (Free plan, 100,000 a day). It
refuses to start when today's total is above 92,000 (check-quota.py).
Real URLs only, one request every 0.4 s, every hostname pinned to the address
1.1.1.1 gives (this server resolves its own hosts locally).

Usage:
  python3 workers/tools/edge_contract.py
  python3 workers/tools/edge_contract.py --host mcp.jmrp.io
  python3 workers/tools/edge_contract.py --override edge-nonce=<version-id>
      (adds Cloudflare-Workers-Version-Overrides for that script: a 0% gate)
"""
import argparse
import datetime
import gzip
import json
import os
import pathlib
import random
import re
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = pathlib.Path(__file__).resolve().parent
DIST = {"jmrp.io": ROOT / "dist", "mcp.jmrp.io": pathlib.Path(os.environ.get("MCP_DIST", "/var/www/mcp.jmrp.io/dist"))}
SCRIPT_OF = {"jmrp.io": "edge-nonce", "mcp.jmrp.io": "edge-nonce-mcp", "docs.jmrp.io": "docs-edge"}
UA = "Mozilla/5.0 (compatible; jmrp-edge-contract/1.0; +https://jmrp.io/)"
QUOTA_LIMIT = 92_000
PAUSE = 0.4

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--host", action="append", choices=sorted(SCRIPT_OF), help="limit to one host (repeatable)")
ap.add_argument("--override", action="append", default=[], metavar="SCRIPT=VERSION")
ap.add_argument("--skip-quota-check", action="store_true", help="only when check-quota.py itself is broken")
# Imported (the guard's own self-test, g2 mutants), it parses no command line.
ARGS = ap.parse_args(None if __name__ == "__main__" else [])
HOSTS = ARGS.host or list(SCRIPT_OF)
OVERRIDES = dict(o.split("=", 1) for o in ARGS.override)

results = []  # (kind, host, name, ok, detail)
counts = {"worker": 0, "no_worker": 0, "origin": 0}


def say(text=""):
    print(text, flush=True)


# ---------------------------------------------------------------- quota (G6)
def quota_gate():
    if ARGS.skip_quota_check:
        say("quota check skipped on request")
        return
    run = subprocess.run(["python3", str(HERE / "check_quota.py")],
                         capture_output=True, text=True, timeout=180)
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    total = None
    for line in run.stdout.splitlines():
        if line.startswith(today):
            total = int(line.split()[1])
    if "fail_open is on in every Worker route" not in run.stdout:
        say(run.stdout[-1500:] + run.stderr[-500:])
        sys.exit("check-quota.py does not confirm fail_open on every Worker route: stop and look")
    if total is None:
        say(f"quota: no row for {today} yet (fresh day)")
        return
    say(f"quota: {total} Worker requests today before this run")
    if total > QUOTA_LIMIT:
        sys.exit(f"today's Workers total {total} is above {QUOTA_LIMIT}: run after 00:00 UTC")


# ---------------------------------------------------------------- routes
DUMP = HERE / "rules-dump.json"
ROUTES = json.loads(DUMP.read_text())["workers_routes"] if DUMP.exists() else []


def runs_worker(host, path):
    """Cloudflare picks the most specific matching route; a trailing * is a wildcard."""
    best = None
    for route in ROUTES:
        pattern = route["pattern"]
        prefix = pattern[:-1] if pattern.endswith("*") else pattern
        target = host + path.split("?")[0]
        if (target.startswith(prefix) if pattern.endswith("*") else target == pattern):
            if best is None or len(pattern) > len(best["pattern"]):
                best = route
    return bool(best and best["script"])


# ---------------------------------------------------------------- requests
IPS = {}


def edge_ip(host):
    if host not in IPS:
        out = subprocess.run(["dig", "+short", host, "@1.1.1.1"], capture_output=True, text=True).stdout.split()
        addresses = [a for a in out if re.fullmatch(r"\d+\.\d+\.\d+\.\d+", a)]
        if not addresses:
            sys.exit(f"no public IPv4 for {host} from 1.1.1.1")
        IPS[host] = addresses[-1]
    return IPS[host]


def fetch(host, path, headers=(), method="GET", decode=False, origin_github=False):
    """One request through the edge (or, for docs, straight to GitHub). Returns (status, headers, body)."""
    with tempfile.TemporaryDirectory() as tmp:
        cmd = ["curl", "-sS", "--max-time", "60", "-A", UA, "-D", f"{tmp}/h", "-o", f"{tmp}/b"]
        if origin_github:
            url = "https://jmrplens.github.io" + path
            cmd += ["--http1.1", "-H", "Host: docs.jmrp.io"]
            counts["origin"] += 1
        else:
            url = f"https://{host}{path}"
            cmd += ["--resolve", f"{host}:443:{edge_ip(host)}"]
            counts["worker" if runs_worker(host, path) else "no_worker"] += 1
            script = SCRIPT_OF[host]
            if script in OVERRIDES:
                cmd += ["-H", f'Cloudflare-Workers-Version-Overrides: {script}="{OVERRIDES[script]}"']
        if method == "HEAD":
            cmd.append("-I")
        elif method != "GET":
            cmd += ["-X", method]
        if decode:
            cmd.append("--compressed")
        for header in headers:
            cmd += ["-H", header]
        cmd.append(url)
        subprocess.run(cmd, capture_output=True, timeout=90)
        raw = pathlib.Path(f"{tmp}/h").read_bytes().decode("latin1") if pathlib.Path(f"{tmp}/h").exists() else ""
        body = pathlib.Path(f"{tmp}/b").read_bytes() if pathlib.Path(f"{tmp}/b").exists() else b""
    time.sleep(PAUSE)
    blocks = [b for b in re.split(r"\r?\n\r?\n", raw) if b.strip()]
    if not blocks:
        return 0, {}, b""
    lines = blocks[-1].splitlines()
    parsed = {}
    for line in lines[1:]:
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            parsed[key] = parsed[key] + "\n" + value.strip() if key in parsed else value.strip()
    return int(lines[0].split()[1]), parsed, body


def record(kind, host, name, ok, detail=""):
    results.append((kind, host, name, ok, detail))
    mark = {True: "ok  ", False: "FAIL" if kind == "MUST" else "no  "}[bool(ok)]
    say(f"  [{kind:7} {mark}] {name}{('  ' + detail) if detail else ''}")


def brief(status, h):
    return (f"{status} cf={h.get('cache-status', h.get('cf-cache-status', '-'))} ce={h.get('content-encoding', '-')} "
            f"cr={h.get('content-range', '-')} ar={h.get('accept-ranges', '-')}")


def nonce(h, body):
    header = re.search(r"'nonce-([^']+)'", h.get("content-security-policy", ""))
    inline = re.search(rb'nonce="([^"]+)"', body)
    return (header.group(1) if header else None, inline.group(1).decode() if inline else None)


# ---------------------------------------------------------------- shared checks
def text_range_whole(host, path, truth, kind="MUST", encodings=("br", "identity"), spec="bytes=0-99"):
    h = {}
    for enc in encodings:
        s, h, body = fetch(host, path, [f"Accept-Encoding: {enc}", f"Range: {spec}"], decode=True)
        ok = s == 200 and "content-range" not in h and body == truth
        record(kind, host, f"text Range {spec} on {path} ({enc}) answers 200 whole", ok, brief(s, h))
        # F17 covers jmrp.io and mcp.jmrp.io; docs.jmrp.io joins it after F07.
        ar_kind = "PENDING" if host == "docs.jmrp.io" else kind
        record(ar_kind, host, f"no Accept-Ranges on text {path} ({enc})", "accept-ranges" not in h, brief(s, h))
    return h


def binary_range_exact(host, path, truth, spec="bytes=100-199", kind="MUST", query=""):
    s, h, body = fetch(host, path + query, ["Accept-Encoding: gzip, deflate, br, zstd", f"Range: {spec}"])
    m = re.fullmatch(r"bytes=(\d*)-(\d*)", spec)
    first, last = m.group(1), m.group(2)
    if first == "":
        want = truth[-int(last):]
        start = len(truth) - int(last)
    else:
        start = int(first)
        want = truth[start:int(last) + 1] if last else truth[start:]
    end = start + len(want) - 1
    ok = s == 206 and body == want and h.get("content-range") == f"bytes {start}-{end}/{len(truth)}"
    record(kind, host, f"binary Range {spec} on {path}{query} answers 206 with those bytes", ok, brief(s, h))
    return s, h


def html_nonce_and_conditional(host, path, kind="MUST", conditional_kind="MUST"):
    seen = []
    for _ in range(2):
        s, h, body = fetch(host, path, ["Accept: text/html", "Accept-Encoding: gzip, br"], decode=True)
        head, inline = nonce(h, body)
        seen.append(head)
        leak = b"NGINX_CSP_NONCE" in body or "NGINX_CSP_NONCE" in h.get("content-security-policy", "")
        record(kind, host, f"{path} carries a minted nonce, the same in header and body",
               s == 200 and head and head == inline and not leak, f"{s} header={str(head)[:10]} body={str(inline)[:10]}")
    record(kind, host, f"{path} mints a new nonce per response", seen[0] and seen[1] and seen[0] != seen[1])
    s, h, _ = fetch(host, path, ["Accept: text/html", "If-None-Match: *", "If-Modified-Since: Fri, 01 Jan 2100 00:00:00 GMT"])
    record(conditional_kind, host, f"{path} answers a conditional with 200, never 304", s == 200, brief(s, h))
    return h


def file_bytes(host, rel):
    return (DIST[host] / rel.lstrip("/")).read_bytes()


# ---------------------------------------------------------------- jmrp.io
def jmrp():
    host = "jmrp.io"
    say(f"\n## {host} (edge {edge_ip(host)})")
    astro_js = sorted(p.name for p in (DIST[host] / "_astro").glob("*.js") if (DIST[host] / "_astro" / (p.name + ".br")).exists())[0]
    text_range_whole(host, "/llms.txt", file_bytes(host, "llms.txt"))                      # Worker
    text_range_whole(host, f"/_astro/{astro_js}", file_bytes(host, f"_astro/{astro_js}"))  # no Worker, rule 83d49da1
    text_range_whole(host, "/identity/person.jsonld", file_bytes(host, "identity/person.jsonld"), encodings=("gzip",), spec="bytes=100-199")
    binary_range_exact(host, "/nedry/nedry-audio.mp3", file_bytes(host, "nedry/nedry-audio.mp3"))  # Worker
    binary_range_exact(host, "/og/about.png", file_bytes(host, "og/about.png"), spec="bytes=-100")
    font = sorted((DIST[host] / "_astro" / "fonts").glob("*.woff2"))[0].name
    binary_range_exact(host, f"/_astro/fonts/{font}", file_bytes(host, f"_astro/fonts/{font}"), spec="bytes=0-99")
    # F05: the query is out of the /pdf/ cache key, so a new value is a HIT.
    pdf = "/pdf/certificates/PerspectivaDeGenero.pdf"
    s, h, _ = fetch(host, pdf, ["Range: bytes=0-0"])
    s, h = binary_range_exact(host, pdf, file_bytes(host, pdf), spec="bytes=0-99", query=f"?contract={random.randrange(10**9)}")
    record("MUST", host, "/pdf/ with a new query string is served from the cache (F05)",
           h.get("cf-cache-status") == "HIT", f"cf={h.get('cf-cache-status')}")
    # J32 and the twin guards: one precompressed file under each ^~ prefix that holds them, plus the root regex.
    beacon = sorted(p.name for p in (DIST[host] / "scripts").glob("cf-beacon.*.js.br"))[0]
    for twin in (f"/_astro/{astro_js}.br", f"/scripts/{beacon}", "/identity/projects.json.br", "/llms.txt.br"):
        s, h, _ = fetch(host, twin)
        record("MUST", host, f"twin {twin} answers 404", s == 404, brief(s, h))
    h = html_nonce_and_conditional(host, "/about/")
    record("MUST", host, "HTML announces HTTP/3 (Alt-Svc, F03)", "h3=" in h.get("alt-svc", ""), h.get("alt-svc", "-"))
    s, h, _ = fetch(host, "/tools/http-headers-analyzer/", ["Accept: text/html", "If-None-Match: *"])
    record("MUST", host, "the analyzer (no Worker) answers If-None-Match: * with 200 (BJ1, F11)", s == 200, brief(s, h))
    # /homelab/ must never run the Worker: nginx's own nonce, no Worker marker.
    s, h, _ = fetch(host, "/homelab/", ["Accept: text/html"])
    record("MUST", host, "/homelab/ is served without the Worker", s == 200 and "x-edge-nonce" not in h,
           f"{s} x-edge-nonce={h.get('x-edge-nonce', '-')}")
    # F04: a 404 under /_astro/ is not stored, so each one has its own nonce.
    missing = f"/_astro/contract-missing-{random.randrange(10**9)}.js"
    first = fetch(host, missing)
    second = fetch(host, missing)
    ok = all(r[0] == 404 and r[1].get("cf-cache-status") != "HIT" for r in (first, second)) and nonce(first[1], b"")[0] != nonce(second[1], b"")[0]
    record("MUST", host, "a 404 under /_astro/ is not kept at the edge (F04)", ok,
           f"{first[0]}/{second[0]} cf={first[1].get('cf-cache-status')}/{second[1].get('cf-cache-status')}")
    # F10 is not live yet: the slash redirect through the Worker keeps the query only after it.
    tag = random.randrange(10**9)
    s, h, _ = fetch(host, f"/cv?contract={tag}")
    record("PENDING", host, "F10: /cv?q answers a redirect that keeps the query", s in (301, 308) and h.get("location", "").endswith(f"/cv/?contract={tag}"),
           f"{s} location={h.get('location', '-')}")


# ---------------------------------------------------------------- mcp.jmrp.io
def mcp():
    host = "mcp.jmrp.io"
    say(f"\n## {host} (edge {edge_ip(host)})")
    llms = file_bytes(host, "llms.txt")
    text_range_whole(host, "/llms.txt", llms)                                                   # Worker
    text_range_whole(host, "/llms.txt", llms, encodings=("identity",), spec=f"bytes={len(llms) // 2}-")
    css = sorted(p.name for p in (DIST[host] / "_astro").glob("*.css"))[0]
    text_range_whole(host, f"/_astro/{css}", file_bytes(host, f"_astro/{css}"), encodings=("br",))  # no Worker, rule 83d49da1
    text_range_whole(host, "/servers/libgen/index.md", file_bytes(host, "servers/libgen/index.md"), encodings=("gzip",))
    binary_range_exact(host, "/og-en.png", file_bytes(host, "og-en.png"), spec="bytes=0-99")   # Worker
    font = sorted((DIST[host] / "_astro" / "fonts").glob("*.woff2"))[0].name
    binary_range_exact(host, f"/_astro/fonts/{font}", file_bytes(host, f"_astro/fonts/{font}"), spec="bytes=-100")
    svg = sorted((DIST[host] / "assets" / "extracted").glob("*.svg"))[0]
    rel = "/" + str(svg.relative_to(DIST[host]))
    h = text_range_whole(host, rel, svg.read_bytes(), encodings=("br",))  # no Worker since F13
    record("MUST", host, "/assets/ runs no Worker (F13)", "x-edge-nonce" not in h, f"x-edge-nonce={h.get('x-edge-nonce', '-')}")
    # The conditional is recorded only: no fix on mcp.jmrp.io claims it.
    h = html_nonce_and_conditional(host, "/license/", conditional_kind="OBS")
    record("MUST", host, "HTML announces HTTP/3 (Alt-Svc, F03)", "h3=" in h.get("alt-svc", ""), h.get("alt-svc", "-"))
    tag = random.randrange(10**9)
    s, h, _ = fetch(host, f"/inspector?server=contract{tag}")
    record("MUST", host, "the slash redirect keeps the query (M17, F02)",
           s == 308 and h.get("location", "").endswith(f"/inspector/?server=contract{tag}"), f"{s} location={h.get('location', '-')}")
    s, h, _ = fetch(host, "/", ["Accept: text/markdown;q=0, text/html"])
    record("MUST", host, "Accept text/markdown;q=0 gets the HTML, not the twin (M05)", s == 200 and "text/html" in h.get("content-type", ""), brief(s, h))
    s, h, _ = fetch(host, "/", ["Accept: TEXT/MARKDOWN"])
    record("MUST", host, "Accept TEXT/MARKDOWN gets the 302 to the twin (M05)", s == 302 and h.get("location", "").endswith("/index.md"),
           f"{s} location={h.get('location', '-')}")
    record("MUST", host, "the negotiated 302 is open to other origins (A8)", h.get("access-control-allow-origin") == "*",
           f"acao={h.get('access-control-allow-origin', '-')} vary={h.get('vary', '-')}")
    missing = f"/assets/contract-missing-{random.randrange(10**9)}.svg"
    s, h, _ = fetch(host, missing)
    record("MUST", host, "a 404 under /assets/ is not stored (F12)", s == 404 and "no-store" in h.get("cache-control", ""),
           f"{s} cf={h.get('cf-cache-status')} cc={h.get('cache-control', '-')}")


# ---------------------------------------------------------------- docs.jmrp.io
def docs():
    host = "docs.jmrp.io"
    say(f"\n## {host} (edge {edge_ip(host)}; phonometry is left out, it republishes often)")
    _, _, page = fetch(host, "/libgen-mcp/", origin_github=True)
    astro = re.search(rb'/libgen-mcp/_astro/[\w.-]+\.(?:js|css)', page)
    llms = fetch(host, "/libgen-mcp/llms.txt", ["Accept-Encoding: identity"], origin_github=True)[2]
    text_range_whole(host, "/libgen-mcp/llms.txt", llms, encodings=("gzip, br", "identity"), spec="bytes=0-99")
    sitemap = fetch(host, "/libgen-mcp/sitemap-index.xml", ["Accept-Encoding: identity"], origin_github=True)[2]
    text_range_whole(host, "/libgen-mcp/sitemap-index.xml", sitemap, kind="PENDING", encodings=("identity",), spec="bytes=0-15")
    og = fetch(host, "/libgen-mcp/og.png", ["Accept-Encoding: identity"], origin_github=True)[2]
    binary_range_exact(host, "/libgen-mcp/og.png", og, spec="bytes=100-199")
    if astro:
        path = astro.group(0).decode()
        s, h, _ = fetch(host, path, ["Accept-Encoding: gzip, br"])
        tag = h.get("etag")
        if tag:
            s, h, _ = fetch(host, path, ["Accept-Encoding: gzip, br", f"If-None-Match: {tag}"])
            record("MUST", host, f"a 304 of {path} keeps the year (F08)",
                   s == 304 and "max-age=31536000" in h.get("cache-control", "") and "immutable" in h.get("cache-control", ""),
                   f"{s} cc={h.get('cache-control', '-')}")
        else:
            record("MUST", host, f"{path} has an ETag to revalidate", False, brief(s, h))
    else:
        record("MUST", host, "found an /_astro/ asset on the origin page", False)
    s, h, _ = fetch(host, "/libgen-mcp/", ["Accept: text/markdown"])
    record("MUST", host, "the negotiated 302 is open to other origins (F08)",
           s == 302 and h.get("access-control-allow-origin") == "*" and "accept" in h.get("vary", "").lower(),
           f"{s} acao={h.get('access-control-allow-origin', '-')} vary={h.get('vary', '-')}")
    s, h, _ = fetch(host, "/libgen-mcp/", ["Accept: text/html", "Accept-Encoding: gzip, br"])
    record("MUST", host, "a page 200 carries GitHub's ETag (F09)", s == 200 and bool(h.get("etag")), f"{s} etag={h.get('etag', '-')}")
    record("MUST", host, "HTML announces HTTP/3 (Alt-Svc, F03)", "h3=" in h.get("alt-svc", ""), h.get("alt-svc", "-"))
    s, h, _ = fetch(host, "/libgen-mcp/", method="OPTIONS")
    record("MUST", host, "a 405 names Allow (F08)", s == 405 and "GET" in h.get("allow", ""), f"{s} allow={h.get('allow', '-')}")
    s, h, _ = fetch(host, "/mikroscope/llms.txt", method="HEAD")
    record("MUST", host, "an llms text file is noindex (F08, D19)", "noindex" in h.get("x-robots-tag", ""), f"x-robots-tag={h.get('x-robots-tag', '-')}")
    s, h, _ = fetch(host, "/a11y-diagrams/", method="HEAD")
    tags = h.get("x-robots-tag", "")
    record("MUST", host, "a11y-diagrams is noindex once and still answers (A11)", s == 200 and tags == "noindex, follow", f"{s} x-robots-tag={tags or '-'}")
    s, h, _ = fetch(host, "/libgen-mcp/og.png", ["Range: bytes=-0,-0"])
    record("OBS", host, "bytes=-0,-0 (O1, A13: Cloudflare answers 502 here)", True, brief(s, h))


# ---------------------------------------------------------------- TLS (F03)
def tls(host):
    with tempfile.TemporaryDirectory() as tmp:
        run = subprocess.run(f"(sleep 2) | timeout 10 openssl s_client -connect {edge_ip(host)}:443 -servername {host} "
                             f"-tls1_3 -alpn h2,http/1.1 -msg > {tmp}/s 2>&1", shell=True)
        text = pathlib.Path(f"{tmp}/s").read_text(errors="replace")
    requests = text.count("CertificateRequest")
    tickets = text.count("NewSessionTicket")
    record("MUST", host, "TLS 1.3 handshake asks for no client certificate and sends tickets (F03)",
           requests == 0 and tickets > 0, f"CertificateRequest={requests} NewSessionTicket={tickets}")


def main():
    say(f"# edge contract {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M:%S} UTC; overrides={OVERRIDES or 'none'}")
    if not ROUTES:
        sys.exit("no rules-dump.json: run workers/tools/dump_rules.py first")
    quota_gate()
    for host in HOSTS:
        {"jmrp.io": jmrp, "mcp.jmrp.io": mcp, "docs.jmrp.io": docs}[host]()
        tls(host)
    failed = [r for r in results if r[0] == "MUST" and not r[3]]
    pending = [r for r in results if r[0] == "PENDING"]
    say(f"\n{sum(1 for r in results if r[0] == 'MUST')} MUST checks, {len(failed)} failed; "
        f"{len(pending)} PENDING ({sum(1 for r in pending if r[3])} already true)")
    say(f"requests: {counts['worker']} on Worker routes, {counts['no_worker']} on routes without a Worker, "
        f"{counts['origin']} straight to GitHub")
    for kind, host, name, _, detail in failed:
        say(f"FAIL {host}: {name}  {detail}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
