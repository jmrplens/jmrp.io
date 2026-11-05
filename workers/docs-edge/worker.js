// cspell:words otros formado -- Spanish labels shared with the Telegraf Starlark (ua_class, referer host)
/**
 * docs-edge: per-request log for docs.jmrp.io, the GitHub Pages documentation
 * host. It forwards every request to GitHub Pages with two changes only: the
 * visitor location headers are left out (2026-11-04, forOrigin), and a Range
 * answer that is not a real range of the file becomes the whole file (see
 * below). It writes ONE Analytics Engine datapoint per request that reaches
 * it to the `docs_edge_requests` dataset, the same record edge-nonce keeps for
 * jmrp.io. Not every request does: the account's Bulk Redirect rule (list
 * `phonometry_retired`, the retired phonometry addresses, 301 with the query
 * kept) answers before any Worker runs, so those 301s are neither logged here
 * nor counted against the Workers quota (README, "Cloudflare settings").
 *
 * Two things on top of the pass-through, both from the first day of logs
 * (2026-10-14):
 * - Edge caching by GitHub's own Cache-Control (max-age=600). HTML reached
 *   GitHub on every request (cf-cache-status DYNAMIC), and crawler bursts
 *   (ClaudeBot fetching a page's images at once) drew 503s from GitHub.
 *   cacheEverything lets the edge keep any response GitHub marks cacheable,
 *   for GitHub's max-age (600 s) counted from the moment the edge stored it:
 *   the edge ignores the Age header of GitHub's own CDN (D17), so a copy
 *   already aged there lives the full 600 s here as well. A deploy therefore
 *   shows up within ten minutes only if GitHub purges its CDN when it
 *   publishes (not measured); otherwise it can take up to twenty. 5xx are
 *   never cached. The query string stays in the cache key on purpose:
 *   pagefind 1.5.2 asks for `pagefind-entry.json?ts=<Date.now()>` to get
 *   past caches, and GitHub itself ignores the query (D15).
 * - Legacy redirects: /assets/pdf/* was the PDF tree of the site that
 *   jmrplens.github.io used to be; those files now live under
 *   https://jmrp.io/pdf/ with the same layout, and old links still arrive.
 *
 * Why it exists: GitHub Pages offers no access logs and no site analytics
 * (a repository's Insights > Traffic counts github.com views, not the Pages
 * site), and the origin cannot run anything. The edge is the only place a
 * request to the documentation can be seen.
 *
 * Contract: the logging block below (NAMED_AGENTS through logEdgeRequest) is
 * a VERBATIM copy of workers/edge-nonce/worker.js, except requestClass,
 * which strips the /<repo> prefix first. The blob layout is an API contract
 * with scripts/ae-to-influx.mjs (EDGE_SITES, site "docs") and the daily
 * report: change both workers together, append, never reorder.
 *
 * Serving never depends on logging: a failed write is swallowed, a
 * pass-through that throws becomes a plain 502 ("origin-error"), and the route
 * is configured with request_limit_fail_open, so an exhausted Workers quota
 * sends traffic straight to GitHub instead of an error page. That fail-open
 * path runs none of this file: GitHub then gets the request as the zone
 * builds it, visitor location headers included (README, "Visitor location").
 *
 * Markdown negotiation (decision D6, 2026-10-29; markdown-negotiation.js):
 * a GET or HEAD whose Accept PREFERS text/markdown, for a path ending in
 * `/`, on any project, gets a 302 to `<path>index.md` when a probe finds that
 * twin (a literal 200 text/markdown), with Vary: Accept and no-store, logged
 * as status 302, verdict "markdown-negotiation". Without a twin it falls
 * through to the pass-through. Every other request is not negotiated. The
 * probe and the pass-through fetch with the same cf options (EDGE_CACHE_CF),
 * so a probe fills the shared `<page>/index.md` cache entry exactly as a
 * direct request would.
 *
 * Twin announcement (2026-10-31, announceTwin): a 200 HTML answer to a GET or
 * HEAD for a slash page whose twin exists gets
 * `Link: <twin>; rel="alternate"; type="text/markdown"`, found with the same
 * probe, and `Accept` appended to its Vary (N13, 2026-11-03: GitHub's
 * `Accept-Encoding` becomes `Accept-Encoding, Accept`), because the same URL
 * answers a Markdown-preferring client with the 302. The 304 that
 * revalidates such a page and a 206 with part of it get the same Vary and no
 * Link: RFC 9110 requires them to carry the Vary of the 200, and a cache
 * that freshens its stored page with a 304 takes the 304's Vary. Every other
 * answer is the origin's response object, Vary included, as before.
 *
 * Probe cost (F07, 2026-11-04): every GET or HEAD for a slash path starts the
 * announcement probe beside the pass-through instead of after it, so on a
 * miss the two no longer add up; the probe is aborted after 1 s (no twin),
 * and a page without a twin is remembered as such for 600 s in a Cache API
 * namespace of its own (markdown-negotiation.js, VERDICT_CACHE).
 *
 * Range requests on compressed files (2026-11-04, isCompressedPartial): the
 * edge keeps the gzip GitHub sends and measures a range against it, so a 206
 * or a 416 for such a file says nothing about the file itself. The request is
 * sent again without its Range and answered with the whole file, which RFC 9110
 * section 14.2 allows. Since F07 a 206 or a 416 for a type outside
 * RANGE_SAFE_EXTENSIONS gets the whole file too, whatever its label says, so
 * the rule no longer rests on GitHub sending gzip. Video, PDF, raster images
 * and fonts keep their ranges.
 *
 * The security headers (CSP, X-Frame-Options and the rest) are NOT set here:
 * they come from the zone's response header Transform Rules (README).
 */

import {
  announceTwin,
  EDGE_CACHE_CF,
  markdownRedirect,
  markdownTwin,
  mediaType,
  startTwinProbe,
  VERDICT_CACHE,
} from "./markdown-negotiation.js";

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

/**
 * Request class (index1) for docs.jmrp.io. Every project site lives under
 * /<repo>/, so the class is decided on the path AFTER that first segment:
 * a project's /llms.txt, /_astro/ and sitemap classify exactly as jmrp.io's
 * do. Files at the host root (robots.txt, the hub sitemap, the IndexNow key)
 * keep their plain path.
 *
 * @param {string} fullPath - The request path, prefix included.
 * @returns {string} The class.
 */
function requestClass(fullPath) {
  const m = /^\/[^/]+(\/.*)$/.exec(fullPath);
  const p = m ? m[1] : fullPath;
  if (p.endsWith(".md")) return "md-twin";
  if (p.endsWith(".txt") && p.includes("llms")) return "llms-txt";
  if (p.endsWith(".pdf")) return "pdf";
  if (p.endsWith(".xml")) return "feed-xml";
  if (
    p.startsWith("/_astro/") ||
    p.startsWith("/assets/") ||
    p.startsWith("/pagefind/")
  ) {
    return "asset";
  }
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

/**
 * The request headers the zone's "Add visitor location headers" Managed
 * Transform adds before this Worker runs (the managed transform is zone-wide,
 * and jmrp.io's nginx logs them). GitHub has no use for them, so the
 * pass-through leaves them out (2026-11-04). A Request Header Transform Rule
 * cannot do it: Cloudflare refuses to modify or remove `cf-` headers there.
 * What GitHub still gets, and what it gets when this Worker fails open, is
 * in the README ("Visitor location").
 */
const VISITOR_LOCATION_HEADERS = [
  "cf-ipcity",
  "cf-ipcountry",
  "cf-ipcontinent",
  "cf-iplatitude",
  "cf-iplongitude",
  "cf-region",
  "cf-region-code",
  "cf-metro-code",
  "cf-postal-code",
  "cf-timezone",
];

/**
 * The request as GitHub gets it: the client's own request when it carries
 * none of VISITOR_LOCATION_HEADERS, otherwise a copy without them (method,
 * body, redirect mode and every other header kept). The log still reads the
 * client's request, so Analytics Engine records exactly what it did before.
 *
 * @param {Request} request - The client's request.
 * @returns {Request} The request to forward.
 */
function forOrigin(request) {
  if (VISITOR_LOCATION_HEADERS.every((name) => !request.headers.has(name))) {
    return request;
  }
  const headers = new Headers(request.headers);
  for (const name of VISITOR_LOCATION_HEADERS) headers.delete(name);
  return new Request(request, { headers });
}

/**
 * Types the edge stores as they are, so a byte range of them is a real one.
 * The same list as workers/edge-nonce/worker.js, edge-nonce-mcp and the
 * Cache Rule "a Range request skips the cache" (83d49da1): keep the four in
 * step. A 206 or a 416 for any other type is answered with the whole file.
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
 * Whether the request names a type whose ranges the edge cuts from the
 * file's own bytes (RANGE_SAFE_EXTENSIONS). A path with no extension (every
 * page) is not.
 *
 * @param {Request} request - The client's request.
 * @returns {boolean} True for a listed extension.
 */
function isRangeSafe(request) {
  const extension = /\.([a-z\d]+)$/i.exec(new URL(request.url).pathname)?.[1];
  return RANGE_SAFE_EXTENSIONS.has(extension?.toLowerCase());
}

/**
 * Whether an answer is the compressed copy the edge stores.
 *
 * @param {Response} response - The pass-through's response.
 * @returns {boolean} True for a Content-Encoding other than identity.
 */
function isCompressed(response) {
  const coding = (response.headers.get("content-encoding") ?? "").toLowerCase();
  return coding !== "" && coding !== "identity";
}

/**
 * Whether a 206 was cut from the compressed copy. GitHub sends gzip to the
 * edge, and the edge cuts a range from those bytes, so Content-Range counts
 * the gzip. A client that takes gzip gets a piece of a gzip stream. Any other
 * client gets whatever the edge makes of that piece, with no Content-Encoding:
 * an empty body for a short range from the start, raw gzip bytes from the
 * middle, text that does not match the Content-Range for a longer one
 * (measured live on all seven projects, 2026-11-04). Files GitHub does not
 * compress (video, PDF, raster images) are cut from their own bytes and never
 * match, so a player's Range requests keep working.
 *
 * @param {Response} response - The pass-through's response.
 * @returns {boolean} True for a compressed 206.
 */
function isCompressedPartial(response) {
  return response.status === 206 && isCompressed(response);
}

/**
 * The same request for the whole file. RFC 9110 section 14.2 lets a server
 * ignore Range, and the whole file is right for every client, while a range of
 * the uncompressed bytes is not something the edge cache can give. If-Range
 * goes too: it only means something beside a Range.
 *
 * @param {Request} request - The client's request.
 * @returns {Request} The request with no Range and no If-Range.
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

/**
 * Lets go of a response whose body will not be read. A body that cannot be
 * cancelled changes nothing about the answer, so it must not become a 502.
 *
 * @param {Response} response - The response to drop.
 * @returns {Promise<void>} Settled once it is released.
 */
async function release(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing is waiting on this body.
  }
}

/**
 * The pass-through, with the one correction Range requests need on compressed
 * files. A compressed 206 is replaced by the whole file. A 416 cannot be
 * trusted either: the edge compared the range with the gzip size, so a range
 * inside the file but past the gzip answers 416, which `curl -C -` and
 * `wget -c` read as "already complete", leaving a truncated download and a
 * success. Only the whole file can say whether that 416 is real: if it is
 * compressed, it is the answer; otherwise the 416 was measured against the
 * file's own bytes and stands. HTML counts as compressed whatever its label
 * says: the whole page reaches the Worker with no Content-Encoding, where its
 * 206 carries one (measured live, 2026-11-04, the same pages whose 200 has lost
 * its ETag), and a real 416 replaced by a page is still a right answer. Other
 * methods never get here, so a request body is never read twice.
 *
 * @param {Request} request - The client's request.
 * @returns {Promise<Response>} The answer to send on.
 */
async function passThrough(request) {
  const rangeSafe = isRangeSafe(request);
  // A type outside the list never gets a real range from the edge, so its
  // Range is not sent at all: the cached whole file comes back with a 200.
  // Sent, a malformed one such as `bytes=-0,-0` made the edge throw.
  let outgoing = forOrigin(request);
  if (!rangeSafe && outgoing.headers.has("range")) {
    outgoing = withoutRange(outgoing);
  }
  const cf = { ...EDGE_CACHE_CF };
  const response = await fetchOrWhole(outgoing, { cf });
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  // The label decides first, because it is the stronger proof; the list is the
  // second condition (F07), so a compressed copy GitHub ever sends unlabelled,
  // or labelled with a coding this file does not know, still gets the whole file.
  if (
    isCompressedPartial(response) ||
    (response.status === 206 && !rangeSafe)
  ) {
    await release(response);
    return fetch(withoutRange(outgoing), { cf: { ...EDGE_CACHE_CF } });
  }
  if (response.status === 416) {
    const whole = await fetch(withoutRange(outgoing), {
      cf: { ...EDGE_CACHE_CF },
    });
    if (
      whole.status === 200 &&
      (isCompressed(whole) || mediaType(whole) === "text/html" || !rangeSafe)
    ) {
      await release(response);
      return whole;
    }
    await release(whole);
  }
  return response;
}

/**
 * The probe options for one request: the verdict namespace, opened at most
 * once and only when a probe asks for it, and ctx.waitUntil for the work that
 * must not hold the answer (the announcement probe, a verdict being stored).
 * Without a Cache API (a test, another runtime) there is no verdict store,
 * and without a ctx the work is simply not kept alive past the answer.
 *
 * @param {ExecutionContext | undefined} ctx - The invocation's context.
 * @returns {import("./markdown-negotiation.js").ProbeOptions} The options.
 */
function probeOptions(ctx) {
  let opened = null;
  return {
    verdicts: () => {
      if (opened === null && typeof caches !== "undefined") {
        opened = caches.open(VERDICT_CACHE);
        opened.catch(() => {});
      }
      return opened;
    },
    defer: (promise) => {
      try {
        ctx?.waitUntil(promise);
      } catch {
        // No context to keep it alive: it still runs while the answer streams.
      }
    },
  };
}

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now();
    const url = new URL(request.url);
    const LEGACY_PDF = "/assets/pdf/";
    if (url.pathname.startsWith(LEGACY_PDF)) {
      const target = `https://jmrp.io/pdf/${url.pathname.slice(LEGACY_PDF.length)}`;
      const redirect = Response.redirect(target, 301);
      logEdgeRequest({
        env,
        request,
        url,
        startedAt,
        status: 301,
        cacheStatus: "legacy-redirect",
        response: redirect,
      });
      return redirect;
    }
    // Markdown negotiation, after the legacy redirect (which keeps answering
    // its 301 whatever the Accept) and ahead of the cache: the edge cache keys
    // by URL and ignores Accept, so the decision cannot live behind it. A
    // request that does not prefer Markdown returns null here before any
    // subrequest; markdownTwin never throws.
    const options = probeOptions(ctx);
    const twin = await markdownTwin(request, url, undefined, options);
    if (twin !== null) {
      const negotiated = markdownRedirect(twin);
      logEdgeRequest({
        env,
        request,
        url,
        startedAt,
        status: 302,
        cacheStatus: "markdown-negotiation",
        response: negotiated,
      });
      return negotiated;
    }
    // The announcement probe runs beside the pass-through (F07), not after it.
    // It never rejects; waitUntil lets it finish, and store its verdict, even
    // when the answer turns out not to need it (a 404 on a slash path).
    const probe = startTwinProbe(request, url, undefined, options);
    if (probe !== null) options.defer(probe);
    let response;
    try {
      response = await passThrough(request);
    } catch {
      logEdgeRequest({
        env,
        request,
        url,
        startedAt,
        status: 502,
        cacheStatus: "origin-error",
        response: null,
      });
      return new Response("origin unreachable", { status: 502 });
    }
    response = await announceTwin(request, url, response, undefined, probe);
    logEdgeRequest({
      env,
      request,
      url,
      startedAt,
      status: response.status,
      cacheStatus: response.headers.get("cf-cache-status") ?? "",
      response,
    });
    return response;
  },
};
