#!/usr/bin/env node
/**
 * Ad-hoc SQL against the worker's Analytics Engine dataset.
 *
 * The README documents the `curl` for this a few lines above; this is the same
 * request with the auth and the JSON unwrapping already done, because the
 * useful queries are exploratory and retyping the credentials each time is how
 * you end up not looking.
 *
 * WHY THIS DATASET AND NOT THE NGINX LOG: the edge answers roughly 70% of the
 * traffic without the origin ever hearing about it: cache hits, and anything
 * the worker resolves itself. Measured 2026-08-29: 5,599 requests at the edge
 * against ~1,700 at the origin in the same 24 h. A question about what the
 * world sends this site can only be answered here.
 *
 * ALWAYS `SUM(_sample_interval)`, NEVER `COUNT(*)`: Analytics Engine samples
 * under load and the interval is the weight each row carries. COUNT silently
 * undercounts exactly when traffic is interesting.
 *
 * Blob layout (contract shared with ae-to-influx.mjs and traffic-report.mjs):
 *   blob1  path          blob2  UA class        blob3  country
 *   blob4  named agent   blob5  referer host    blob6  colo
 *   blob7  city          blob8  ASN org         blob9  HTTP protocol
 *   blob10 TLS version   blob11 status          blob12 cache verdict
 *   blob13 Accept (64)   ── appended 2026-09-05 (evening), both workers: ──
 *   blob14 method        blob15 full User-Agent (256)   blob16 client IP
 *   blob17 Accept-Language (64)   blob18 full referer (200)
 *   blob19 query string (128, no "?")
 *   blob20 misc "|"-joined: region|regionCode|tlsCipher|continent|timezone|
 *          sec-fetch-dest|sec-fetch-mode|sec-fetch-site|verifiedBot|cf-ray|
 *          response content-type|accept-encoding|isEUCountry|postalCode
 *   double1 latitude     double2 longitude      double3 ASN
 *   double4 client TCP RTT ms   double5 response Content-Length
 *   double6 response Age   double7 worker time ms   double8 bot score
 *   double9 request time (ms epoch)
 *   The same layout lives in `mcp_edge_requests` (mcp.jmrp.io's worker,
 *   logging since 2026-09-05); rows older than that evening have blobs 14+
 *   empty and doubles 3+ at 0.
 *
 * Cache verdicts worth knowing when reading results: `HIT`/`MISS` are the plain
 * cache; `bypass-no-placeholder` is the worker declining to cache a response
 * that carries no nonce placeholder, which is what every tarpit response is,
 * so trap hits always reach the origin; `passthrough` is a non-GET/HEAD method
 * handed straight to the origin.
 *
 * Usage:
 *   node workers/edge-nonce/tools/ae-query.mjs "SELECT ... LIMIT 20"
 *   node workers/edge-nonce/tools/ae-query.mjs --json "SELECT ..."
 *
 * Retention is about 90 days.
 */
import process from "node:process";

process.loadEnvFile(new URL("../../../.env", import.meta.url));

// The account id is not secret; it is also in each Worker's wrangler.toml.
const ACCOUNT =
  process.env.PRIVATE_CF_ACCOUNT_ID ?? "d3604ab61425cd17ccc0c6b2f14ec1dd";
const EMAIL = process.env.PRIVATE_CF_EMAIL;
const KEY = process.env.PRIVATE_CF_API_TOKEN;

/**
 * Runs one SQL statement against Analytics Engine.
 *
 * @param {string} sql - The statement to run.
 * @returns {Promise<object[]>} The result rows.
 */
async function query(sql) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": EMAIL,
        "X-Auth-Key": KEY,
        "Content-Type": "text/plain",
      },
      body: sql,
    },
  );
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The SQL API reports syntax errors as plain text, not as JSON.
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`);
  }
  if (parsed.errors?.length) {
    throw new Error(JSON.stringify(parsed.errors));
  }
  return parsed.data ?? [];
}

const args = process.argv.slice(2);
const asJson = args[0] === "--json";
const sql = (asJson ? args[1] : args[0])?.trim();

if (!sql) {
  console.error(
    'uso: node ae-query.mjs [--json] "SELECT blob1, SUM(_sample_interval) AS n\n' +
      "     FROM jmrp_edge_requests WHERE timestamp > NOW() - INTERVAL '24' HOUR\n" +
      '     GROUP BY blob1 ORDER BY n DESC LIMIT 20"',
  );
  process.exit(2);
}

/**
 * The rows hold what visitors sent (paths, user agents, referers). Control
 * characters, C1 included, would reach the terminal as escape sequences, so
 * every printed value has them replaced.
 *
 * @param {unknown} value - A value to print.
 * @returns {string} The value as text, without control characters.
 */
const printable = (value) =>
  String(value).replaceAll(/[\u{0}-\u{8}\u{B}-\u{1F}\u{7F}-\u{9F}]/gu, "?");

let rows;
try {
  rows = await query(sql);
} catch (error) {
  // A SQL syntax error is the normal case here, not a failure of the
  // program: report it in one line, without a stack trace.
  console.error(`error: ${printable(error.message)}`);
  process.exit(1);
}
if (asJson || rows.length === 0) {
  console.log(printable(JSON.stringify(rows, null, 1)));
} else {
  // Column-aligned so a wide result stays readable in a terminal.
  const columns = Object.keys(rows[0]);
  const width = Object.fromEntries(
    columns.map((c) => [
      c,
      Math.min(60, Math.max(c.length, ...rows.map((r) => String(r[c]).length))),
    ]),
  );
  const line = (cells) =>
    columns.map((c, i) => printable(cells[i]).padEnd(width[c])).join("  ");
  console.log(line(columns));
  console.log(columns.map((c) => "-".repeat(width[c])).join("  "));
  for (const r of rows) {
    console.log(line(columns.map((c) => String(r[c]).slice(0, 60))));
  }
  console.log(`\n${rows.length} rows`);
}
