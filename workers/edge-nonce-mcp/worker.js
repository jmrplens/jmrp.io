// cspell:words otros formado -- Spanish labels shared with the Telegraf Starlark (ua_class, referer host)
/**
 * Per-visitor CSP nonces over HTML cached at the edge, for mcp.jmrp.io.
 *
 * A copy of jmrp.io's Worker, without its RSS logic (there are no feeds here).
 *
 * ── Per-request record (Analytics Engine, 2026-09-05) ─────────────────────
 * As on jmrp.io: ONE datapoint per request in the `mcp_edge_requests` dataset
 * (binding REQS), written at the EXIT of every path so it carries the final
 * status and the cache verdict. The blob layout is an API contract with
 * scripts/ae-to-influx.mjs in the jmrp.io repo (which puts the requests served
 * only at the edge into `nginx_access`, `site=mcp`): extend, never reorder. A
 * failed write never costs a page.
 *
 * ── The OAuth code stays out of the logs (2026-11-04) ─────────────────────
 * /inspector/callback/?code=...&state=... is where GitLab sends the sign-in
 * popup back. The code belongs to the browser: the page reads it from its own
 * address and hands it to its opener, and nothing server-side needs it. Layers,
 * because each covers what another cannot:
 *  - A URL Rewrite Rule drops that query at the edge, ahead of this worker and
 *    whether or not it runs: a route in fail-open reaches nginx directly. A
 *    Request Header Transform Rule does the same for a Referer naming the page.
 *    Both are in the README.
 *  - If those rules ever go, this file still holds: the subrequest carries no
 *    query, the record keeps the parameter names and no value (loggedQuery,
 *    safeReferer), and the page says `Referrer-Policy: no-referrer`. Chromium
 *    ignores that for fonts in an inline <style>, which is why the rule exists.
 *  - Cloudflare's Workers Logs is the script setting
 *    `observability.redact_query_string`, in wrangler.toml.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * The site's CSP is nonce-based, so every HTML response is unique and the
 * origin serves it `no-store`: a static site giving up its CDN. Caching a page
 * with its nonce would make visitors share it, which is exactly what nonces
 * exist to prevent.
 *
 * ── How it works ──────────────────────────────────────────────────────────
 * 1. The Worker asks the origin with the secret header (X-Edge-Nonce-Key).
 *    nginx then sets $cspNonce to the literal "NGINX_CSP_NONCE", its sub_filter
 *    becomes a no-op, and the page leaves with the placeholder intact in the
 *    body and in the CSP header. That is the copy the edge caches.
 * 2. Per request, the Worker mints a 128-bit nonce and replaces the placeholder
 *    in body and header. The browser is told `private, no-cache`, so nothing
 *    downstream can reuse a minted nonce for a different document.
 *
 * ── The safety rail (do not remove) ───────────────────────────────────────
 * If nginx does not recognize the secret (rotated, typo, reverted config), the
 * origin substitutes a real nonce BEFORE anything is cached, and a real nonce
 * cached and served to anyone is the very vulnerability nonces prevent. So the
 * Worker refuses to serve any response whose CSP header lacks the placeholder:
 * it falls back to an uncached pass-through and says so in X-Edge-Nonce.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 * /libgen* and /gitlab* must NOT come through here: they are a live proxy with
 * SSE responses and healthchecks. They are zone routes WITHOUT a worker, which
 * win by being more specific than mcp.jmrp.io/*. The Worker passes anything
 * other than GET/HEAD straight through, so real MCP traffic (POST) would be
 * safe anyway, but a GET /libgen/health would be cached.
 */
const PLACEHOLDER = "NGINX_CSP_NONCE";

/**
 * Statuses whose responses carry no body. Passing one to the `Response`
 * constructor throws a RangeError, and 304 is a live path here: a
 * conditional request for any static asset lands on it.
 */
const BODYLESS_STATUSES = new Set([204, 205, 304]);

/**
 * A fresh 128-bit nonce, hex. One per response, never reused.
 *
 * Shared by both paths: the HTML path substitutes it into the body and the
 * header, the non-HTML path into the header alone.
 *
 * @returns {string} 32 hex characters.
 */
function mintNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
/**
 * Types the edge stores as they are, so a byte range of them is a real one. The
 * same list as edge-nonce and the Cache Rule "a Range request skips the cache"
 * (83d49da1), which guards the routes that never reach this worker (/_astro/,
 * /assets/). Keep the three in step.
 */
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

/**
 * The parameters an OAuth authorization response may carry (RFC 6749 section
 * 4.1.2, RFC 9207). Their NAMES are safe to record and tell a code from an error.
 * Any other name folds into "other", so a value that arrives where a name should
 * be (`?abc123`, `?code%3Dabc123`) is not stored either.
 */
const OAUTH_QUERY_KEYS = new Set([
  "code",
  "state",
  "error",
  "error_description",
  "error_uri",
  "iss",
]);

/**
 * Whether a path is the OAuth callback, in either language.
 *
 * Generous on purpose: decoded, any case, repeated slashes, with or without the
 * trailing slash and with anything after it. A false positive costs one row its
 * query; a false negative stores a credential. /es/ has no such page today, and
 * is covered should a redirect URI ever be registered there.
 *
 * @param {string} pathname - A URL path.
 * @returns {boolean} True for the callback.
 */
function isOauthCallback(pathname) {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    // A malformed escape: test the path as it came.
  }
  return /^\/+(?:es\/+)?inspector\/+callback(?:\/|$)/i.test(path);
}

/**
 * The names in a callback's query, never a value: `?code=x&state=y` gives
 * `code&state`.
 *
 * @param {string} search - A URL query, with or without the leading "?".
 * @returns {string} The names joined by "&", or "" when there are none.
 */
function callbackQueryKeys(search) {
  const keys = new Set();
  for (const key of new URLSearchParams(search).keys()) {
    keys.add(OAUTH_QUERY_KEYS.has(key) ? key : "other");
  }
  return [...keys].join("&");
}

/**
 * What blob 19 stores: the query, except on the callback, where only its names.
 *
 * @param {URL} url - The request URL.
 * @returns {string} The query to record, with no leading "?".
 */
function loggedQuery(url) {
  if (isOauthCallback(url.pathname)) return callbackQueryKeys(url.search);
  return url.search.slice(1, 129);
}

/**
 * A Referer fit to store or forward. Under `strict-origin-when-cross-origin` a
 * same-origin request sends the page's whole address, query included. The callback
 * page now says `no-referrer`, so this is the second line, for a client that sends
 * the header regardless.
 *
 * @param {string} referer - The raw header, "" when absent.
 * @returns {string} The same header, with a callback URL's query reduced to names.
 */
function safeReferer(referer) {
  if (!referer) return "";
  let parsed;
  try {
    parsed = new URL(referer);
  } catch {
    // Not an absolute URL, so its path cannot be read. Cut the query of anything
    // that names the callback rather than decide it is harmless.
    const query = referer.indexOf("?");
    return query !== -1 && /inspector\/+callback/i.test(referer)
      ? referer.slice(0, query)
      : referer;
  }
  if (!parsed.search || !isOauthCallback(parsed.pathname)) return referer;
  const keys = callbackQueryKeys(parsed.search);
  const query = keys ? `?${keys}` : "";
  return `${parsed.origin}${parsed.pathname}${query}`;
}

/**
 * The request a pass-through path may send to the origin: the one that came, less
 * the callback's query and any callback URL in the Referer, because nginx writes
 * both to its access log. The page is static and reads its query in the browser,
 * so the origin loses nothing.
 *
 * @param {Request} request - The incoming request.
 * @returns {Request} A request safe to forward.
 */
function passthroughRequest(request) {
  const url = new URL(request.url);
  const referer = request.headers.get("referer") ?? "";
  const safe = safeReferer(referer);
  const callback = isOauthCallback(url.pathname);
  if (!callback && safe === referer) return request;
  if (callback) url.search = "";
  const clean = new Request(url.href, request);
  if (referer) clean.headers.set("referer", safe);
  return clean;
}

// Cached placeholder copy; purged with the zone on every deploy.
//
// 5 minutes, not the 24 h it used to be: the pages now carry server-side
// injected live data (each MCP's version and how many of its three instances
// are up). At 24 h the edge would have frozen that for a day, which is worse
// than not showing it: a status panel that lies is a liability, and the whole
// point of injecting it at the origin is that crawlers and no-JS readers see
// real numbers.
//
// The cost is negligible here: two static pages served from a local origin, so
// a miss is cheap. It stays well above the injection's own cache window so the
// edge is never the thing forcing a re-fetch.
const EDGE_TTL_SECONDS = 300;

/**
 * Pages that publish no markdown twin, so negotiation must not offer one.
 *
 * Two pages, and both decline an identity everywhere else too: no canonical,
 * no graph, noindex, no `index.md.ts` route. The OAuth callback is a popup
 * that closes itself; the Spanish 404 is an error body that happens to be
 * served from a directory, so unlike the English one it ends in a slash and
 * would otherwise look like a page here. Redirecting either to a twin it does
 * not have would answer a negotiating client with a 404, which is worse than
 * not negotiating at all.
 */
const NO_TWIN = new Set(["/inspector/callback/", "/es/404/"]);

/**
 * Whether a path addresses a page rather than a file.
 *
 * Every page on this site ends in a slash and every twin is that path plus
 * `index.md`, so the test is the trailing slash. Files (/llms.txt,
 * /servers.json, the twins themselves) do not match and are served as they
 * are. The MCP endpoints never reach this worker: they are zone routes with
 * no worker, which outrank `mcp.jmrp.io/*`.
 *
 * "The MCP endpoints" was too narrow until 2026-09-03 and this comment was
 * wrong by omission: `/gitlab*` and `/libgen*` were excluded, but the OAuth
 * discovery documents hang off the host ROOT, not off the endpoint path, so
 * they fell through to this worker and were cached with `cacheEverything`.
 * They now have bypass routes of their own; see the table in README.md.
 *
 * @param pathname The request's path.
 * @returns True when the path is a page that should have a twin.
 */
function isPage(pathname) {
  return pathname.endsWith("/");
}

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
 * with no query, so the query goes back on here. A target with its own query or a
 * fragment stays as it is: a query after a fragment is malformed.
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
 * Blobs 18 and 19 never hold the OAuth code: on the callback, and in a Referer
 * naming it, only the query's parameter names are stored (safeReferer,
 * loggedQuery). Do not add a field that carries the URL or the Referer raw.
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
        safeReferer(h("referer")).slice(0, 200),
        loggedQuery(url),
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

/**
 * The same request without Range and If-Range.
 *
 * @param {Request} request - The request.
 * @returns {Request} A copy with no range headers.
 */
function withoutRange(request) {
  const headers = new Headers(request.headers);
  headers.delete("range");
  headers.delete("if-range");
  return new Request(request, { headers });
}

/**
 * Fetches a request and, when the edge rejects one that carries a Range,
 * fetches it once more without it. Cloudflare throws on some ranges instead of
 * answering them (`bytes=-0,-0`, which the origin answers 416), and a server
 * may always ignore Range (RFC 9110, 14.2), so the whole file is a valid
 * answer where a 502 is not.
 *
 * @param {Request} request - The request to send.
 * @param {RequestInit} [init] - Options for fetch, such as `cf`.
 * @returns {Promise<Response>} The answer.
 */
async function fetchOrWhole(request, init) {
  try {
    return await fetch(request, init);
  } catch (error) {
    if (!request.headers.has("range")) throw error;
    return fetch(withoutRange(request), init);
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
        return await fetchOrWhole(passthroughRequest(request));
      } catch {
        return new Response("origin unreachable", { status: 502 });
      }
    }
  },
};

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
  // is still logged, with the origin's verdict.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const passthrough = await fetch(passthroughRequest(request));
    logReq(passthrough.status, "passthrough", passthrough);
    return passthrough;
  }

  // Content negotiation for AI agents: a client that prefers text/markdown over
  // HTML gets 302'd from a page to that page's own twin, `<page>index.md`. Same
  // parser as jmrp.io and docs.jmrp.io (prefersMarkdown): q=0 is a refusal, a
  // client that prefers HTML gets HTML, and the media type is case-insensitive.
  // No browser prefers text/markdown, so human traffic is untouched.
  //
  // This MUST live in the worker and not at the origin: the edge cache is
  // keyed by URL and ignores request headers, so an origin-issued redirect
  // would be cached and then served to browsers as well. The 302 itself is
  // never cached.
  //
  // Only pages: files (/llms-full.txt, the twins) are served as they are, and
  // the MCP endpoints are POST-only and bypass this worker entirely.
  //
  // Decided here, answered AFTER the page has been fetched (below): a blind
  // 302 sent `/nope/` with `Accept: text/markdown` to a twin that does not
  // exist either, 302 then 404, where a page that does not exist should be a
  // 404 in either representation (GEO audit #4, 2026-09-22). One cached fetch
  // of the page is the price; the 302 itself is still never cached.
  const negotiatesMarkdown =
    isPage(url.pathname) &&
    !NO_TWIN.has(url.pathname) &&
    prefersMarkdown(request.headers.get("accept"));

  // The subrequest carries no query. Every file and page here is static, so the
  // query only ever split the cache and reached nginx's log, where the OAuth code
  // has no business being. A redirect gets it back in redirectResponse, and the
  // browser keeps its own address, which is where the pages read it.
  const originUrl = new URL(request.url);
  originUrl.search = "";
  const originRequest = new Request(originUrl.href, request);
  originRequest.headers.set("X-Edge-Nonce-Key", env.EDGE_NONCE_KEY);
  const incomingReferer = request.headers.get("referer");
  if (incomingReferer) {
    originRequest.headers.set("referer", safeReferer(incomingReferer));
  }
  // A page's 200 carries no validators (see below), so no browser can ever
  // revalidate one. A client that sends a conditional anyway (a crawler, a
  // heuristic cache) had it forwarded to the edge cache, which answered a
  // bodyless 304 carrying its own fill time as `last-modified` and no
  // `vary: Accept`: the two headers the 200 corrects, back again (GEO audit
  // #4, 2026-09-22). Stripped here so the cache always answers with the
  // representation. Files keep theirs: a 304 on a static asset is correct.
  if (isPage(url.pathname)) {
    originRequest.headers.delete("if-modified-since");
    originRequest.headers.delete("if-none-match");
  }

  // Range is dropped unless the extension proves the file is stored as it is. The
  // edge caches text as the Brotli nginx gave it and measures a range against that,
  // so bytes=0-99 of /llms.txt answered "0-99/2675" on an 11,622 byte file: an empty
  // body or raw Brotli with no Content-Encoding, and a 416 for a range inside the
  // file, which curl -C - and wget -c read as complete. RFC 9110 section 14.2 lets a
  // server ignore Range, so these get the whole file. One-sided on purpose: an
  // unlisted type costs a whole download, a wrongly listed one a corrupt file.
  const extension = /\.([a-z\d]+)$/i.exec(url.pathname)?.[1]?.toLowerCase();
  if (!RANGE_SAFE_EXTENSIONS.has(extension)) {
    originRequest.headers.delete("range");
    originRequest.headers.delete("if-range");
  }

  const response = await fetch(originRequest, {
    cf: {
      cacheEverything: true,
      // Per-status TTLs: success gets the full TTL, redirects and 404s a
      // short one, and origin errors are never cached: a 5xx burst must
      // not be frozen into the edge for a day.
      cacheTtlByStatus: {
        "200-299": EDGE_TTL_SECONDS,
        "300-399": 3600,
        404: 300,
        "500-599": 0,
      },
    },
  });

  if (negotiatesMarkdown && response.status === 200) {
    await response.body?.cancel();
    logReq(302, "markdown-negotiation");
    return new Response(null, {
      status: 302,
      headers: {
        // The page's OWN twin, not the site-wide corpus. This used to send
        // every negotiating client to /llms-full.txt, which had three
        // problems at once: /es/ was answered with the ENGLISH corpus, since
        // there is no Spanish one; the target was not the document the page
        // itself advertises in its `Link` header and its `<link
        // rel="alternate">`; and it landed on text/plain, so a client that
        // asked for text/markdown never got any. Only 2 of the 72 pages
        // negotiated at all, while all 72 have a twin.
        // Built by twinUrl and never by resolving a string against the URL: see
        // its comment for the `//evil.example/` case.
        location: twinUrl(url).href,
        // Open to other origins, like the twin it points to (decision A8): the
        // text is public and llms.txt, open too, links to it.
        "access-control-allow-origin": "*",
        vary: "Accept",
        "cache-control": "no-store",
        "x-edge-nonce": "markdown-negotiation",
      },
    });
  }

  // A redirect is no document and holds no nonce, so it gets no mint and no
  // `private, no-cache`: browsers may keep it, as they would any 308. It is checked
  // ahead of the text/html gate because nginx labels its 3xx body text/html. A 3xx
  // that already carries a real nonce still falls through to the rail below.
  const isRedirect =
    response.status >= 300 && response.status < 400 && response.status !== 304;
  const redirectCsp = response.headers.get("content-security-policy") ?? "";
  if (isRedirect && (redirectCsp === "" || redirectCsp.includes(PLACEHOLDER))) {
    logReq(response.status, response.headers.get("cf-cache-status"), response);
    return redirectResponse(response, url);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    // Non-HTML has no placeholder in its body, but the origin answered in
    // placeholder mode and its CSP HEADER still said NGINX_CSP_NONCE, so
    // every one of these went out advertising the literal placeholder:
    // robots.txt, llms.txt, humans.txt, sitemap-index.xml, /mcp, the action
    // JSON and every /.well-known/ document (measured 2026-09-10). Nothing
    // executes from a JSON or text document, so nothing ran that should not
    // have; the defect is that the site published a CSP naming a placeholder
    // and handed the mechanism's token to anyone reading headers.
    //
    // One nonce for the whole header, exactly as the HTML path does, so the
    // header has the same shape everywhere. The cached copy keeps the
    // placeholder, so no two visitors are served the same nonce.
    const cspOther = response.headers.get("content-security-policy") ?? "";
    if (!cspOther.includes(PLACEHOLDER)) {
      logReq(
        response.status,
        response.headers.get("cf-cache-status"),
        response,
      );
      return response;
    }
    const otherNonce = mintNonce();
    const otherHeaders = new Headers(response.headers);
    otherHeaders.set(
      "content-security-policy",
      cspOther.replaceAll(PLACEHOLDER, () => otherNonce),
    );
    otherHeaders.set("X-Edge-Nonce", "header-only");
    logReq(response.status, response.headers.get("cf-cache-status"), response);
    // 204, 205 and 304 carry no body, and the Response constructor throws a
    // RangeError if one is passed for those statuses. A conditional request
    // for a static asset lands here, so this is a live path, not a corner.
    const bodyless = BODYLESS_STATUSES.has(response.status);
    return new Response(bodyless ? null : response.body, {
      status: response.status,
      headers: otherHeaders,
    });
  }

  // Safety rail: only serve from the placeholder copy. A response whose CSP
  // already carries a real nonce must never be fanned out to more visitors.
  const csp = response.headers.get("content-security-policy") ?? "";
  if (!csp.includes(PLACEHOLDER)) {
    const passthrough = await fetch(passthroughRequest(request));
    const headers = new Headers(passthrough.headers);
    headers.set("X-Edge-Nonce", "bypass-no-placeholder");
    if (isOauthCallback(url.pathname))
      headers.set("referrer-policy", "no-referrer");
    logReq(passthrough.status, "bypass-no-placeholder", passthrough);
    return new Response(passthrough.body, {
      status: passthrough.status,
      headers,
    });
  }

  // Fresh 128-bit nonce per visitor.
  const nonce = mintNonce();

  const body = (await response.text()).replaceAll(PLACEHOLDER, () => nonce);

  const headers = new Headers(response.headers);
  headers.set(
    "content-security-policy",
    csp.replaceAll(PLACEHOLDER, () => nonce),
  );
  // The minted nonce must never be reused for a DIFFERENT document, and
  // `private, no-cache` is what says that while still allowing the back/
  // forward cache. The distinction is the whole point of the change:
  //
  //   - `no-store` forbade storing at all, which disqualified every page on
  //     this site from bfcache in Chrome and Safari. Going back re-fetched and
  //     re-parsed the page (verified: navType "back_forward" with the window
  //     state gone), and bfcache restores are what report near-zero LCP in
  //     field data, so the site was suppressing its own best samples.
  //   - A bfcache restore is the SAME document, in the same tab, for the same
  //     visitor. Its nonce is not shared with anyone. That was never the
  //     hazard.
  //   - The hazard is the HTTP cache: `no-cache` lets a stored response be
  //     reused after revalidation, and a `304` would hand back the stored body
  //     AND its stored headers: self-consistent, but the same nonce twice.
  //
  // That last case is closed by stripping the validators below, not by
  // hoping. With no `ETag` and no `Last-Modified` the browser has nothing to
  // revalidate with and must re-fetch, so a 304 cannot happen TO A BROWSER.
  // A client that sends a conditional regardless has it stripped before the
  // cache (see `originRequest` above); until 2026-09-22 the edge cache
  // answered those with a 304 of its own. The two lines are one mechanism:
  // do not remove either without the other.
  //
  // The safety rail above is untouched: a response whose CSP has already
  // lost the placeholder is still never fanned out.
  headers.set("cache-control", "private, no-cache");
  // Also honest, independently of the above: this `Last-Modified` was the
  // edge cache's fill time, not the content's date, so it contradicted the
  // per-page dates the graph and the sitemap publish.
  headers.delete("etag");
  headers.delete("last-modified");
  // This response is one of two representations of the same URL (the other
  // is the markdown twin the negotiation above redirects to), so it has to
  // say what it varies on. Only the 302 declared it, and the 302 is
  // `no-store` while THIS is the response the edge caches, so it was the one
  // that needed it. Appended to whatever the origin already varies on
  // (Accept-Encoding), never replacing it.
  const originVary = response.headers.get("vary");
  headers.set("vary", originVary ? `${originVary}, Accept` : "Accept");
  // The callback's address holds the OAuth code, and the page's subresources would
  // repeat it in their Referer to routes that never reach this worker (/_astro/
  // logs it at the origin). The page makes no request that needs a Referer.
  if (isOauthCallback(url.pathname))
    headers.set("referrer-policy", "no-referrer");
  // Observability: worker ran + whether the edge had the placeholder copy.
  headers.set("X-Edge-Nonce", "minted");
  const subCache = response.headers.get("cf-cache-status");
  if (subCache) headers.set("X-Edge-Sub-Cache", subCache);
  logReq(response.status, subCache, response);

  return new Response(body, { status: response.status, headers });
}
