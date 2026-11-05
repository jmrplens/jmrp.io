/**
 * Markdown negotiation for docs.jmrp.io (decision D6, 2026-10-29).
 *
 * A request that PREFERS text/markdown over HTML for a page gets a 302 to the
 * page's Markdown twin, when the twin exists. This is the docs.jmrp.io
 * counterpart of the block in workers/edge-nonce/worker.js (GEO audits
 * 2026-08-22 B19, 2026-08-27 A1 + M2), applied to EVERY project behind
 * docs-edge with no allow-list: phonometry, gitlab-mcp-server,
 * cs-routeros-bouncer, mikroscope, Cloudflare-DNS-Updater, libgen-mcp,
 * ghchronicle and the hub at the root.
 *
 * One convention, one rule. The survey of 2026-10-29 (the 1,565 sitemap
 * pages of all eight sites, kept in the phonometry repository's working
 * notes) found a single twin convention in use: `<pathname>index.md`
 * for a pathname ending in `/`, the llms.txt form for a URL with no file
 * name. phonometry, mikroscope, libgen-mcp and ghchronicle publish it, and
 * every twin answers a literal 200 `text/markdown; charset=utf-8`;
 * gitlab-mcp-server, cs-routeros-bouncer, Cloudflare-DNS-Updater and the hub
 * publish no twin at all (their agent channel is llms*.txt), and
 * `<pathname>index.md` answers 404 there, as it does on phonometry's two
 * homes and its Spanish API fallbacks. No page anywhere declares any other
 * twin location. So there is no per-project table: the Worker derives the
 * one candidate and ASKS the edge whether it exists. A project that starts
 * publishing twins under that convention is negotiated with no redeploy; a
 * project without them costs one probe per Markdown-preferring request, which
 * then falls through to its HTML unchanged. Since 2026-11-04 (F07) a literal
 * 404 is remembered for 600 s in a Cache API namespace of its own
 * (VERDICT_CACHE), so that probe reaches GitHub about once per URL and data
 * center every 600 s, instead of every 180 s (the life of GitHub's 404, which
 * carries no Cache-Control), and on every request while GitHub answers 5xx,
 * which is never cached nor remembered.
 *
 * The page's head link is deliberately NOT followed: phonometry's 269
 * Spanish API fallbacks declare the ENGLISH twin there, so following it would
 * answer a Spanish URL with English Markdown. Under the convention probe they
 * have no twin and keep their HTML.
 *
 * Contract with worker.js: a method other than GET/HEAD, a path not ending in
 * `/`, or an Accept that does not prefer Markdown (every browser, every
 * request without text/markdown) makes markdownTwin() return null BEFORE any
 * subrequest, so the request is not negotiated. The checks run in that order,
 * as on jmrp.io: only a slash page ever parses its Accept header. The
 * announcement probe (startTwinProbe, announceTwin) is separate: every GET or
 * HEAD for a slash path starts one beside the pass-through.
 */

/**
 * The `cf` options of every fetch docs-edge makes to GitHub: the
 * pass-through's (worker.js) and the probe's. cacheEverything and nothing
 * else, so the edge keeps each response exactly as long as GitHub's headers,
 * or Cloudflare's defaults when there are none, say.
 *
 * The probe MUST use these very options. It shares its cache entry with the
 * pass-through: both GET `<page>/index.md` with no query, and the edge cache
 * keys by URL, so a direct request for that URL reads the entry a probe
 * filled. With the same options, every status stores what a direct request
 * would have stored, and the probe changes nothing that request receives: a
 * 200 lives GitHub's max-age=600; a 304 answering a revalidation re-arms the
 * entry from GitHub's headers; a 404, which GitHub sends without
 * Cache-Control, lives Cloudflare's default 180 s; a 5xx without cache
 * headers is not stored. A per-status override breaks that, which is why
 * jmrp.io's probe table is not copied here: its `"300-399": 0` also covers
 * 304, so a probe that revalidates a stale twin leaves the shared entry at
 * TTL 0 and every later request revalidates again, and its `"404": 300`
 * keeps a 404 two minutes longer than the pass-through does.
 *
 * Frozen; each fetch passes a copy (`{ ...EDGE_CACHE_CF }`), a plain object
 * of its own, as the literal did before D6.
 */
export const EDGE_CACHE_CF = Object.freeze({ cacheEverything: true });

/**
 * The longest a probe may take, in milliseconds (F07, 2026-11-04). There was
 * no limit before, and misses of 124 s were seen; the slowest fill measured
 * was 548 ms. A probe past the limit is aborted and counts as "no twin", the
 * case every caller already handles: the page goes out without the Link and
 * without `Accept` in its Vary, and a Markdown-preferring request gets the
 * HTML instead of the 302.
 */
export const PROBE_TIMEOUT_MS = 1000;

/**
 * Where "this page has no twin" is remembered (F07, 2026-11-04): a Cache API
 * namespace of its own, opened with `caches.open`, NOT `caches.default`.
 * `caches.default` is the cache the fetches share, so an entry there would
 * answer a direct request for the same URL, and an entry a visitor's request
 * filled there could pass for a verdict. A namespace keeps the two apart.
 *
 * Why a verdict of its own: the probe's 404 entry lives Cloudflare's default
 * 180 s (GitHub's 404 has no Cache-Control) while the page lives 600 s, so on
 * pages without a twin most probes went back to GitHub (median 32 ms to 96 ms,
 * peaks of 361 ms). The shared entry cannot get its own TTL: a per-status TTL
 * there would change what a direct request for `<page>/index.md` gets (see
 * EDGE_CACHE_CF). Only a literal 404 is remembered, for as long as the page
 * lives, so a project that starts publishing twins is announced within 600 s.
 * Per data center, like every Cache API entry.
 */
export const VERDICT_CACHE = "docs-edge-twin-verdicts";
export const VERDICT_TTL_S = 600;
const VERDICT_HEADER = "x-docs-edge-verdict";

// prefersMarkdown: a VERBATIM copy of workers/edge-nonce/worker.js, the
// function itself (lines 76-113 there on 2026-10-29). Its rationale (scored
// [specificity, q] pairs, specificity beats q, ties go to Markdown, q=0
// disables a side) is the JSDoc above it there. CHANGE BOTH TOGETHER:
// worker.test.mjs fails as soon as the two copies differ.
//
// @param accept - The raw Accept header, or null when absent.
// @returns True when the Markdown twin is the better representation to serve.
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
 * The one twin convention: `<pathname>index.md` for a pathname ending in
 * `/`, with the query and the fragment dropped (as on jmrp.io). Any other
 * path (no trailing slash, which GitHub Pages 301s to the slash form;
 * `index.html`; a direct `index.md`; any file) has no twin by convention.
 *
 * The candidate is built by setting `pathname` on a copy of the request URL,
 * NOT by resolving `${pathname}index.md` against it: resolution reads a path
 * that starts with `//` as a network path, so `https://docs.jmrp.io//evil.example/`
 * would name `https://evil.example/index.md` and turn the probe into a fetch
 * of another host and the 302 into an open redirect. The setter keeps the
 * host whatever the path holds. workers/edge-nonce/worker.js keeps a
 * VERBATIM copy of this function (jmrp.io used the resolution form until
 * 2026-10-29): change both together; worker.test.mjs fails when they differ.
 *
 * @param {URL} url - The request URL.
 * @returns {URL | null} The candidate twin on this same origin, or null.
 */
export function twinUrl(url) {
  if (!url.pathname.endsWith("/")) return null;
  const twin = new URL(url.href);
  twin.pathname = `${url.pathname}index.md`;
  twin.search = "";
  twin.hash = "";
  return twin;
}

/**
 * Whether a probe response is a live twin: a LITERAL 200 (a 3xx is never
 * followed, so it can never pass for one) whose media type is text/markdown,
 * parameters aside. Every twin on docs.jmrp.io answers exactly
 * `text/markdown; charset=utf-8`; a 200 of any other type (an HTML file that
 * happens to be called index.md, a GitHub error page) is not a twin.
 *
 * @param {Response} probe - The probe response.
 * @returns {boolean} True when the probe found the twin.
 */
export function isTwinResponse(probe) {
  if (probe.status !== 200) return false;
  return mediaType(probe) === "text/markdown";
}

/**
 * The media type of a response, parameters and case aside.
 *
 * @param {Response} response - The response.
 * @returns {string} The type, or "" when the response has no Content-Type.
 */
export function mediaType(response) {
  return (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
}

/**
 * The twin to redirect this request to, or null to fall through.
 *
 * Entered only for GET or HEAD, a path ending in `/` and an Accept that
 * prefers Markdown, tested in that order; every other request returns null
 * with no subrequest, and only a slash page ever parses its Accept. Then one
 * probe GET of the candidate, with `redirect: "manual"` and through the edge
 * cache with the pass-through's own options (EDGE_CACHE_CF): a plain GET,
 * also for a HEAD request, so the probe fills the very cache entry the
 * client's follow-up request reads, exactly as that request would fill it.
 * The probe is not observable in Analytics Engine: Cloudflare does not
 * re-invoke a Worker for a subrequest to its own route, so docs-edge never
 * runs for it. Any failure (a throwing fetch, an unreadable response) means
 * "no twin": the request falls through to its HTML, never to an error.
 *
 * @param {Request} request - The incoming request.
 * @param {URL} url - Its parsed URL.
 * @param {typeof fetch} [fetchImpl] - The fetch to probe with (tests pass a mock).
 * @param {ProbeOptions} [options] - The verdict store and waitUntil (probeTwin).
 * @returns {Promise<string | null>} The absolute twin URL, or null.
 */
export async function markdownTwin(
  request,
  url,
  fetchImpl = (input, init) => fetch(input, init),
  options = {},
) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (twinUrl(url) === null) return null;
  if (!prefersMarkdown(request.headers.get("accept"))) return null;
  return probeTwin(url, fetchImpl, options);
}

/**
 * The announcement probe, started before the pass-through so the two run side
 * by side (F07, 2026-11-04). Until then the handler waited for the pass-through
 * and only then for the probe, and on a miss the two added up (about 147 ms;
 * 84 to 90% of the HTML is not a HIT). Started for every GET or HEAD for a
 * slash path, before anyone knows whether the answer will be the page: a slash
 * path that answers 404 now costs a probe too. announceTwin reads the result
 * only for the page's own answers, as before. Null, and no subrequest, for
 * any other request.
 *
 * @param {Request} request - The incoming request.
 * @param {URL} url - Its parsed URL.
 * @param {typeof fetch} [fetchImpl] - The fetch to probe with (tests pass a mock).
 * @param {ProbeOptions} [options] - The verdict store and waitUntil (probeTwin).
 * @returns {Promise<string | null> | null} The running probe, or null.
 */
export function startTwinProbe(
  request,
  url,
  fetchImpl = (input, init) => fetch(input, init),
  options = {},
) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (twinUrl(url) === null) return null;
  return probeTwin(url, fetchImpl, options);
}

/**
 * @typedef {object} ProbeOptions
 * @property {(() => (Cache | Promise<Cache> | null)) | null} [verdicts] - Opens
 *   the VERDICT_CACHE namespace when first called; null or absent means no
 *   verdict is read or kept (the tests, a runtime without the Cache API).
 * @property {((promise: Promise<unknown>) => void) | null} [defer] - ctx.waitUntil,
 *   so storing a verdict never delays the answer; absent, the store is awaited.
 */

/**
 * The probe itself: one GET of the page's twin candidate, with
 * `redirect: "manual"` and the pass-through's cf options (EDGE_CACHE_CF), so
 * it fills the very cache entry a direct request for the twin reads, aborted
 * after PROBE_TIMEOUT_MS. Shared by the negotiation above and the
 * announcement below. A remembered "no twin" (VERDICT_CACHE) answers without
 * a subrequest; a literal 404 is remembered for VERDICT_TTL_S.
 *
 * @param {URL} url - The page URL.
 * @param {typeof fetch} [fetchImpl] - The fetch to probe with (tests pass a mock).
 * @param {ProbeOptions} [options] - The verdict store and waitUntil.
 * @returns {Promise<string | null>} The absolute twin URL, or null when the
 *   path has no candidate, the twin does not exist, or the probe fails or
 *   runs out of time.
 */
export async function probeTwin(
  url,
  fetchImpl = (input, init) => fetch(input, init),
  { verdicts = null, defer = null } = {},
) {
  try {
    const twin = twinUrl(url);
    if (twin === null) return null;
    const store = await verdictStore(verdicts);
    if (await knownWithoutTwin(store, twin.href)) return null;
    const probe = await fetchImpl(twin.href, {
      method: "GET",
      redirect: "manual",
      cf: { ...EDGE_CACHE_CF },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const found = isTwinResponse(probe);
    // Only the status and the type are needed; releasing the body keeps the
    // subrequest from being held open for the rest of the invocation.
    try {
      await probe.body?.cancel();
    } catch {
      // A body that cannot be cancelled changes nothing about the verdict.
    }
    if (probe.status === 404 && store !== null) {
      const stored = rememberWithoutTwin(store, twin.href);
      if (defer) defer(stored);
      else await stored;
    }
    return found ? twin.href : null;
  } catch {
    return null;
  }
}

/**
 * The verdict namespace, or null when there is none or it cannot be opened:
 * a failing Cache API must cost the verdict, never the probe.
 *
 * @param {ProbeOptions["verdicts"]} verdicts - The opener.
 * @returns {Promise<Cache | null>} The namespace, or null.
 */
async function verdictStore(verdicts) {
  try {
    return (await verdicts?.()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Whether a "no twin" verdict for this candidate is still fresh. Only an
 * entry this Worker wrote counts (the marker header), and a read that fails
 * means "not known", so the probe goes ahead.
 *
 * @param {Cache | null} store - The verdict namespace.
 * @param {string} key - The twin candidate URL.
 * @returns {Promise<boolean>} True when the page is known to have no twin.
 */
async function knownWithoutTwin(store, key) {
  if (store === null) return false;
  try {
    const hit = await store.match(key);
    return hit?.headers.get(VERDICT_HEADER) === "no-twin";
  } catch {
    return false;
  }
}

/**
 * Remembers that a candidate answered a literal 404, for VERDICT_TTL_S.
 * Never throws: a verdict that cannot be stored is probed again next time.
 *
 * @param {Cache} store - The verdict namespace.
 * @param {string} key - The twin candidate URL.
 * @returns {Promise<void>} Settled once stored or given up.
 */
async function rememberWithoutTwin(store, key) {
  try {
    await store.put(
      key,
      new Response(null, {
        headers: {
          "cache-control": `public, max-age=${VERDICT_TTL_S}`,
          [VERDICT_HEADER]: "no-twin",
        },
      }),
    );
  } catch {
    // The next request probes again.
  }
}

/**
 * Twin announcement (2026-10-31): an HTML page that HAS a twin names it in a
 * `Link: <twin>; rel="alternate"; type="text/markdown"` header, as jmrp.io's
 * pages do. Until then a response header Transform Rule did this for
 * phonometry alone, with a hand-kept list of the paths that have no twin
 * (its two homes and its Spanish API fallbacks); the probe makes that list
 * unnecessary and covers every project that publishes twins, with no
 * redeploy when one starts.
 *
 * Only the page's own answers to a GET or HEAD for a slash path are probed:
 * the 200 `text/html`, and the two answers that stand for it (standsForPage),
 * the 304 that revalidates it and the 206 that carries part of it (only a page
 * the edge holds uncompressed gets this far with a 206: worker.js answers the
 * rest with the whole file). Anything
 * else is returned as it came, with no subrequest. A twin found means a copy
 * of the response (the origin's headers are immutable) with `Accept`
 * appended to its Vary (varyWithAccept, decision N13 of 2026-11-03), and on
 * the 200 the Link header too: that URL answers a Markdown-preferring client
 * with the 302, so a cache between the client and the edge must not hand
 * this HTML to one. The 304 and the 206 get the same Vary because RFC 9110
 * requires it (sections 15.4.5 and 15.3.7: the Vary a 200 to the same
 * request would carry), and because a cache that freshens or completes its
 * stored page with one of them takes their Vary in place of the stored one
 * (RFC 9111 sections 4.3.4 and 3.4): with GitHub's `Accept-Encoding` alone,
 * every revalidation would undo N13 for the next max-age. They get no Link:
 * it is not among those fields, and the stored page keeps its own (a header
 * the 304 does not carry is left as stored). No twin, or a probe that fails,
 * means the origin's response object itself, Vary included: that HTML is
 * what every Accept gets. The head link is not used, for the reason in the
 * header comment: phonometry's Spanish fallbacks name the English twin.
 *
 * A Markdown-preferring request to a page with no twin is probed twice,
 * once by the negotiation and once here; the second probe reads the cache
 * entry (or the verdict) the first one left.
 *
 * worker.js hands in the probe startTwinProbe began beside the pass-through
 * (F07). Without one, the probe is made here, as before, and only for the
 * page's own answers.
 *
 * @param {Request} request - The incoming request.
 * @param {URL} url - Its parsed URL.
 * @param {Response} response - The pass-through's response.
 * @param {typeof fetch} [fetchImpl] - The fetch to probe with (tests pass a mock).
 * @param {Promise<string | null> | null} [probe] - A probe already running.
 * @returns {Promise<Response>} The response to send.
 */
export async function announceTwin(
  request,
  url,
  response,
  fetchImpl = (input, init) => fetch(input, init),
  probe = null,
) {
  if (request.method !== "GET" && request.method !== "HEAD") return response;
  if (twinUrl(url) === null) return response;
  const page = response.status === 200 && mediaType(response) === "text/html";
  if (!page && !standsForPage(response)) return response;
  const twin = await (probe ?? probeTwin(url, fetchImpl));
  if (twin === null) return response;
  const announced = new Response(response.body, response);
  if (page) {
    announced.headers.set(
      "link",
      `<${twin}>; rel="alternate"; type="text/markdown"`,
    );
  }
  announced.headers.set("vary", varyWithAccept(announced.headers.get("vary")));
  return announced;
}

/**
 * Whether an answer to a slash path stands for the page's 200 HTML without
 * being it: a 304 that revalidates it, with no Content-Type (GitHub's 304
 * carries none) or `text/html`, or a 206 with part of it, `text/html` for
 * one range or `multipart/byteranges` for several. A slash path on GitHub
 * Pages serves its index.html and nothing else, so the 304 with no type and
 * the multipart 206 can only be that HTML.
 *
 * @param {Response} response - The pass-through's response.
 * @returns {boolean} True for a 304 or 206 of the page's HTML.
 */
function standsForPage(response) {
  const type = mediaType(response);
  if (response.status === 304) return type === "" || type === "text/html";
  if (response.status === 206) {
    return type === "text/html" || type === "multipart/byteranges";
  }
  return false;
}

/**
 * The Vary of an announced page: the origin's own value with `Accept`
 * appended (RFC 9110 section 12.5.5). The origin's members are kept, in
 * their order; nothing is added when one of them already names Accept
 * (field names are case-insensitive; `Accept-Encoding` and the other
 * `Accept-*` fields are different fields) or is `*`, which already covers
 * every request field. GitHub sends `Vary: Accept-Encoding`, so a page with
 * a twin answers `Vary: Accept-Encoding, Accept`. Several Vary lines reach
 * here as one value joined by commas (Headers.get), and are sent as one.
 *
 * @param {string | null} vary - The origin's Vary, or null when it sent none.
 * @returns {string} The Vary to send.
 */
export function varyWithAccept(vary) {
  const members = (vary ?? "")
    .split(",")
    .map((member) => member.trim())
    .filter((member) => member !== "");
  const covered = members.some(
    (member) => member === "*" || member.toLowerCase() === "accept",
  );
  return covered ? members.join(", ") : [...members, "Accept"].join(", ");
}

/**
 * The negotiated answer: a 302 to the twin with `Vary: Accept` (the same URL
 * answers HTML to other clients) and `Cache-Control: no-store` (decided here,
 * ahead of the cache, on every request; nothing downstream may keep it).
 * No body, so a HEAD and a GET get the same response.
 *
 * @param {string} location - The absolute twin URL.
 * @returns {Response} The redirect.
 */
export function markdownRedirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      vary: "Accept",
      "cache-control": "no-store",
    },
  });
}

export { prefersMarkdown };
