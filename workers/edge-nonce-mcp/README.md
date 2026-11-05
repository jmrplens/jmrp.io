<!-- cspell:ignore allback -->

# edge-nonce-mcp

Cloudflare Worker that gives `mcp.jmrp.io` **one CSP nonce per visitor over HTML
cached at the edge**. A copy of the one serving jmrp.io, without its RSS logic.

It lives in the jmrp.io repository with the other two Workers of the zone (see
`../README.md` for what they share and how to deploy any of them). Until 2026-11-05 it
was a git-ignored directory of the mcp.jmrp.io tree.

## Current state

| Item             | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Live version     | `5866b3be-9b15-4887-b396-d3d9d631c778` (2026-11-05), see the history below |
| Previous version | `5fbf88d8-c553-4de4-95b1-e1b6ed6cc0a5` (2026-11-04)                        |
| Roll back        | `wrangler versions deploy 5fbf88d8-c553-4de4-95b1-e1b6ed6cc0a5@100% --yes` |

## The problem it solves

The site's CSP is nonce-based, so every HTML response is unique and the origin
serves it `no-store`: a static site giving up its CDN. Caching it as it is would
make all visitors share a nonce, which is exactly what nonces exist to prevent.

The Worker breaks that choice: it caches at the edge a copy **with the placeholder
unreplaced**, and mints a new nonce on each request.

## Why the CSP is never lost

Two independent rails:

1. **If the Worker is down or skipped**, the origin does not see the secret header
   and substitutes a real nonce itself: the CSP stays correct and only the edge
   cache is lost. The Worker is also _fail-open_: an exception degrades to a
   pass-through, never to Cloudflare's error 1101. The route is fail-open as well,
   so an exhausted daily quota skips the Worker instead of failing the request.

2. **If nginx does not recognize the secret** (rotated, typo, reverted config), the
   origin would have put a real nonce in a copy meant for caching, and a real nonce
   shared with everyone is the vulnerability itself. So the Worker **refuses to
   serve** any response whose CSP header lacks the placeholder: it falls back to an
   uncached pass-through and says so in `X-Edge-Nonce`.

## Bypass routes

**`/libgen*` and `/gitlab*` must not go through the Worker.** They are a live proxy
with SSE responses and healthchecks. The Worker passes anything other than
`GET`/`HEAD` straight through, so real MCP traffic (POST) would be safe anyway, but
a `GET /libgen/health` would be cached.

The bypasses are **zone routes with no worker**, not in `wrangler.toml`: Cloudflare
applies the most specific route, so a narrow bypass beats `mcp.jmrp.io/*`.

| Route                                                 | Why                                                                                                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `mcp.jmrp.io/libgen*`                                 | MCP proxy: SSE and healthchecks                                                                                  |
| `mcp.jmrp.io/gitlab*`                                 | MCP proxy: SSE and healthchecks                                                                                  |
| `mcp.jmrp.io/servers.json`                            | Index for machines, no nonce to replace                                                                          |
| `mcp.jmrp.io/_astro/*`                                | Cache well already; passing them would burn quota                                                                |
| `mcp.jmrp.io/assets/*`                                | Immutable icons, same reason. Since 2026-11-04; they used to live 300 s at the edge and cost one invocation each |
| `mcp.jmrp.io/.well-known/oauth-protected-resource*`   | RFC 9728 document of the MCP endpoint                                                                            |
| `mcp.jmrp.io/.well-known/oauth-authorization-server*` | Same OAuth family                                                                                                |
| `mcp.jmrp.io/.well-known/openid-configuration`        | Same OAuth family                                                                                                |

The three OAuth ones were added on **2026-09-03**. `/gitlab*` and `/libgen*` were
excluded, but discovery documents hang off the host ROOT (RFC 9728 section 3 puts
the well-known segment BETWEEN the host and the resource path), so they fell into
`mcp.jmrp.io/*` and the Worker served them with `cacheEverything`. Measured:
`/.well-known/oauth-protected-resource/gitlab` answered `cf-cache-status: HIT`,
`age: 162`.

## Range requests

The edge stores text as the Brotli nginx gave it and measures a range against that,
so `bytes=0-99` of `/llms.txt` answered `0-99/2675` on an 11,622 byte file, and
`curl -C -` and `wget -c` took a corrupt or truncated file as complete. RFC 9110
section 14.2 lets a server ignore Range, so everything outside `RANGE_SAFE_EXTENSIONS`
gets the whole file.

An invalid range gets the whole file too, on any type: the edge answered
`bytes=-0,-0` on `og-en.png` with a 502 where nginx answers 416. `isValidRange` lets a
`Range` through only when every part of it is well formed, and drops `Range` and
`If-Range` otherwise. If the edge still throws on a range, the fail-open fallback
(`fetchOrWhole`) sends the request once more without it. `/assets/*` has no Worker and
keeps Cloudflare's own 502 for that range.

The list is one-sided on purpose: an unlisted type costs a whole download, a wrongly
listed one a corrupt file. It exists five times and must stay equal: here, in
`../edge-nonce/worker.js`, in docs-edge (`../docs-edge/worker.js`), in the Cache Rule
`83d49da1d9854c778f0067fc5a7cee0a`, which guards the routes without a Worker (a Cache
Rule cannot reach a Worker's subrequests, so this needs both), and in the response
header Transform Rule `078c69fd4e4246a7ad4ce4fe4f1ef9ad`, which removes `Accept-Ranges`
outside the list (F17). Guard G1 compares all five, plus `prefersMarkdown` and
`twinUrl` against jmrp.io's copies: it is the last `describe` of
`../docs-edge/worker.test.mjs`, and reads the rules from `../tools/rules-dump.json`
(refresh it with `python3 workers/tools/dump_rules.py`; without it those two tests are
skipped). This directory's own `node --test` compares the Worker copies too.

### Chromium: whole file, then a Range (accepted, A3)

Once Chromium has stored a file whole in br or zstd, a `fetch` of it with `Range` goes
out with `Accept-Encoding: identity` and `If-None-Match` of the stored ETag. The edge
answers 304, as RFC 9110 asks, and Chromium cuts the range out of its compressed copy:
a 206 with the compressed bytes and a `Content-Range` counted on them, then
`TypeError: Failed to fetch` on the next one. Firefox and WebKit send no conditional
and get the right bytes. It reproduces with no Cloudflare at all. Measured on 181 files
here (M04, edge delivery audit 2026-11-04), none of them fetched by Range by any page
and no client in 60 days of logs. Decision A3: no change in the Worker; documented, with
a report for the Chromium tracker drafted but not filed.

## The OAuth code

`/inspector/callback/?code=...&state=...` is where GitLab sends the sign-in popup back.
The page reads its query in the browser and posts it to its opener; nothing on the
server needs it. Until 2026-11-04 it was in Analytics Engine (blobs 18 and 19), in
Workers Logs (URL, parsed query and Referer) and in nginx's access log (request line
and Referer). Each layer below was measured with a made-up code:

| Layer                                                            | What it stops                                                                                                                                                                                            | Where                                                                           |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| URL Rewrite Rule `41d7e022be3a4559acbacd0761a4c9ec`              | The query never goes past the edge, with or without the Worker: nginx, Workers Logs and this record do not get it                                                                                        | Ruleset `8b22c37ab3cb4d14aaa70659caf514ca`, phase `http_request_transform`      |
| Request Header Transform Rule `f6e54deb91f54b53b5af58134898a69e` | A Referer naming the callback with a query is removed before the Worker and before nginx                                                                                                                 | Ruleset `56ea4abdac1a42ccb2b91c873fa431ac`, phase `http_request_late_transform` |
| `Referrer-Policy: no-referrer` from the Worker                   | The page's subresources stop sending the address. Chromium ignores it for fonts declared in an inline `<style>` (`request.referrerPolicy` stays `strict-origin-when-cross-origin`), hence the rule above | `worker.js`                                                                     |
| `loggedQuery`, `safeReferer`, `passthroughRequest`               | Defense in depth if the rules go: the record keeps parameter names only, and no path forwards the query                                                                                                  | `worker.js`                                                                     |
| `observability.redact_query_string`                              | Workers Logs drops the query string of every URL on this Worker (headers are kept as sent, see below). `wrangler versions deploy` syncs it from `wrangler.toml`, and it applies to every version at once | Script setting                                                                  |

The setting covers the URL only. Workers Logs keeps each request's headers as they came,
`Referer` included (measured: a made-up query in a Referer to `/inspector/` showed up in
`request.headers.referer`), so a Referer naming the callback is kept out of those logs by
the Request Header Transform Rule alone. Since 2026-11-04 21:18 UTC (ruleset version 2) that
rule also matches the Referer after `url_decode`, so a percent-encoded path
(`/inspector/%63allback/`) or doubled slashes no longer reach Workers Logs as sent; before,
only the literal path matched. Both rules run before the Worker: with them in
place the record holds an empty query for the callback, not even the parameter names, and
an empty Referer where the callback was named.

The browser keeps its own address, so the flow does not change. To check it without a
real sign-in, open the callback from a same-origin page with a made-up code and read
the `postMessage`. The end to end check of 2026-11-04 covered nginx, this record,
InfluxDB, Telegraf's Prometheus output, Workers Logs, and a request with the Worker
skipped through a temporary route.

Beyond this account's control: Cloudflare terminates TLS and sees the URL in transit, a
Network Error Logging report for a failed request may carry it, and a WAF event would
record the query of the request it fires on.

To undo the rules: `PUT /zones/<zone>/rulesets/phases/<phase>/entrypoint` with
`{"rules":[]}`. To undo the setting: `redact_query_string = false` in `wrangler.toml`,
then `wrangler versions deploy`.

## Operations

```bash
# From the jmrp.io repository root. Credentials as in ../README.md (wrangler reads
# CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL and CLOUDFLARE_ACCOUNT_ID).

# Before testing on Worker routes: the account has 100,000 requests a day (Free).
python3 workers/tools/check_quota.py

# Deploy. NEVER `wrangler deploy`: it turns the route's fail_open off.
(cd workers/edge-nonce-mcp && node --test)
# Guard G1 (the five copies of the type list, the copied functions, fail-open):
python3 workers/tools/dump_rules.py
(cd workers/docs-edge && node --test)
cd workers/edge-nonce-mcp
pnpm dlx wrangler@latest versions upload --message "..."
pnpm dlx wrangler@latest versions deploy <live>@100% <new>@0% --yes
cd ../..
# Gate at 0%: guard G2 for this host through the override header (about 15 requests),
# plus whatever the change itself needs.
python3 workers/tools/edge_contract.py --host mcp.jmrp.io \
  --override edge-nonce-mcp=<new>
(cd workers/edge-nonce-mcp && pnpm dlx wrangler@latest versions deploy <new>@100% --yes)
# check_quota.py again: it reports fail_open on every route. Three minutes later,
# edge_contract.py with no override (all three hosts, about 50 requests).

# Roll back
(cd workers/edge-nonce-mcp && pnpm dlx wrangler@latest versions deploy <previous>@100% --yes)

# Secret (must match the map in the vhost)
(cd workers/edge-nonce-mcp && pnpm dlx wrangler@latest secret put EDGE_NONCE_KEY)
```

For about three minutes after promoting, some instances still run the previous
version. This server resolves its own hosts locally: test through the edge with
`curl --resolve mcp.jmrp.io:443:<ip from dig +short mcp.jmrp.io @1.1.1.1>`.

This site's secret is **its own**, different from jmrp.io's. It is kept on the server,
outside any repository, and in nginx in `map $http_x_edge_nonce_key
$edge_placeholder_mode_mcp`.

**Rotation: nginx first, then the Worker's secret.** Between the two steps rail 2 covers
the gap by serving uncached.

If what the Worker records changes, `/policies` must change with it
(`src/i18n/ui/policies.ts`), and `scripts/ae-to-influx.mjs` in the jmrp.io repo reads the
same blob layout.

## Checking that it works

The whole contract, with the expected answer of each check, is
`python3 workers/tools/edge_contract.py --host mcp.jmrp.io` (guard G2). By hand, always through the edge (this server resolves mcp.jmrp.io to
itself, so a bare curl measures nginx):

```bash
R=(--resolve "mcp.jmrp.io:443:$(dig +short mcp.jmrp.io @1.1.1.1 | tail -1)")

# The page DOES go through the Worker, with a different nonce each time
curl -sI "${R[@]}" https://mcp.jmrp.io/ | grep -i x-edge
for i in 1 2 3; do curl -s "${R[@]}" https://mcp.jmrp.io/ | grep -o 'nonce="[^"]*"' | head -1; done

# The edge cache warms up: MISS then HIT
curl -sI "${R[@]}" https://mcp.jmrp.io/ | grep -i x-edge-sub-cache

# The MCP endpoints do NOT go through the Worker (must print nothing)
curl -sI "${R[@]}" https://mcp.jmrp.io/libgen/health | grep -i x-edge-nonce

# A range on text is a whole file, a range on a binary an exact one
curl -sI "${R[@]}" -H 'Range: bytes=0-99' https://mcp.jmrp.io/llms.txt | head -1
curl -sI "${R[@]}" -H 'Range: bytes=0-99' https://mcp.jmrp.io/og-en.png | grep -i content-range

# A redirect keeps its query and is cacheable
curl -sI "${R[@]}" 'https://mcp.jmrp.io/inspector?server=gitlab' | grep -iE '^(location|cache-control)'

# Negotiation sends a client that prefers Markdown to the page's own twin
curl -sI "${R[@]}" -H 'Accept: text/markdown' https://mcp.jmrp.io/servers/libgen/ | grep -i location
```

If `NGINX_CSP_NONCE` appears unreplaced in the HTML, the Worker's secret and the one in
the nginx `map` do not match.

## Version history

| Version                                | Date       | What                                                                                                                                                                                                                 |
| -------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e13c0e4f-3004-4595-bfc7-8696c4d5f4ef` | 2026-10-14 | Bot marks in the record                                                                                                                                                                                              |
| `c1a92605-6f56-4b71-80e0-9068d35610d9` | 2026-11-04 | Range list, subrequest with no query, redirects keep their query and are cacheable with no CSP, `prefersMarkdown` and `twinUrl` copied from jmrp.io, CORS on the negotiated 302, OAuth code redacted from the record |
| `5fbf88d8-c553-4de4-95b1-e1b6ed6cc0a5` | 2026-11-04 | Same code, comments only                                                                                                                                                                                             |
| `5866b3be-9b15-4887-b396-d3d9d631c778` | 2026-11-05 | An invalid Range is not sent on; a range the edge rejects is retried whole; first deploy from this directory                                                                                                         |
