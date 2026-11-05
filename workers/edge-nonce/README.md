# edge-nonce

Cloudflare Worker that gives `jmrp.io` **one CSP nonce per visitor over HTML cached
at the edge**. The site's Content Security Policy uses a fresh nonce on every
response, which normally forces `no-store` on the HTML and keeps it out of any CDN.
This Worker keeps one cached copy per page and mints the nonce at the edge instead.

See `../README.md` for what the three Workers share, the deploy procedure and the
tools.

## Current state

| Item             | Value                                                                      |
| ---------------- | -------------------------------------------------------------------------- |
| Live version     | `e01542e5-f422-421e-be64-4dc3406e9b6d` (2026-11-05)                        |
| Previous version | `5611584b-d8f2-46df-bee9-85d67c6c03e3` (2026-11-05)                        |
| Roll back        | `wrangler versions deploy 5611584b-d8f2-46df-bee9-85d67c6c03e3@100% --yes` |
| Routes           | `jmrp.io/*` and the two `contributions` routes below, all fail-open        |
| Dataset          | `jmrp_edge_requests` (binding `REQS`)                                      |

## How it works

1. **nginx** (the `jmrp.io` vhost) has a `map` on the `X-Edge-Nonce-Key` request
   header. With the right secret, `$cspNonce` is set to the literal placeholder
   `NGINX_CSP_NONCE`, so nginx's per-request substitution changes nothing and the
   page leaves the origin with the placeholder in its body and in its CSP header.
   Without the secret, nginx behaves as it always did, byte for byte.
2. **The Worker** fetches that placeholder copy from the origin and caches it at
   the edge (`cacheEverything` with a 24 hour TTL for a 200; shorter for 3xx and
   404, none for 5xx), mints a 128 bit nonce for each request and replaces the
   placeholder in the body and the header. The browser never gets a copy it may
   cache, and the HTML it gets carries no `Last-Modified` or `ETag`.
3. **The safety rail**, which must never be removed: when the origin's CSP has no
   placeholder (the secret was rotated or no longer matches), the Worker passes the
   response through without caching it and marks it
   `X-Edge-Nonce: bypass-no-placeholder`. A real nonce cached and shared between
   visitors is exactly what nonces exist to prevent.
4. **Failing open.** An exception inside the Worker degrades to a plain
   pass-through, never to Cloudflare's error 1101. Separately, the routes have
   `request_limit_fail_open` on: if the account's daily Workers quota runs out,
   the routes skip the Worker until 00:00 UTC and nginx serves with its own
   nonce, without the edge cache, the request record or Markdown negotiation.

The gain is for distant visitors, who skip the edge to origin leg on a cache hit,
and resilience: with a 24 hour TTL the edge keeps serving if the origin goes down.

## Routes and bypasses

The Worker runs on `jmrp.io/*`. Cloudflare applies the most specific route, so a
narrower route **with no Worker** is a bypass. There are 13, created through the
zone's routes API (they cannot live in `wrangler.toml`, which only lists this
Worker's own routes):

- `/homelab/*` and `/es/homelab/*`: nginx replaces `HLM_*` tokens with live metrics
  on every request, and a cached copy would freeze them for the whole TTL.
  **`/homelab/` must never route through this Worker.**
- `/projects/*` and `/es/projects/*`: the same, for the `PRJ_*` figures. Their
  `contributions/*` subpages are routed back into the Worker by two routes of its
  own, `jmrp.io/projects/contributions/*` and `jmrp.io/es/projects/contributions/*`.
- `/tools/http-headers-analyzer/*` and its `/es/` twin: nginx writes a short lived
  HMAC token into the page for its proxy, and a cached copy would carry an expired
  one.
- `/api/*` and `/csp-report*`: dynamic.
- `/_astro/*`, `/og/*`, `/assets/*`, `/pdf/*`: cached at the edge by the zone's
  Cache Rules; running the Worker there would only spend quota.
- `/identity/*`: no Worker. `person.jsonld` is cached by a Cache Rule;
  `projects.json` is left uncached on purpose, so the origin log keeps those
  requests.

Six pages that have a markdown twin therefore do not negotiate Markdown:
`/homelab/`, `/projects/`, `/tools/http-headers-analyzer/` and their `/es/` versions.
That is accepted.

The live list is what counts. Read it with
`GET /zones/<zone>/workers/routes` or `python3 workers/tools/dump_rules.py`.

## What else the Worker decides

- **Redirects.** A 3xx with the placeholder or with no CSP is served from the cached
  copy without a CSP, marked `x-edge-nonce: redirect` and cacheable for an hour,
  with the visitor's query restored unless the target already has one.
- **RSS for people.** A browser navigation (`Sec-Fetch-Dest: document`) to
  `/rss.xml` or `/es/rss.xml` gets a 302 to `/feeds/` or `/es/feeds/`, never cached
  and marked `x-edge-nonce: rss-human-redirect`. Feed readers do not send that
  header and get the XML at the same URL. The decision lives here, before the cache,
  because a cached 302 from the origin would also reach feed readers; nginx keeps
  the same rule only as a fallback. Purge both feed URLs after any deploy that
  touches this logic: testing during a version rollout once cached the fallback
  302 for an hour.
- **Markdown negotiation.** A client whose `Accept` prefers `text/markdown` is sent
  to the page's twin. `prefersMarkdown` and `twinUrl` are verbatim copies of the
  ones in `../docs-edge/markdown-negotiation.js` and `../edge-nonce-mcp/worker.js`;
  change all three together.
- **Range requests.** The edge stores compressed files and would cut a byte range
  from the stored copy. For any type outside `RANGE_SAFE_EXTENSIONS` the Worker
  drops `Range` and `If-Range`, so the client gets the whole file with a 200.
  Binaries in the list keep real ranges while `isValidRange` accepts every part of
  them; an invalid range such as `bytes=-0,-0`, which the edge answers with a 502 or
  an empty 206, is dropped the same way. If the edge still rejects a range, the
  fail-open fallback (`fetchOrWhole`) sends the request once more without it.

### Chromium: whole file, then a Range (accepted)

After Chromium stores a compressible file whole, a `fetch` with `Range` goes out
with `If-None-Match`; the edge answers 304, as RFC 9110 says, and Chromium cuts the
range from its own compressed copy, which gives wrong bytes and then
`TypeError: Failed to fetch`. Firefox and WebKit send no conditional. It reproduces
with no Cloudflare at all, and no page on jmrp.io fetches by Range, so the Worker is
not changed for it.

## The request record

Every request through the Worker writes one Analytics Engine data point to
`jmrp_edge_requests`. The write is inside a `try`, so it can never break a response.
The nginx logs cannot answer the same questions, because the edge serves most
requests from its cache and the origin never sees them.

The layout (index, 20 blobs, 9 doubles) is documented at the top of
`tools/ae-query.mjs`. Count with `SUM(_sample_interval)`, not `COUNT()`: with
adaptive sampling one row can stand for several requests. Retention is about 90
days. Every five minutes `scripts/ae-to-influx.mjs` copies the requests the edge
served without the origin into InfluxDB.

**`/privacy` describes this record.** Changing what is recorded means changing that
page in the same pull request.

Two cache verdicts are worth knowing: `bypass-no-placeholder` is the safety rail
declining to cache a response with no placeholder, which is what every tarpit
response is, so every hit on the trap reaches the origin; `passthrough` is a method
other than GET or HEAD handed straight to the origin.

```bash
node workers/edge-nonce/tools/ae-query.mjs "SELECT blob11 AS status, blob12 AS cache,
  SUM(_sample_interval) AS n FROM jmrp_edge_requests
  WHERE timestamp > NOW() - INTERVAL '24' HOUR GROUP BY status, cache ORDER BY n DESC"
```

Workers Logs is on as well (`[observability]`, every invocation). Any option to
cache the Worker's own responses must stay off: it caches its subrequests to the
origin, while its output carries a per-visitor nonce.

## Operations

- **Deploy**: follow `../README.md`. Never `wrangler deploy`.
- **Secret**: `wrangler secret put EDGE_NONCE_KEY`, equal to the value in the nginx
  `map`. Rotate nginx first, then the secret: the safety rail covers the gap by
  passing responses through uncached.
- **Purge**: every site deploy purges the zone (`scripts/deploy-live.mjs`), so the
  cached placeholder copies renew themselves.
- **Check the whole site** in a real browser through the edge:
  `node workers/edge-nonce/tools/full-csp-sweep.mjs` (every sitemap page: CSP
  violations, unique nonces, header nonce equal to body nonce, `/homelab/` bypassed).
- **Remove the Worker**: delete its routes. The nginx `map` is inert without the
  secret.

## Version history

| Version    | Date       | What                                                                                                 |
| ---------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `6aab95f5` | 2026-10-29 | Markdown negotiation hardened: `q` parsed without a quadratic pattern, twin built with `twinUrl`     |
| `8afe29b4` | 2026-11-04 | `Range` and `If-Range` dropped outside the binary types                                              |
| `5611584b` | 2026-11-05 | Redirects without CSP and with the query restored, no validators on minted HTML, `Vary` on the feeds |
| `e01542e5` | 2026-11-05 | An invalid `Range` dropped like one on text; a range the edge rejects retried whole                  |

The source moved here from a git-ignored directory on 2026-11-05; `e01542e5` is the
first version deployed from it.
