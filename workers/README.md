# Edge Workers

The three Cloudflare Workers of the `jmrp.io` zone, with the tools that check and
operate them. Each directory is one Worker, deployed with wrangler from that
directory; nothing here is part of the site build.

| Worker                              | Host           | What it does                                                                        | Record               |
| ----------------------------------- | -------------- | ----------------------------------------------------------------------------------- | -------------------- |
| [`edge-nonce`](edge-nonce/)         | `jmrp.io`      | Caches the HTML at the edge and mints a CSP nonce per visitor                       | `jmrp_edge_requests` |
| [`edge-nonce-mcp`](edge-nonce-mcp/) | `mcp.jmrp.io`  | The same for mcp.jmrp.io, plus keeping the OAuth callback's code out of every log   | `mcp_edge_requests`  |
| [`docs-edge`](docs-edge/)           | `docs.jmrp.io` | Fronts GitHub Pages: request record, Markdown negotiation, Range and redirect fixes | `docs_edge_requests` |

Each Worker's README says what it does, what it depends on, its live version and how
to roll it back.

## What the three share

Some pieces exist in more than one place and must change together. The tests check
them.

- **`RANGE_SAFE_EXTENSIONS`**, the binary types whose byte ranges are real. It
  appears in the three Workers, in the Cache Rule that sends a `Range` on any other
  type to the origin, and in the response Transform Rule that removes
  `Accept-Ranges` outside it. A text type in the list would let the edge cut ranges
  from its compressed copy again.
- **`prefersMarkdown` and `twinUrl`**, verbatim copies in `edge-nonce/worker.js`,
  `edge-nonce-mcp/worker.js` and `docs-edge/markdown-negotiation.js`.
- **The record layout**: one Analytics Engine data point per request, with the same
  index, blobs and doubles in the three datasets (documented at the top of
  `edge-nonce/tools/ae-query.mjs`). `scripts/ae-to-influx.mjs` reads it, and the
  privacy pages describe it: `/privacy` on jmrp.io (jmrp.io and docs.jmrp.io) and
  `/policies` on mcp.jmrp.io. **Changing what a Worker records means changing those
  pages in the same pull request.**

`docs-edge/worker.test.mjs` holds guard G1, which compares all of the above,
including the zone rules read from `tools/rules-dump.json`.

## Secrets

None in this directory. `edge-nonce` and `edge-nonce-mcp` read `EDGE_NONCE_KEY`, set
with `wrangler secret put` and equal to the value in each site's nginx `map`. Each
site has its own. `wrangler.toml` holds only the account and zone ids, which are not
secret.

## Deploying

**Never run `wrangler deploy`.** It recreates the routes with
`request_limit_fail_open` off, so an exhausted daily quota would turn the sites into
Cloudflare error pages, and for `edge-nonce` it also deletes any route the file does
not list. Deploy a version at 0%, test it, then promote it:

```bash
# From the repository root.
# wrangler reads CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL and CLOUDFLARE_ACCOUNT_ID.
# The repository .env holds the same key and email under other names.
# PRIVATE_CF_API_TOKEN is the account's Global API Key, sent as X-Auth-Key
# (the tools and scripts/deploy-live.mjs use it the same way), not an API token:
set -a; . ./.env; set +a
export CLOUDFLARE_API_KEY="$PRIVATE_CF_API_TOKEN" CLOUDFLARE_EMAIL="$PRIVATE_CF_EMAIL"
export CLOUDFLARE_ACCOUNT_ID=d3604ab61425cd17ccc0c6b2f14ec1dd

# 1. Tests, and guard G1 against the live zone rules (GET only).
python3 workers/tools/dump_rules.py
(cd workers/docs-edge && node --test)
(cd workers/edge-nonce-mcp && node --test)

# 2. Quota: the free plan allows 100,000 Worker requests a day for the whole
#    account. Above about 92,000, wait for 00:00 UTC before testing on Worker routes.
python3 workers/tools/check_quota.py

# 3. Upload, then deploy the new version at 0% beside the live one.
W=workers/<worker>   # wrangler runs from the Worker's directory
(cd $W && pnpm dlx wrangler@latest versions upload --message "...")
(cd $W && pnpm dlx wrangler@latest versions deploy <live>@100% <new>@0% --yes)

# 4. Test the new version only, through the override header, with guard G2.
python3 workers/tools/edge_contract.py --host <host> --override <worker>=<new>

# 5. Promote, confirm fail_open is still on, and three minutes later run G2
#    again with no override (some instances keep the old version that long).
(cd $W && pnpm dlx wrangler@latest versions deploy <new>@100% --yes)
python3 workers/tools/check_quota.py
python3 workers/tools/edge_contract.py

# Roll back
(cd $W && pnpm dlx wrangler@latest versions deploy <previous>@100% --yes)
```

Then record the new version and its rollback in the Worker's README.

This server resolves its own hosts locally. To test through Cloudflare, use
`curl --resolve <host>:443:<ip from dig +short <host> @1.1.1.1>`.

## Tools

| Tool                                  | What it does                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `tools/check_quota.py`                | Workers requests per day against the free quota, and whether every route fails open  |
| `tools/dump_rules.py`                 | Writes the zone's cache rules, response header rules and routes to `rules-dump.json` |
| `tools/edge_contract.py`              | Guard G2: the expected answer of each host at the edge, optionally for a new version |
| `edge-nonce/tools/ae-query.mjs`       | Ad hoc SQL against the Analytics Engine datasets                                     |
| `edge-nonce/tools/full-csp-sweep.mjs` | Every sitemap page in a real browser through the edge: CSP, nonces, bypasses         |
| `edge-nonce-mcp/monitor.mjs`          | Daily probe of mcp.jmrp.io's Worker, run by a systemd timer on the server            |

They read credentials from the repository `.env` and never print them. Every API
call they make is a `GET`, except the SQL queries of `ae-query.mjs` and
`check_quota.py`, which are read-only `POST`s.

## Tests in CI

`pnpm test:unit` runs `node --test` over `scripts/` and `workers/`. The tests that
need the live rules dump, or an earlier copy of the Worker (`DOCS_EDGE_BEFORE`), are
skipped there.
