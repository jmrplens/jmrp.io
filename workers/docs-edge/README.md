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
| Live version     | `230bd6d9-132a-49f4-98aa-e6bafe759c6d` (2026-11-05)                        |
| Previous version | `98d56f4a-7a42-44aa-bf55-c50a3956ef95` (2026-11-04)                        |
| Roll back        | `wrangler versions deploy 98d56f4a-7a42-44aa-bf55-c50a3956ef95@100% --yes` |
| Route            | `docs.jmrp.io/*`, fail-open                                                |
| Dataset          | `docs_edge_requests` (binding `REQS`)                                      |

Files: `worker.js` (the handler and the record), `markdown-negotiation.js` (imported
by `worker.js`; wrangler bundles both), `worker.test.mjs` (not deployed),
`wrangler.toml`.

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

Cloudflare throws on some ranges instead of answering them: `bytes=-0,-0` gave a 502
where the origin answers 416. When a request with a `Range` fails like that, the
Worker sends it once more without one and returns the whole file, which a server may
always do (RFC 9110, 14.2). On routes with no Worker, Cloudflare's own 502 remains.

## Zone settings this depends on

- DNS: `docs` is a proxied CNAME to `jmrplens.github.io`.
- A Configuration Rule for `docs.jmrp.io` sets SSL to Full and turns off Automatic
  HTTPS Rewrites and Cloudflare Fonts. With either of the two on, the edge rewrites
  the HTML and drops GitHub's `ETag`, so every revalidation downloads the page again.
- Response header Transform Rules for `docs.jmrp.io`: the security headers (CSP,
  `X-Frame-Options`) and `Access-Control-Allow-Origin: *`; the `Link` header on a
  twin; `X-Robots-Tag: noindex` on every `llms*.txt`; a year of `max-age` for
  `/_astro/` on 200, 206 and 304; `Allow: GET, HEAD` on a 405;
  `X-Robots-Tag: noindex, follow` for `/a11y-diagrams/`, which must stay reachable
  but out of search indexes.
- A Compression Rule that prefers Brotli over zstd for HTML and a few JSON types,
  and a response rule that removes `Accept-Ranges` outside the binary types.
- Bulk Redirects at account level, with the list of retired phonometry URLs.
- A custom firewall rule that skips the zone's bot and security checks for
  `docs.jmrp.io`.

These rules apply even when the Worker is skipped.

## Tests

`node --test` in this directory (Node 22 or later). Nothing touches the network:
every `fetch` is a mock. Without `../tools/rules-dump.json` two guard tests are
skipped (they read the live zone rules), and two more compare against an earlier
copy of the Worker, which you get with `git show` and name in `DOCS_EDGE_BEFORE`;
`pnpm test:unit` runs the rest in CI.

## Version history

| Version    | Date       | What                                                                                                           |
| ---------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `943214a0` | 2026-10-29 | Markdown negotiation                                                                                           |
| `98d56f4a` | 2026-11-04 | A Range on a compressed answer gets the whole file                                                             |
| `230bd6d9` | 2026-11-05 | Probe in parallel and capped, negative verdict cached, location headers not forwarded, range-safe types listed |

The source moved here from a git-ignored directory on 2026-11-05. The changes since
`230bd6d9` are comments, formatting and one behavior-neutral edit that satisfies the
linter; the next deploy publishes them.
