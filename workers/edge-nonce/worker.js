// cspell:words otros formado -- Spanish labels shared with the Telegraf Starlark (ua_class, referer host)
/**
 * Edge-nonce: per-visitor CSP nonces on top of edge-cached HTML.
 *
 * ── The problem this solves ──────────────────────────────────────────────
 * The site's CSP is nonce-based, so every HTML response is unique and the
 * origin serves it `no-store`: a fully static site that forfeits its CDN.
 * Caching a nonce'd page would make visitors share a nonce, which defeats
 * the reason nonces exist.
 *
 * ── How it works ─────────────────────────────────────────────────────────
 * 1. The Worker fetches the origin with the shared secret header
 *    (X-Edge-Nonce-Key). nginx then sets $cspNonce to the LITERAL
 *    "NGINX_CSP_NONCE", so sub_filter replaces the token with itself and the
 *    page leaves the origin with the placeholder intact in both the body and
 *    the CSP header. That placeholder copy is what gets cached at the edge
 *    (cf.cacheEverything + cacheTtl override the origin's no-store).
 * 2. Per request, the Worker mints a fresh 128-bit nonce and substitutes the
 *    placeholder in the cached body + CSP header. The browser still receives
 *    `no-store`, so nothing downstream ever caches a minted nonce.
 *
 * ── The safety rail (do not remove) ──────────────────────────────────────
 * If nginx does not recognize the secret (rotated, typo, config rolled
 * back), the origin substitutes a real nonce before caching, and a cached
 * real nonce served to everyone is EXACTLY the vulnerability nonces prevent.
 * So the Worker refuses to serve any response whose CSP header lacks the
 * placeholder: it falls back to a plain pass-through fetch (today's
 * behavior, uncached) and flags it in X-Edge-Nonce for observability.
 *
 * ── Scope ────────────────────────────────────────────────────────────────
 * Routes decide which paths run through this. It graduated from a canary on
 * /uses/* to the whole zone on 2026-08-03, so the route is `jmrp.io/*` with a
 * set of narrower zone routes carrying NO worker, which win by specificity.
 * The bypass list lives in the README; two of them are load-bearing here:
 * /homelab/* must NEVER be routed through this: its HLM_* metrics are
 * substituted per request at the origin and would freeze for cacheTtl at the
 * edge; and /api/* + /csp-report* are dynamic endpoints that must not be
 * cached at all.
 */

const PLACEHOLDER = "NGINX_CSP_NONCE";
const EDGE_TTL_SECONDS = 86_400; // cached placeholder copy; purged with the zone

/**
 * Whether the client prefers markdown over HTML for this page.
 *
 * The previous test was `accept.includes("text/markdown")`, which reads a
 * substring and ignores the weights entirely: a client sending
 * `text/html;q=0.9,text/markdown;q=0.8` (HTML preferred, markdown merely
 * acceptable) was redirected to the twin. (GEO audit 2026-08-27, B2.)
 *
 * Each side is scored as a `[specificity, q]` pair and the pairs are compared
 * lexicographically: specificity first, q only as the tie-break.
 *
 * Deliberate choices:
 *  · Only a media type that NAMES text/markdown counts as a markdown vote.
 *    `text/*` and `*` + `/*` do not: the feature exists for clients that ask
 *    for this representation on purpose, and every browser sends the catch-all.
 *  · Wildcards DO count as an HTML vote, so `text/markdown, *` + `/*;q=0.1`
 *    resolves to markdown while a bare catch-all never does.
 *  · SPECIFICITY BEATS q, which is a deliberate deviation from a strict
 *    reading of RFC 9110 §12.5.1. There, specificity only picks WHICH range
 *    applies to a representation, and the representations are then ranked by
 *    the resulting q, so `text/markdown;q=0.9, *` + `/*` would score markdown
 *    0.9 against HTML 1.0 and serve HTML. Here it serves markdown: a client
 *    that spells out `text/markdown` while leaving HTML to a wildcard has
 *    named the representation it came for, and the wildcard is what it will
 *    accept if the named one is unavailable. Naming both is how a client asks
 *    for HTML: `text/html;q=0.9, text/markdown;q=0.8` serves HTML.
 *  · A tie resolves to markdown, which is exactly what the old substring test
 *    did for `Accept: text/html,text/markdown`.
 *  · `q=0` means "not acceptable" and disables that side.
 *
 * @param accept - The raw Accept header, or null when absent.
 * @returns True when the markdown twin is the better representation to serve.
 */
/* eslint-disable sonarjs/cognitive-complexity, unicorn/prefer-switch, unicorn/no-lonely-if --
   prefersMarkdown is a verbatim copy in the three Workers, compared by
   workers/docs-edge/worker.test.mjs; a refactor has to land in all three at once. */
function prefersMarkdown(accept) {
  if (!accept) return false;
  // [specificity, q]; specificity 2 = exact type, 1 = `type/*`, 0 = `*` + `/*`.
  let markdown = null;
  let html = null;
  const better = (a, b) =>
    b === null || a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  for (const part of accept.split(",")) {
    const segments = part.trim().split(";");
    const type = segments[0].trim().toLowerCase();
    if (!type) continue;
    // `q=.8` (no leading zero) is legal in the wild, hence `\d*` plus the
    // non-empty guard: an unparseable `q=` leaves the default of 1.
    // The outer whitespace goes to trim(), not to the pattern: `\s*` on both
    // sides of a group that can match empty backtracks in quadratic time on
    // `q=`, a run of spaces and any other character (64 KB of them: 6 s).
    // trim() strips exactly what `\s` matches, so every result is unchanged.
    let q = 1;
    for (const parameter of segments.slice(1)) {
      const match = /^q\s*=\s*(\d*(?:\.\d+)?)$/i.exec(parameter.trim());
      if (match && match[1] !== "") q = Number.parseFloat(match[1]);
    }
    if (!Number.isFinite(q) || q < 0) q = 0;
    if (q === 0) continue; // "not acceptable": no vote at all
    if (type === "text/markdown") {
      if (better([2, q], markdown)) markdown = [2, q];
    } else if (type === "text/html" || type === "application/xhtml+xml") {
      if (better([2, q], html)) html = [2, q];
    } else if (type === "text/*") {
      if (better([1, q], html)) html = [1, q];
    } else if (type === "*/*") {
      if (better([0, q], html)) html = [0, q];
    }
  }
  if (markdown === null) return false;
  if (html === null) return true;
  return !better(html, markdown); // ties go to markdown
}
/* eslint-enable sonarjs/cognitive-complexity, unicorn/prefer-switch, unicorn/no-lonely-if */

/**
 * The markdown twin's candidate URL: `<pathname>index.md` for a pathname
 * ending in `/`, query and fragment dropped; null for any other path.
 *
 * Built by setting `pathname` on a copy of the request URL, NEVER by
 * resolving `${pathname}index.md` against it: resolution reads a path that
 * starts with `//` as a network path, so `https://jmrp.io//evil.example/`
 * would name `https://evil.example/index.md`, turning the probe into a fetch
 * of another host and the 302 into an open redirect. Today the zone merges
 * repeated slashes before any Worker runs, which masks that; the setter
 * keeps the host whatever the path holds, whatever the zone's URL
 * normalization. VERBATIM copy of twinUrl in
 * workers/docs-edge/markdown-negotiation.js: change both together, its
 * worker.test.mjs fails when they differ.
 *
 * @param url - The request URL.
 * @returns The candidate twin on this same origin, or null.
 */
function twinUrl(url) {
  if (!url.pathname.endsWith("/")) return null;
  const twin = new URL(url.href);
  twin.pathname = `${url.pathname}index.md`;
  twin.search = "";
  twin.hash = "";
  return twin;
}

/**
 * A redirect as the visitor should get it. The stored copy came from a request
 * with no query (see originUrl below), so the query goes back on here: the origin
 * keeps it on its slash 301 (/cv?x=1 -> /cv/?x=1) and on /docs/<project>, and the
 * cached copy used to lose it (edge audit 2026-11-04, J26 and J41). A target with
 * its own query or a fragment stays as it is: a query after a fragment is
 * malformed (/docs/A-Lab goes to a #readme anchor). Same function as in
 * edge-nonce-mcp (F02 of that audit).
 *
 * @param {Response} response - The redirect from the origin or the edge cache.
 * @param {URL} url - The request URL.
 * @returns {Response} The redirect to send.
 */
function redirectResponse(response, url) {
  const headers = new Headers(response.headers);
  const location = headers.get("location");
  if (location && url.search && !/[?#]/.test(location)) {
    headers.set("location", `${location}${url.search}`);
  }
  headers.delete("content-security-policy"); // no document, so no nonce to mint
  headers.set("cache-control", "public, max-age=3600");
  headers.set("x-edge-nonce", "redirect");
  return new Response(response.body, { status: response.status, headers });
}

// ── Per-request log helpers (Analytics Engine) ─────────────────────────────
// Named agents the log reports by name (blob 4). The earliest match in the
// UA wins and keeps the UA's own casing, exactly what the regex alternation
// this replaces used to capture. The Telegraf starlark (clean_metrics.star)
// mirrors this list for nginx rows: extend both together.
const NAMED_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Googlebot",
  "bingbot",
  "DuckDuckBot",
  "Applebot",
  "Amazonbot",
  "Bytespider",
  "CCBot",
  "meta-externalagent",
  "facebookexternalhit",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "YandexBot",
  "PetalBot",
  "Timpibot",
  "archive.org_bot",
  "curl",
  "wget",
  "python-requests",
  "Go-http-client",
  "okhttp",
  // Added 2026-09-22. In the five days to that date "otros-bots" was the
  // largest bot bucket at the edge (2842 requests), which made the breakdown
  // useless; these are the names behind it, ordered by volume. Checked
  // against the 400 distinct user-agents of the preceding week: 31 rows move
  // out of "otros-bots"/"otros" and no already-named agent is renamed.
  // A name here is a label, never proof: the GCP scanner of that same round
  // wore most of these.
  "jscrawler",
  "DuckAssistBot",
  "PanguBot",
  "SERankingBacklinksBot",
  "ExaSearchBot",
  "cohere-ai",
  "KimiBot",
  "Kimi-SearchBot",
  "MoonshotBot",
  "DataForSeoBot",
  "Qwenbot",
  "Qwantbot",
  "Bravebot",
  "ChatGLM-Spider",
  "Baiduspider",
  "GrokBot",
  "xAI-Grok",
  "DeepSeekBot",
  "LinkupBot",
  "YiBot",
  "YouBot",
  "WhyNoIPv6Bot",
  "BrickBlueBot",
  "SeznamBot",
  "ShapBot",
  "Sogou",
  "MCP-Cloud-AboutBot",
  "Barkrowler",
];

/** Request class (index1): what kind of resource the path names. */
function requestClass(p) {
  if (p.endsWith(".md")) return "md-twin";
  if (p === "/llms.txt" || p === "/llms-full.txt" || p.startsWith("/llms-")) {
    return "llms-txt";
  }
  if (p.endsWith(".pdf")) return "pdf";
  if (p === "/rss.xml" || p === "/es/rss.xml" || p.endsWith(".xml")) {
    return "feed-xml";
  }
  if (p.startsWith("/_astro/") || p.startsWith("/assets/")) return "asset";
  if (p.endsWith("/") || !p.includes(".")) return "page";
  return "other";
}

/**
 * Substrings that mark a User-Agent as automated (blob 2 "bot"), matched
 * case-insensitively. Telegraf's clean_metrics.star keeps the same list in
 * UA_BOT_MARKS for nginx rows: change both together.
 */
const BOT_MARKS = [
  "bot",
  "crawl",
  "spider",
  "gpt",
  "claude",
  "perplexity",
  "bingpreview",
  "slurp",
  "grok",
  "externalhit",
  "curl",
  "wget",
  "python",
  "aiohttp",
  "go-http-client",
  "okhttp",
  "scrapy",
  "lychee",
  "camo",
  "rss",
  "validator",
  "checker",
  "webfetch",
  "notebooklm",
  "hunyuan",
  "turnitin",
];

/** Coarse UA class (blob 2): bot, browser or empty-ua. */
function agentClass(ua) {
  if (!ua) return "empty-ua";
  // "grok" is here for xAI-Grok alone: its UA is
  // `Mozilla/5.0 (compatible; xAI-Grok/1.0; +https://x.ai/)`, which carries
  // none of the other markers, so blob2 called a crawler a browser while
  // blob4 named it correctly. Checked over the 400 distinct user-agents of
  // the week to 2026-09-22: exactly one of them changes class, that one.
  // Automated clients that name no crawler, added 2026-10-14: link
  // previewers (facebookexternalhit), HTTP libraries and CLIs (curl, wget,
  // python, aiohttp, go-http-client, okhttp, scrapy, got-style fetchers),
  // image proxies (github-camo, Tangled Camo), feed readers (FreshRSS, RSS
  // Guard), link checkers and validators (lychee, our own CI), and fetchers
  // that call themselves tools (WebFetch, NotebookLM, Hunyuan, Turnitin).
  // Over three days of the three edge datasets this moved 2012 requests out
  // of "browser" and no real browser family: the one "Chrome" that moved is
  // RSS Guard, a feed reader on QtWebEngine. Telegraf's clean_metrics.star
  // keeps the same list in UA_BOT_MARKS.
  const lower = ua.toLowerCase();
  if (BOT_MARKS.some((mark) => lower.includes(mark))) return "bot";
  // Every real Chrome, Edge and Opera sends "AppleWebKit/537.36 (KHTML, like
  // Gecko)". A UA that claims Chrome without it is a client in disguise: over
  // three days all five such UAs were scanners and minimal fetchers (the top
  // one, "...Win64; x64) Chrome/120.0.0.0", made 204 requests).
  if (ua.includes("Chrome/") && !ua.includes("AppleWebKit/")) return "bot";
  return "browser";
}

/** Browser families by UA marker, in the order the old regex chain tested them. */
const BROWSER_FAMILIES = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
];

/** Named agent or family (blob 4), same vocabulary as before. */
function agentName(ua, uaClass) {
  const lower = ua.toLowerCase();
  let bestPos = -1;
  let bestLen = 0;
  for (const name of NAMED_AGENTS) {
    const pos = lower.indexOf(name.toLowerCase());
    if (pos !== -1 && (bestPos === -1 || pos < bestPos)) {
      bestPos = pos;
      bestLen = name.length;
    }
  }
  if (bestPos !== -1) return ua.slice(bestPos, bestPos + bestLen);
  if (uaClass === "bot") return "otros-bots";
  const family = BROWSER_FAMILIES.find(([marker]) => ua.includes(marker));
  if (family) return family[1];
  return ua ? "otros" : "(sin-ua)";
}

/** Referer host when it is not this site; "(mal-formado)" when unparsable. */
function refererHost(referer, ownHost) {
  if (!referer) return "";
  try {
    const h = new URL(referer).hostname;
    return h === ownHost ? "" : h;
  } catch {
    return "(mal-formado)";
  }
}

/** Blob 20: the long tail of request/response facts, "|"-joined (see layout). */
function miscBag(cf, h, rh) {
  return [
    cf.region ?? "",
    cf.regionCode ?? "",
    cf.tlsCipher ?? "",
    cf.continent ?? "",
    cf.timezone ?? "",
    h("sec-fetch-dest"),
    h("sec-fetch-mode"),
    h("sec-fetch-site"),
    String(cf.botManagement?.verifiedBot ?? ""),
    h("cf-ray"),
    rh("content-type").slice(0, 60),
    h("accept-encoding").slice(0, 40),
    String(cf.isEUCountry ?? ""),
    cf.postalCode ?? "",
  ].join("|");
}

/**
 * Writes ONE Analytics Engine datapoint for a request, at the exit of every
 * path so it carries the final status and the edge-cache verdict. Never in
 * the serving path: a failed write must not cost a page view.
 *
 * Blob layout is an API contract with scripts/ae-to-influx.mjs and the daily
 * report (append, never reorder). Blobs 1-13 are the original record; 14-20
 * and doubles 3-9 were appended on 2026-09-05 to capture everything the
 * edge knows, so filtering can happen locally instead of here:
 *   1 path · 2 uaClass · 3 country · 4 agent · 5 referer host · 6 colo
 *   7 city · 8 ASN org · 9 http protocol · 10 TLS version · 11 status
 *   12 cache verdict · 13 Accept (64) · 14 method · 15 full User-Agent (256)
 *   16 client IP · 17 Accept-Language (64) · 18 full referer (200)
 *   19 query string (128, no "?") · 20 misc, "|"-joined in this order:
 *      region|regionCode|tlsCipher|continent|timezone|sec-fetch-dest|
 *      sec-fetch-mode|sec-fetch-site|verifiedBot|cf-ray|response
 *      content-type|accept-encoding|isEUCountry|postalCode
 * Doubles: 1 latitude · 2 longitude · 3 ASN · 4 client TCP RTT (ms)
 *   5 response Content-Length · 6 response Age · 7 worker time (ms)
 *   8 bot score (0 without Bot Management) · 9 request time (ms epoch)
 * Analytics Engine caps a datapoint at 20 blobs and 5 KB of blob data; the
 * truncations keep the worst case under 2 KB.
 *
 * @param {object} args - env, request, url, startedAt, status, cacheStatus, response.
 */
function logEdgeRequest({
  env,
  request,
  url,
  startedAt,
  status,
  cacheStatus,
  response,
}) {
  try {
    const p = url.pathname;
    const ua = request.headers.get("user-agent") ?? "";
    const uaClass = agentClass(ua);
    const cf = request.cf ?? {};
    const h = (name) => request.headers.get(name) ?? "";
    const rh = (name) => response?.headers.get(name) ?? "";
    const misc = miscBag(cf, h, rh);
    env.REQS?.writeDataPoint({
      indexes: [requestClass(p)],
      blobs: [
        p.slice(0, 256),
        uaClass,
        cf.country ?? "",
        agentName(ua, uaClass).slice(0, 60),
        refererHost(h("referer"), url.hostname).slice(0, 120),
        cf.colo ?? "",
        String(cf.city ?? "").slice(0, 60),
        String(cf.asOrganization ?? "").slice(0, 80),
        cf.httpProtocol ?? "",
        cf.tlsVersion ?? "",
        String(status),
        cacheStatus ?? "",
        h("accept").slice(0, 64),
        request.method,
        ua.slice(0, 256),
        h("cf-connecting-ip"),
        h("accept-language").slice(0, 64),
        h("referer").slice(0, 200),
        url.search.slice(1, 129),
        misc.slice(0, 400),
      ],
      doubles: [
        Number.parseFloat(cf.latitude) || 0,
        Number.parseFloat(cf.longitude) || 0,
        Number(cf.asn) || 0,
        Number(cf.clientTcpRtt) || 0,
        Number(rh("content-length")) || 0,
        Number(rh("age")) || 0,
        Date.now() - startedAt,
        Number(cf.botManagement?.score) || 0,
        startedAt,
      ],
    });
  } catch {
    // Analytics must never break serving.
  }
}

export default {
  async fetch(request, env) {
    // Fail open, always: an exception here must degrade to "the worker adds
    // nothing", never to Cloudflare's 1101 error page. With the worker routed
    // over all site HTML, failing closed would take the whole site down.
    try {
      return await handle(request, env);
    } catch {
      try {
        return await fetch(request);
      } catch {
        return new Response("origin unreachable", { status: 502 });
      }
    }
  },
};

/** Types the edge stores as they are, so a byte range of them is a real one. */
const RANGE_SAFE_EXTENSIONS = new Set([
  "pdf",
  "pptx",
  "mp3",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "avif",
  "gif",
  "woff",
  "woff2",
  "mp4",
  "webm",
  "zip",
]);

async function handle(request, env) {
  const url = new URL(request.url);

  const startedAt = Date.now();
  const logReq = (status, cacheStatus, response) =>
    logEdgeRequest({
      env,
      request,
      url,
      startedAt,
      status,
      cacheStatus,
      response,
    });

  // Anything that is not a plain page read passes straight through, but it
  // is still logged, with the origin's verdict (the 405 method probes and
  // MCP endpoint guesses live here).
  if (request.method !== "GET" && request.method !== "HEAD") {
    const passthrough = await fetch(request);
    logReq(passthrough.status, "passthrough", passthrough);
    return passthrough;
  }

  // RSS for people: a browser navigation to a feed (only browsers send
  // Sec-Fetch-Dest: document) goes to the /feeds/ page, while feed readers
  // and crawlers do not send that header and get the XML untouched at the
  // same URL. This decision MUST live here and not only in nginx: the origin
  // subrequest is cached by URL, ignoring headers, so a cached 302 from the
  // origin would be served to readers too (cache poisoning). It is answered
  // here, before the cache is touched, and never cached.

  if (
    (url.pathname === "/rss.xml" || url.pathname === "/es/rss.xml") &&
    request.headers.get("sec-fetch-dest") === "document"
  ) {
    const target = url.pathname.startsWith("/es/") ? "/es/feeds/" : "/feeds/";
    logReq(302, "rss-human-redirect");
    return new Response(null, {
      status: 302,
      headers: {
        location: new URL(target, url).href,
        "cache-control": "no-store",
        "x-edge-nonce": "rss-human-redirect",
      },
    });
  }

  // Content negotiation for AI agents: a client that PREFERS text/markdown
  // over HTML gets 302'd from a page to its markdown twin (<page>/index.md):
  // the same content minus ~90% of the bytes (the HTML text-to-markup
  // ratio is ~8.6%). The twin lives at the page's own URL with `index.md`
  // appended, which is the llms.txt spec's form for a URL that has no file
  // name, which is every URL on this site. No browser ever sends text/markdown, so
  // human traffic is untouched.
  //
  // This decision MUST live here and not in the origin, for the same reason
  // as the RSS human-redirect above: the edge cache is keyed by URL and
  // ignores request headers, so an origin-issued redirect would be cached
  // and then served to browsers. Answered before the cache, never cached.
  // (GEO audit 2026-08-22, B19.)
  //
  // WHICH URLs HAVE A TWIN IS NOT HARD-CODED, and must not be. The regex
  // this replaces matched blog posts only: 24 of the twins the build
  // emits (the homepage, /about/, /cv/, /projects/, /publications/,
  // /privacy/, /uses/ and all 34 tool pages) existed and answered 200 by
  // explicit URL, but negotiating for them returned HTML. Rather than a list
  // that goes stale on the next post or tool, the worker ASKS: it fetches
  // the candidate twin through the edge cache and redirects only on a
  // literal 200. The build output stays the single source of truth, adding
  // content needs no worker redeploy, and a URL that has no twin, or no
  // page at all, falls through to the HTML it really has instead of being
  // bounced to a 404 (GEO audit 2026-08-27, A1 + M2).
  //
  // Six pages have a twin but never reach this code, so they do NOT negotiate:
  // /homelab/, /es/homelab/, /projects/, /es/projects/,
  // /tools/http-headers-analyzer/ and /es/tools/http-headers-analyzer/. Their
  // zone routes carry no worker (per-request metrics, the analyzer's dynamic
  // API, and /projects/* with only its contributions subpages routed back in),
  // and a twin there is reachable by its explicit URL only. Accepted by the
  // author (edge audit 2026-11-04, BJ2, decision A5): about 66 requests a week
  // and a third copy of prefersMarkdown in nginx are not worth it.
  //
  // `redirect: "manual"` so a 3xx can never be mistaken for a live twin, and
  // a plain GET (not HEAD) so the probe FILLS the very cache entry the
  // follow-up request reads. The probe is NOT observable in Analytics
  // Engine: Cloudflare does not re-invoke a Worker for a subrequest to its
  // own route, so `handle()` never runs for it and no datapoint is written.
  // Its cost shows up as TTFB on the negotiated request, and nowhere else.
  //
  // The path is tested first (inside twinUrl) and the Accept second, so a
  // request for anything but a slash page never parses its Accept header.
  const twin = twinUrl(url);
  if (twin !== null && prefersMarkdown(request.headers.get("accept"))) {
    // A throwing probe must mean "no twin", not "no nonce": without this
    // catch a network blip would escape to the outer handler, which degrades
    // the whole request to an unlogged pass-through with no nonce minted.
    let probeStatus = 0;
    try {
      const probe = await fetch(twin.toString(), {
        redirect: "manual",
        cf: {
          cacheEverything: true,
          cacheTtlByStatus: {
            "200-299": EDGE_TTL_SECONDS,
            "300-399": 0,
            404: 300,
            "500-599": 0,
          },
        },
      });
      probeStatus = probe.status;
      // Only the status code is needed; releasing the body keeps the
      // subrequest from being held open for the rest of the invocation.
      await probe.body?.cancel();
    } catch {
      probeStatus = 0;
    }
    if (probeStatus === 200) {
      logReq(302, "markdown-negotiation");
      return new Response(null, {
        status: 302,
        headers: {
          location: twin.href,
          vary: "Accept",
          "cache-control": "no-store",
          "x-edge-nonce": "markdown-negotiation",
        },
      });
    }
    // No twin: fall through and serve the HTML this URL actually has, which
    // for a URL that does not exist is the origin's own 404. The fall-through
    // needs no `Vary: Accept`: the HTML served is byte-identical whatever
    // the Accept header said, and the negotiation itself is decided here,
    // ahead of the cache, on every single request.
  }

  // The query string is stripped from the origin subrequest, which also
  // makes it the cache key. `?cb=<random>` used to mint a fresh cache entry
  // with a 24 h TTL each time, an easy way to fill the cache and force
  // origin traffic (GEO audit 2026-08-22, B25; `cf.cacheKey` itself is
  // Enterprise-only, so normalizing the URL is the mechanism available
  // here). Correct for this site: it is fully static, no page varies on a
  // query parameter, and every page self-canonicalizes without one. /api/*
  // and /csp-report* never reach this worker (zone-level bypass routes).
  const originUrl = new URL(request.url);
  originUrl.search = "";
  const originRequest = new Request(originUrl.href, request);
  originRequest.headers.set("X-Edge-Nonce-Key", env.EDGE_NONCE_KEY);

  // Conditional headers are stripped FOR HTML ONLY, so the origin always
  // hands back a body to rewrite. Without this, a client revalidating an
  // HTML page with If-None-Match / If-Modified-Since got a 304, which
  // carries no Content-Type, so it fell through the `text/html` gate below
  // and was returned verbatim, CSP and all. That CSP still held the literal
  // placeholder, and RFC 9111 §4.3.4 makes the client update its stored
  // headers from the 304: the stored body keeps its real nonce while the CSP
  // switches to `nonce-NGINX_CSP_NONCE`, blocking every inline style and
  // script on the page.
  // (GEO audit 2026-08-22, A9. Verified reproducible against /, /es/, /blog/,
  // /cv/ and the post 003.)
  //
  // Cost: HTML no longer answers 304. That is close to free here: HTML is
  // served `no-store`, so a conforming browser never revalidates it, and the
  // `Last-Modified` the edge synthesized changed on every cache fill anyway
  // (and is now deleted from the minted copy, see below),
  // so a crawler's conditional GET was already being told "changed" almost
  // every time. THAT COST IS THE POINT, and it must stay: a 304 for HTML
  // would hand back a stale nonce.
  //
  // But the strip used to be UNCONDITIONAL while the reasoning above only
  // ever applied to HTML, so everything else this worker fronts
  // /llms.txt, /llms-full.txt, /rss.xml, /sitemap-*.xml, /robots.txt and
  // every markdown twin, answered a conditional GET with the whole body,
  // every time, forever. The ORIGIN does emit 304 for them (verified over
  // loopback); only /_astro/* revalidated at the edge, and that is a worker
  // BYPASS route, which is what made the breakage look like a non-issue.
  // (GEO audit 2026-08-27, M1.)
  //
  // So: keep stripping wherever the response could be HTML, and let the
  // conditionals through only for a path whose extension PROVES it is not.
  // The test is one-sided on purpose. Misclassifying towards HTML costs one
  // 304 (today's behavior); misclassifying away from it reopens A9. Every
  // HTML URL on this site ends in `/` and so has no extension at all.
  const extension = /\.([a-z\d]+)$/i.exec(url.pathname)?.[1]?.toLowerCase();
  const mayBeHtml =
    extension === undefined || ["html", "htm"].includes(extension);
  if (mayBeHtml) {
    originRequest.headers.delete("if-none-match");
    originRequest.headers.delete("if-modified-since");
  }

  // Range is dropped unless the extension proves the file is stored as it is.
  // The edge caches text as the Brotli nginx gave it and measures a range
  // against that, so bytes=0-99 of /llms.txt answered "0-99/9392" on a 36,898
  // byte file: an empty body or raw Brotli with no Content-Encoding, and a 416
  // for a range inside the file, which curl -C - and wget -c read as complete.
  // RFC 9110 section 14.2 lets a server ignore Range, so these get the whole
  // file. One-sided on purpose, like mayBeHtml: an unlisted type costs a whole
  // download, a wrongly listed one costs a corrupt file. The bypass routes
  // (/_astro/, /assets/) never reach this worker: the same list guards them in
  // the Cache Rule "a Range request skips the cache". Keep both in step.
  // (Reported from phonometry's edge checks, 2026-11-04.)
  if (!RANGE_SAFE_EXTENSIONS.has(extension)) {
    originRequest.headers.delete("range");
    originRequest.headers.delete("if-range");
  }

  // Per-status TTLs: success gets the full TTL, redirects and 404s a short
  // one, and origin errors are never cached: a 5xx burst must not be frozen
  // into the edge for a day.
  //
  // The redirect band is split around 304 rather than written as one
  // `300-399`. Until the classifier above existed, no conditional ever
  // reached the origin from here and a 304 could not come back, so a 3600 s
  // TTL over the whole band was harmless. Now that non-HTML revalidates, 304
  // (which is *in* that band and is not a representation) would be stored
  // as one and handed to the next client, conditional request or not.
  // 300-303 and 305-399 keep the hour; 304 gets zero and the ranges no
  // longer overlap, so nothing depends on how Cloudflare resolves a specific
  // status against a range that contains it. (GEO audit 2026-08-27, M1.)
  const cacheTtlByStatus = {
    "200-299": EDGE_TTL_SECONDS,
    "300-303": 3600,
    304: 0,
    "305-399": 3600,
    404: 300,
    "500-599": 0,
  };

  let response = await fetch(originRequest, {
    cf: { cacheEverything: true, cacheTtlByStatus },
  });

  // Rail for the classifier above: a 304 carries no Content-Type, so it
  // falls through the `text/html` gate below and would be handed to the
  // client verbatim: the exact shape of the A9 failure. Unreachable while
  // `mayBeHtml` gates the strip; kept so a future edit to that condition
  // cannot silently reopen A9.
  //
  // The recovery re-fetches WITHOUT the conditional headers. That detail is
  // the whole rail: re-sending the client's own request would let the edge
  // answer 304 again, this time out of the stored placeholder copy, and the
  // client would apply RFC 9111 §4.3.4: a `nonce-NGINX_CSP_NONCE` CSP over
  // a body whose nonce is already minted. That IS A9, so a rail that did
  // that would be a re-run of the bug it watches. Without conditionals the
  // answer must carry a body, and it is then fed back through the normal
  // path: minted if it holds the placeholder, sent to the pass-through rail
  // if it does not. The verdict is carried into whichever exit runs, so the
  // request still writes exactly one datapoint.
  let response304Recovered = false;
  if (response.status === 304 && mayBeHtml) {
    const retry = new Request(originUrl.href, request);
    retry.headers.set("X-Edge-Nonce-Key", env.EDGE_NONCE_KEY);
    retry.headers.delete("range");
    retry.headers.delete("if-range");
    retry.headers.delete("if-none-match");
    retry.headers.delete("if-modified-since");
    response = await fetch(retry, {
      cf: { cacheEverything: true, cacheTtlByStatus },
    });
    response304Recovered = true;
  }
  const verdict = (v) => (response304Recovered ? "bypass-unexpected-304" : v);

  // A redirect is no document and holds no nonce, so it gets no mint. It is
  // checked ahead of the text/html gate because nginx labels its 3xx body
  // text/html. Before this, a 3xx with no CSP at all (every `location`
  // redirect: /feed, /docs/<project>, /github, the retired blog URLs) failed
  // the placeholder test below and went down the rail, a second uncached fetch
  // to the origin on every request, about 215 a day; and a 3xx with the
  // placeholder (the slash 301, /cv -> /cv/) was minted and sent `no-store`.
  // Both are now served from the stored copy, with the query put back.
  // The rail still takes a 3xx whose CSP carries a REAL nonce, and also any
  // 3xx with a CSP that is not the placeholder: that is the shape of nginx's
  // RSS fallback (`return 302 /feeds/` when Sec-Fetch-Dest is `document`),
  // which depends on a request header the cache key ignores, so its stored
  // copy must never be fanned out to feed readers. (Edge audit 2026-11-04, J24.)
  const isRedirect =
    response.status >= 300 && response.status < 400 && response.status !== 304;
  const redirectCsp = response.headers.get("content-security-policy") ?? "";
  if (isRedirect && (redirectCsp === "" || redirectCsp.includes(PLACEHOLDER))) {
    logReq(
      response.status,
      verdict(response.headers.get("cf-cache-status") ?? ""),
      response,
    );
    return redirectResponse(response, url);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    logReq(
      response.status,
      verdict(response.headers.get("cf-cache-status") ?? ""),
      response,
    );
    // The two feeds answer a browser navigation (Sec-Fetch-Dest: document)
    // with the 302 to /feeds/ above and everyone else with the XML, so the XML
    // must say it varies on that header. Without it, a browser that fetched the
    // feed (Sec-Fetch-Dest: empty) could reuse that stored XML for a later
    // navigation for up to max-age, and show raw XML instead of /feeds/.
    // (Edge audit 2026-11-04, J23.)
    if (url.pathname === "/rss.xml" || url.pathname === "/es/rss.xml") {
      const varied = new Response(response.body, response);
      varied.headers.append("vary", "Sec-Fetch-Dest");
      return varied;
    }
    return response;
  }

  // Safety rail: only serve from the placeholder copy. A response whose CSP
  // already carries a real nonce must never be fanned out to more visitors.
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp.includes(PLACEHOLDER)) {
    const passthrough = await fetch(request);
    const headers = new Headers(passthrough.headers);
    headers.set("X-Edge-Nonce", "bypass-no-placeholder");
    logReq(passthrough.status, verdict("bypass-no-placeholder"), passthrough);
    return new Response(passthrough.body, {
      status: passthrough.status,
      headers,
    });
  }

  // Fresh 128-bit nonce per visitor.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  const body = (await response.text()).replaceAll(PLACEHOLDER, () => nonce);

  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    csp.replaceAll(PLACEHOLDER, () => nonce),
  );
  // The minted nonce must never be cached downstream.
  headers.set(
    "cache-control",
    "no-store, no-cache, must-revalidate, max-age=0",
  );
  // The edge stamps its own fill time as Last-Modified on the stored copy (the
  // origin sends none for HTML), so /about/ claimed to have changed at the last
  // cache fill while its sitemap entry and JSON-LD gave the real date; and no
  // validator can describe a body whose nonce differs on every response. Both
  // go, as on edge-nonce-mcp. (Edge audit 2026-11-04, J12.)
  headers.delete("last-modified");
  headers.delete("etag");
  // Observability: worker ran + whether the edge had the placeholder copy.
  headers.set("X-Edge-Nonce", "minted");
  const subCache = response.headers.get("cf-cache-status");
  if (subCache) headers.set("X-Edge-Sub-Cache", subCache);

  logReq(response.status, verdict(subCache ?? "minted"), response);
  return new Response(body, { status: response.status, headers });
}
