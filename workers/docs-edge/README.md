# docs-edge

Cloudflare Worker in front of `docs.jmrp.io`, the documentation of the open source
projects, which GitHub Pages hosts. GitHub keeps no access log the owner can read, so
this Worker is the only record of who reads the documentation, and the place where
the site gets what GitHub Pages cannot send: Markdown negotiation and a few fixes.

See `../README.md` for what the three Workers share, the deploy procedure and the
tools.

## Current state

| Item             | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Live version     | `d407c253-f843-4208-af5c-f6dc36b1cb36` (2026-11-17)                        |
| Previous version | `6260b55a-f476-4fdb-92b6-3fa5d61b9b4e` (2026-11-11)                        |
| Roll back        | `wrangler versions deploy 6260b55a-f476-4fdb-92b6-3fa5d61b9b4e@100% --yes` |
| Route            | `docs.jmrp.io/*`, fail-open                                                |
| Dataset          | `docs_edge_requests` (binding `REQS`)                                      |

Files: `worker.js` (the handler and the record), `markdown-negotiation.js` and
`content-validators.js` (imported by `worker.js`; wrangler bundles the three),
`worker.test.mjs` and `content-validators.test.mjs` (not deployed), `wrangler.toml`.

Deploy only from this directory: a deploy from an older copy, on this server or
anywhere else, reverts whatever changed since.

## What it does

- **Passes every request to GitHub Pages** and caches at the edge by GitHub's own
  `Cache-Control` (`cacheEverything`). The query string stays in the cache key:
  pagefind asks for `pagefind-entry.json?ts=<Date.now()>` precisely to get past a
  cached copy.
- **Records one Analytics Engine data point per request** in `docs_edge_requests`,
  with the same layout as `edge-nonce` (see `../edge-nonce/tools/ae-query.mjs`).
  `scripts/ae-to-influx.mjs` copies every row into InfluxDB as site `docs`, because
  no origin log exists for these requests. **`/privacy` on jmrp.io describes this
  record**: change both together.
- **Does not forward the visitor's location to GitHub.** The zone adds Cloudflare's
  location headers (`cf-ipcity`, `cf-ipcountry`, `cf-iplatitude` and the rest) to
  every request; the Worker removes them from the request it sends to GitHub. When
  the Worker is skipped (quota exhausted, fail-open), the request reaches GitHub
  with them, which cannot be prevented from here.
- **Redirects the retired `/assets/pdf/*` tree** to `https://jmrp.io/pdf/*` with a 301.
- **Asks GitHub once more** when it answers a `GET` or `HEAD` with 502, 503 or 504,
  and sends those two methods without a body, so they can go twice (see "A 502, 503
  or 504 from GitHub").
- **Gives every page and Markdown copy validators of its own**: an ETag of its bytes
  and the content date the page states, and judges a revalidation against them (see
  "Validators").

## Markdown negotiation

A `GET` or `HEAD` whose `Accept` prefers `text/markdown`, for a path that ends in
`/`, is redirected with a 302 to that page's twin, `<path>index.md`, when the twin
exists. A client that does not prefer Markdown gets the HTML, and the HTML of a page
with a twin carries `Link: <...index.md>; rel="alternate"; type="text/markdown"` and
`Vary: Accept`.

Whether a twin exists is decided by a probe: a manual-redirect `fetch` of the twin.
The probe runs **in parallel** with the pass-through, is capped at one second, and a
404 is remembered for ten minutes with the Cache API, so a page without a twin does
not wait for GitHub twice. A page waits for its probe at most one second; past that it
goes out without the `Link` header and without `Accept` in `Vary`.

`prefersMarkdown` and `twinUrl` in `markdown-negotiation.js` are verbatim copies of
the ones in `../edge-nonce/worker.js` and `../edge-nonce-mcp/worker.js`; the tests
fail if they differ.

## Range requests

GitHub sends compressible files gzipped, and the edge measures a byte range against
the stored gzip, which gives a client a piece of a compressed stream with a
`Content-Range` that says nothing about the file. For any type outside
`RANGE_SAFE_EXTENSIONS`, the Worker does not send the `Range` on, so the client gets
the whole file with a 200; binaries in the list keep real ranges. The same list exists
in the other two Workers and in two zone rules (see `../README.md`).

An invalid range is not sent on either. The edge does not answer some of them as the
origin would: `bytes=-0,-0` gave a 502 or an empty 206 where GitHub answers 416.
`isValidRange` lets a `Range` through only when every part of it is well formed
(`first-last` with first not above last, `first-`, or `-suffix` with a suffix above
zero); otherwise the Worker drops `Range` and `If-Range` and the client gets the whole
file with a 200, which a server may always do (RFC 9110, 14.2). Valid single and
multiple ranges go through unchanged and the edge answers them correctly (measured on
2026-11-05). If the edge still throws on a range, `fetchOrWhole` sends the request once
more without it. On routes with no Worker, Cloudflare's own 502 remains.

## A 502, 503 or 504 from GitHub

GitHub Pages answers a rare 503 for a page that has gone cold. The record holds five
in the 103,059 requests from 2026-11-03 20:00 UTC to 2026-11-07 03:00 UTC, all
`BYPASS`: three on Spanish pages of `/phonometry/` and two on English pages of
`/cs-routeros-bouncer/` and `/gitlab-mcp-server/`. A crawler that gets one counts a
failed fetch.

A `GET` or `HEAD` that GitHub answers with 502, 503 or 504 is sent once more, at
once and unchanged: the same `Range`, the same validators, every other header. The
second answer goes out whatever it is, and the Range, `Vary` and twin rules above
judge it as they would a first answer. Never more than once per request: a second
5xx goes out as it came. Any other method is never sent twice, so a request body is
never sent again. If the retry throws, the first answer goes out with its body. The
whole-file requests of the Range rules and the twin probe are not retried.

A `GET` or `HEAD` reaches GitHub without a body, and without the `Content-Length`
and `Transfer-Encoding` that frame one. In workerd, a `GET` that came with either
header, even `Content-Length: 0`, reaches the Worker with a body; the first fetch
reads it, and a request whose body was read cannot be sent again, so the retry, and
the whole-file request after a 416, would throw instead of reaching GitHub. A body on
those methods has no defined meaning (RFC 9110, 9.3.1 and 9.3.2).

The data point records a retry that GitHub answered in the cache verdict (blob 12) as
`origin-retry-502`, `origin-retry-503` or `origin-retry-504`, naming the status the
retry replaced, with the final status in blob 11. A retry that helped reads `200`
there, and one that met a second 5xx reads that status. A retry that throws is not
recorded, so the row reads as it would without one. The record layout does not
change: blob 12 already carries the Worker's own verdicts beside Cloudflare's
`cf-cache-status`, and the privacy page describes it as whether the edge served the
page from its cache.

## Validators

GitHub Pages sends `ETag: W/"<mtime hex>-<size hex>"` and the file's mtime as
`Last-Modified`, and the mtime is when a deploy wrote the file. So every deploy changed
the validators of every page, even when no page's content changed (IndexNow found
983, 4, 0, 0 and 8 changed pages across five deploys on 2026-11-16 and 17), and
GitHub's replicas gave the same bytes different validators within one deploy
(`W/"6afc31e5-3d193"` and `W/"6afc31e6-3d193"` for one page from one edge, with no
deploy between them). A crawler that revalidated got the whole page every time.

For a `GET` or `HEAD` of a page path (one that ends in `/`, `.html` or `.md`, or whose
last segment has no dot) answered with a 200 `text/html` or `text/markdown`,
`content-validators.js` replaces both:

- `ETag: W/"<32 hex digits>"`, the first 128 bits of the SHA-256 of the body as the
  client gets it, decoded. The same bytes give the same ETag from any replica and
  across deploys; different bytes give another. Weak, because the edge sends the body
  compressed in more than one way.
- `Last-Modified`, the content date the page states: the last `<time datetime>` in
  Starlight's footer (`<div class="meta sl-flex">`: "Last updated" on every project,
  "updated" on phonometry, or its "Published" date when it has not changed since), or
  the `Updated:` line of a Markdown copy's header. A day with no time is midnight UTC,
  and a date after now is now. A page that states none keeps GitHub's.

The Worker then answers the preconditions itself (RFC 9110, 13.2.2): `If-Match` and
`If-Unmodified-Since` with a 412, `If-None-Match` by weak comparison with a 304, and
`If-Modified-Since` only when there is no `If-None-Match`. To have the whole page to
hash, those four headers do not reach the edge on a page path, and a `HEAD` goes as a
`GET`, so it carries exactly the validators of the `GET`. The 304 keeps every header of
the 200 (Vary, Cache-Control, Expires and the rest) less `Content-Type`,
`Content-Length`, `Content-Encoding`, `Content-Range` and the twin's `Link`.

A change of the shared markup (navigation, the site-wide JSON-LD) changes the ETag and
not the content date. A client that sends both validators gets `If-None-Match` judged
first and sees the new bytes; one that sends only `If-Modified-Since` keeps its copy
until the content changes, which is what the sitemap and IndexNow say about the page.

Anything else is passed on as before: another status or type, a body above 4 MB (the
largest page is 720 KB, and hashing and searching it takes about 4 ms), and every path
that is not a page, whose preconditions still go to the edge. When the Worker took a
page path's preconditions off and the answer is not one it validates, it judges them
against GitHub's own validators instead. If computing the validators throws, the page
goes out as it came.

## Zone settings this depends on

- DNS: `docs` is a proxied CNAME to `jmrplens.github.io`.
- A Configuration Rule for `docs.jmrp.io` sets SSL to Full and turns off Automatic
  HTTPS Rewrites and Cloudflare Fonts. With either of the two on, the edge rewrites
  the HTML and drops GitHub's `ETag`, so every revalidation downloads the page again.
- Response header Transform Rules for `docs.jmrp.io`: the security headers (CSP,
  `X-Frame-Options`) and `Access-Control-Allow-Origin: *`; the `Link` header and
  `X-Robots-Tag: noindex, follow` on a twin (the second since 2026-11-21, GEO audit
  #13: Bing had started reading the twins, as it did on jmrp.io before 2026-10-10);
  `X-Robots-Tag: noindex` on every `llms*.txt`; a year of `max-age` for
  `/_astro/` on 200, 206 and 304; `Allow: GET, HEAD` on a 405;
  `X-Robots-Tag: noindex, follow` for `/a11y-diagrams/`, which must stay reachable
  but out of search indexes.
- A Compression Rule that prefers Brotli over zstd for HTML and a few JSON types,
  and a response rule that removes `Accept-Ranges` outside the binary types.
- Bulk Redirects at account level for phonometry, which moved to https://phonometry.dev/:
  the list `phonometry_retired_v2` (the retired addresses and the pages without their
  trailing slash, each 301 straight to its final page) and then `phonometry_moved`
  (every other address under `/phonometry`, 301 to the same path there), both keeping
  the query. Nothing else on `docs.jmrp.io` is redirected.
- A custom firewall rule that skips the zone's bot and security checks for
  `docs.jmrp.io`.

These rules apply even when the Worker is skipped.

## Tests

`node --test` in this directory (Node 22 or later) runs `worker.test.mjs` and
`content-validators.test.mjs`. Nothing touches the network: every `fetch` is a mock. Without `../tools/rules-dump.json` two guard tests are
skipped (they read the live zone rules), and two more compare against an earlier
copy of the Worker, which you get with `git show` and name in `DOCS_EDGE_BEFORE`;
`pnpm test:unit` runs the rest in CI.

## Version history

| Version    | Date       | What                                                                                                           |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `943214a0` | 2026-10-29 | Markdown negotiation                                                                                           |
| `98d56f4a` | 2026-11-04 | A Range on a compressed answer gets the whole file                                                             |
| `230bd6d9` | 2026-11-05 | Probe in parallel and capped, negative verdict cached, location headers not forwarded, range-safe types listed |
| `66d907d2` | 2026-11-05 | A Range goes on only when valid and on a range-safe type; a range the edge rejects gets the whole file         |
| `6260b55a` | 2026-11-11 | A GET or HEAD answered 502, 503 or 504 is sent once more; a GET or HEAD reaches GitHub without a body          |
| `d407c253` | 2026-11-17 | A page or Markdown copy gets an ETag of its bytes and its stated content date, and 304s judged against them    |

The source moved here from a git-ignored directory on 2026-11-05; `66d907d2` is the
first version deployed from it.
