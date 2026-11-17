/**
 * Validators for docs.jmrp.io pages and their Markdown copies (2026-11-17).
 *
 * GitHub Pages sends `ETag: W/"<mtime hex>-<size hex>"` and a Last-Modified of
 * the file's mtime, and the mtime is the moment a deploy wrote the file. Every
 * deploy therefore changed the validators of every page, even when IndexNow
 * found no page whose content had changed (983, 4, 0, 0 and 8 changed pages
 * across five deploys on 2026-11-16 and 17), and GitHub's replicas gave the
 * same bytes different validators within one deploy: `W/"6afc31e5-3d193"` and
 * `W/"6afc31e6-3d193"` for one page from one edge at 12:31 UTC, with no deploy
 * after 10:51. A crawler revalidating with the previous ETag got the whole
 * page again, every time.
 *
 * For a 200 `text/html` or `text/markdown` answer to a GET or HEAD of a page
 * path (validatesContent), the Worker replaces both:
 *
 * - `ETag: W/"<first 128 bits of the SHA-256 of the body, in hex>"`. The body
 *   is the one the client gets, decoded, so the same bytes give the same ETag
 *   from any replica and across any number of deploys, and different bytes a
 *   different one. Weak, because the edge sends that body compressed in more
 *   than one way (RFC 9110, 8.8.3), as GitHub's own ETag was.
 * - `Last-Modified`: the date the page states for its content, when it states
 *   one: the last `<time datetime>` in Starlight's footer (`<div class="meta
 *   sl-flex">`, "Last updated" on every project, "updated" on phonometry, or
 *   its "Published" date when the page has not changed since), or the
 *   `Updated:` line of a Markdown copy's header (above its first `---`). A
 *   date with no time is midnight UTC. Never later than now (RFC 9110,
 *   8.8.2.1). A page that states no date keeps GitHub's Last-Modified.
 *
 * Then the Worker answers the request's preconditions itself, against those
 * validators, in the order of RFC 9110, 13.2.2: If-Match and
 * If-Unmodified-Since (412), If-None-Match by weak comparison (304), and
 * If-Modified-Since only when there is no If-None-Match (304). To get the
 * whole page to hash, the request reaches the edge without its four
 * preconditions (forValidation), and a HEAD of such a path goes as a GET, so
 * a HEAD carries exactly the validators of the GET. The 304 keeps every
 * header of the 200 that would go out (Vary, Cache-Control, Expires, ETag,
 * Last-Modified and the rest), less the body's own: Content-Type,
 * Content-Length, Content-Encoding, Content-Range and the Link that names
 * the twin, as the 304 of announceTwin did (RFC 9110, 15.4.5).
 *
 * The two dates can disagree on purpose: a change of the site's shared
 * markup (navigation, the site-wide JSON-LD) changes the bytes, so the ETag,
 * and not the content date, so not Last-Modified. A client that sends both
 * gets If-None-Match judged first and sees the new bytes; a client that only
 * sends If-Modified-Since keeps the copy it has until the page's content
 * changes, which is what the sitemap's lastmod and IndexNow say about it.
 *
 * Anything else is left as it came: another status, another type, a body
 * above DIGEST_LIMIT_BYTES (hashed and searched it would cost more CPU than
 * the Free plan's 10 ms; the largest page measured is 720 KB). For those,
 * when the client sent preconditions the Worker took off, it judges them
 * against the origin's own validators instead, so they still mean what they
 * meant at GitHub. Every path that is not a page (assets, images, llms.txt,
 * sitemaps) is not touched at all: its preconditions go to the edge as
 * before.
 */

import { mediaType } from "./markdown-negotiation.js";

/**
 * The largest body the Worker hashes. Hashing and searching 720 KB, the
 * largest page on 2026-11-17, takes about 4 ms; above this the origin's
 * validators stand.
 */
export const DIGEST_LIMIT_BYTES = 4 * 1024 * 1024;

/** The types whose 200 gets content validators. */
const VALIDATED_TYPES = new Set(["text/html", "text/markdown"]);

/** The preconditions the Worker answers itself on a validated path. */
const PRECONDITIONS = [
  "if-match",
  "if-none-match",
  "if-modified-since",
  "if-unmodified-since",
];

/**
 * The headers a 304 or 412 leaves out: the body's own, and the Link that
 * announceTwin adds to the 200 only.
 */
const BODY_HEADERS = [
  "content-type",
  "content-length",
  "content-encoding",
  "content-range",
  "transfer-encoding",
  "link",
];

/**
 * Whether a request is for a path that serves a page or its Markdown copy:
 * a GET or HEAD whose path ends in `/`, `.html` or `.md`, or whose last
 * segment has no dot (GitHub redirects it to the slash form). Every other path
 * (assets, images, llms.txt, sitemaps) is not touched.
 *
 * @param {Request} request - The client's request.
 * @param {URL} url - Its parsed URL.
 * @returns {boolean} True for a page path.
 */
export function validatesContent(request, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const p = url.pathname;
  if (p.endsWith("/") || p.endsWith(".html") || p.endsWith(".md")) return true;
  return !p.slice(p.lastIndexOf("/") + 1).includes(".");
}

/**
 * The request the edge gets for a page path: a GET, without the four
 * preconditions, so the edge answers with the whole page for the Worker to
 * hash and judge. The client's own request when it is already that (a GET
 * with none of them), otherwise a copy with the URL, redirect mode and every
 * other header, and no body (a GET or HEAD body has no defined meaning,
 * RFC 9110, 9.3.1 and 9.3.2, so the two headers that frame one go too).
 *
 * @param {Request} request - The client's GET or HEAD.
 * @returns {Request} The request to pass through.
 */
export function forValidation(request) {
  const conditional = PRECONDITIONS.some((name) => request.headers.has(name));
  if (request.method === "GET" && !conditional) return request;
  const headers = new Headers(request.headers);
  for (const name of PRECONDITIONS) headers.delete(name);
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(request.url, {
    method: "GET",
    headers,
    redirect: request.redirect,
  });
}

/**
 * A stated date as milliseconds since the epoch, whole seconds: `YYYY-MM-DD`
 * (midnight UTC) or a full ISO 8601 date-time with its offset. Anything else,
 * including a date-time with no offset (which JavaScript would read as local
 * time), is not a date.
 *
 * @param {string} value - The stated date.
 * @returns {number | null} The time, or null.
 */
export function parseStatedDate(value) {
  const parts = value.split("T");
  if (parts.length > 2 || !/^\d{4}-\d{2}-\d{2}$/.test(parts[0])) return null;
  const clock = /^\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (parts.length === 2 && !clock.test(parts[1])) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) * 1000 : null;
}

/**
 * The content date an HTML page states: the last `<time datetime>` in
 * Starlight's footer (`<div class="meta sl-flex">` up to its `</div>`), the
 * update date when the page shows one and its publication date otherwise.
 *
 * @param {string} html - The page.
 * @returns {number | null} The date, or null when the page states none.
 */
export function htmlContentDate(html) {
  const start = html.lastIndexOf('<div class="meta sl-flex');
  if (start === -1) return null;
  const end = html.indexOf("</div>", start);
  const footer = html.slice(start, end === -1 ? undefined : end);
  let last = null;
  for (const match of footer.matchAll(/<time\b[^>]*\bdatetime="([^"]*)"/g)) {
    last = match[1];
  }
  return last === null ? null : parseStatedDate(last);
}

/**
 * The content date a Markdown copy states: the `Updated:` line of its header,
 * the lines above the first `---` line. A copy with no such header states
 * none, whatever its text says further down.
 *
 * @param {string} markdown - The copy.
 * @returns {number | null} The date, or null when the copy states none.
 */
export function markdownContentDate(markdown) {
  const lines = markdown.slice(0, 16_384).split("\n");
  const rule = lines.findIndex((line) => line.trimEnd() === "---");
  if (rule === -1) return null;
  for (const line of lines.slice(0, rule)) {
    const match = /^Updated: (\S+)\s*$/.exec(line);
    if (match) return parseStatedDate(match[1]);
  }
  return null;
}

/**
 * An HTTP-date (RFC 9110, 5.6.7) as milliseconds since the epoch, or null when
 * the value is missing or is not a date (RFC 9110, 13.1.3 and 13.1.4: such a
 * field is ignored).
 *
 * @param {string | null} value - The field value.
 * @returns {number | null} The time, whole seconds, or null.
 */
export function parseHttpDate(value) {
  if (value === null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) * 1000 : null;
}

/**
 * The entity tags of an If-Match or If-None-Match value, each as
 * `{ weak, tag }` with its quotes. A member that is not an entity tag is
 * left out.
 *
 * @param {string} value - The field value.
 * @returns {{ weak: boolean, tag: string }[]} The tags.
 */
function entityTags(value) {
  return [...value.matchAll(/(W\/)?("[^"]*")/g)].map((m) => ({
    weak: m[1] !== undefined,
    tag: m[2],
  }));
}

/**
 * The status the preconditions of a GET or HEAD give against a selected
 * representation's validators (RFC 9110, 13.2.2): 412 when If-Match, or
 * without it If-Unmodified-Since, fails; 304 when If-None-Match matches by
 * weak comparison, or, with no If-None-Match, when the representation was not
 * modified after If-Modified-Since; otherwise 200. If-Match compares
 * strongly, so a weak ETag never satisfies it; `*` matches any existing
 * representation in both fields.
 *
 * @param {Headers} headers - The client's request headers.
 * @param {string | null} etag - The representation's ETag.
 * @param {number | null} lastModified - Its Last-Modified, in ms.
 * @returns {200 | 304 | 412} The status.
 */
export function preconditionStatus(headers, etag, lastModified) {
  const current = etag === null ? [] : entityTags(etag);
  const ifMatch = headers.get("if-match");
  if (ifMatch === null) {
    const since = parseHttpDate(headers.get("if-unmodified-since"));
    if (since !== null && lastModified !== null && lastModified > since) {
      return 412;
    }
  } else if (
    ifMatch.trim() !== "*" &&
    entityTags(ifMatch).every(
      (asked) =>
        asked.weak || current.every((own) => own.weak || own.tag !== asked.tag),
    )
  ) {
    return 412;
  }
  const ifNoneMatch = headers.get("if-none-match");
  if (ifNoneMatch !== null) {
    const matches =
      ifNoneMatch.trim() === "*" ||
      entityTags(ifNoneMatch).some((asked) =>
        current.some((own) => own.tag === asked.tag),
      );
    return matches ? 304 : 200;
  }
  const since = parseHttpDate(headers.get("if-modified-since"));
  if (since !== null && lastModified !== null && lastModified <= since) {
    return 304;
  }
  return 200;
}

/**
 * The first 128 bits of the SHA-256 of some bytes, in lower-case hex.
 *
 * @param {ArrayBuffer} bytes - The bytes.
 * @returns {Promise<string>} 32 hex digits.
 */
export async function contentDigest(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Lets go of a body that will not be sent. A body that cannot be cancelled
 * changes nothing about the answer.
 *
 * @param {Response} response - The response whose body is dropped.
 * @returns {Promise<void>} Settled once it is released.
 */
async function drop(response) {
  try {
    await response.body?.cancel();
  } catch {
    // Nothing to do: the answer does not depend on it.
  }
}

/**
 * A 304 or 412 for a 200 that would have gone out: its headers less the
 * body's own (BODY_HEADERS), and no body.
 *
 * @param {number} status - 304 or 412.
 * @param {Headers} headers - The headers of the 200.
 * @returns {Response} The answer.
 */
function bodiless(status, headers) {
  const kept = new Headers(headers);
  for (const name of BODY_HEADERS) kept.delete(name);
  return new Response(null, { status, headers: kept });
}

/**
 * The answer to a GET or HEAD of a page path (validatesContent), given the
 * pass-through's answer to its forValidation copy: a 200 `text/html` or
 * `text/markdown` with the content validators described above and the
 * client's preconditions judged against them; any other 200 with them judged
 * against the origin's validators; any other status as it came, since a
 * precondition only applies to a 2xx (RFC 9110, 13.2.1). A HEAD gets no body.
 *
 * @param {Request} request - The client's request, preconditions included.
 * @param {Response} response - The answer to forValidation(request).
 * @param {number} [now] - The current time in ms (tests pass one).
 * @returns {Promise<Response>} The answer to send.
 */
export async function withContentValidators(
  request,
  response,
  now = Date.now(),
) {
  const head = request.method === "HEAD";
  if (response.status !== 200) {
    if (!head) return response;
    await drop(response);
    return new Response(null, response);
  }
  let etag = response.headers.get("etag");
  let lastModified = parseHttpDate(response.headers.get("last-modified"));
  let headers = response.headers;
  const type = mediaType(response);
  if (VALIDATED_TYPES.has(type)) {
    const bytes = await response.clone().arrayBuffer();
    if (bytes.byteLength <= DIGEST_LIMIT_BYTES) {
      const text = new TextDecoder().decode(bytes);
      const stated =
        type === "text/html"
          ? htmlContentDate(text)
          : markdownContentDate(text);
      etag = `W/"${await contentDigest(bytes)}"`;
      headers = new Headers(response.headers);
      headers.set("etag", etag);
      if (stated !== null) {
        lastModified = Math.min(stated, Math.floor(now / 1000) * 1000);
        headers.set("last-modified", new Date(lastModified).toUTCString());
      }
    }
  }
  const status = preconditionStatus(request.headers, etag, lastModified);
  if (status !== 200) {
    await drop(response);
    return bodiless(status, headers);
  }
  if (head) {
    await drop(response);
    return new Response(null, { status: 200, headers });
  }
  if (headers === response.headers) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
