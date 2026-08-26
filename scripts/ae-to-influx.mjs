/* cspell:ignore otros vacio */
/**
 * Cloudflare Analytics Engine → InfluxDB 3 ingestion.
 *
 * Pulls the edge worker's per-request registry (`jmrp_edge_requests`, written
 * by plan/edge-nonce-worker/worker.js on every request) and lands it in the
 * monitoring stack's InfluxDB 3 so Grafana can chart the EDGE side of jmrp.io
 * next to the nginx origin dashboards. This replaces the paid Cloudflare
 * Grafana plugin: the data is already ours, no zone-analytics API involved.
 *
 * ── Why a stateful window and not a telegraf input ─────────────────────────
 * Analytics Engine ingests with a few minutes of lag, and its SQL API can
 * only be polled. A stateless poller (telegraf `inputs.http`) re-reads
 * overlapping windows and either double-counts or misses the lagging tail.
 * This script keeps the END of the last ingested window in a state file and
 * always queries the exact adjacent window, capped at now-6min so the lag has
 * settled. Re-runs are idempotent: same window → same points → InfluxDB
 * overwrites identical series+timestamp.
 *
 * ── Cardinality control ────────────────────────────────────────────────────
 * Scanner junk would explode a per-path tag. Only the classes with bounded,
 * meaningful paths keep them (md-twin, llms-txt, pdf, feed-xml); `page` keeps
 * the top 20 per window and folds the rest into "(otros)"; `asset`/`other`
 * are counted but never tagged by path.
 *
 * Measurements (database `cloudflare`, 5-minute buckets):
 * - cf_requests,class=,ua=      n=<sum>
 * - cf_countries,country=       n=<sum>
 * - cf_paths,class=,path=       n=<sum>
 *
 * Runs from a systemd timer every 5 minutes. Manual: `node scripts/ae-to-influx.mjs`.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
} catch {
  // Shell env is fine.
}
const { PRIVATE_CF_API_TOKEN, PRIVATE_CF_EMAIL, INFLUX3_URL, INFLUX3_TOKEN } =
  process.env;
const CF_ACCOUNT = "d3604ab61425cd17ccc0c6b2f14ec1dd";
const DB = "cloudflare";
const STATE_DIR = "/var/lib/ae-influx";
const STATE_FILE = path.join(STATE_DIR, "state.json");
const BUCKET_S = 300; // 5-minute buckets
const LAG_S = 360; // do not read the last 6 minutes (ingestion lag)
const MAX_WINDOW_S = 24 * 3600; // first run / long outage backfill cap

/** Runs one SQL query against the Analytics Engine SQL API. */
async function aeQuery(sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": PRIVATE_CF_EMAIL,
        "X-Auth-Key": PRIVATE_CF_API_TOKEN,
      },
      body: `${sql} FORMAT JSONEachRow`,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`AE ${res.status}: ${text.slice(0, 140)}`);
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const row = JSON.parse(l);
      if ("n" in row) row.n = Number(row.n); // JSONEachRow stringifies numbers
      return row;
    });
}

/** Escapes a line-protocol tag value. */
const tag = (s) =>
  String(s || "(vacio)")
    .replaceAll(/[ ,=\\]/gu, "_")
    .slice(0, 120);

/** Builds the line-protocol payload for one closed window. */
async function collectWindow(fromS, toS) {
  const W = `WHERE timestamp >= toDateTime(${fromS}) AND timestamp < toDateTime(${toS})`;
  const B = `toUnixTimestamp(toStartOfInterval(timestamp, INTERVAL '5' MINUTE)) AS t`;
  const lines = [];

  const classes = await aeQuery(
    `SELECT ${B}, index1 AS c, blob2 AS ua, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} GROUP BY t, c, ua`,
  );
  for (const r of classes) {
    lines.push(
      `cf_requests,class=${tag(r.c)},ua=${tag(r.ua)} n=${r.n}i ${r.t}`,
    );
  }

  const countries = await aeQuery(
    `SELECT ${B}, blob3 AS cc, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} GROUP BY t, cc`,
  );
  for (const r of countries) {
    lines.push(`cf_countries,country=${tag(r.cc)} n=${r.n}i ${r.t}`);
  }

  const paths = await aeQuery(
    `SELECT ${B}, index1 AS c, blob1 AS p, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${W} AND index1 IN ('page','md-twin','llms-txt','pdf','feed-xml') GROUP BY t, c, p`,
  );
  const byBucket = new Map();
  for (const r of paths) {
    const key = `${r.t}|${r.c}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(r);
  }
  for (const [key, rows] of byBucket) {
    const [t, c] = key.split("|", 2);
    rows.sort((a, b) => b.n - a.n);
    const keep = c === "page" ? rows.slice(0, 20) : rows;
    const rest = c === "page" ? rows.slice(20) : [];
    for (const r of keep) {
      lines.push(`cf_paths,class=${tag(c)},path=${tag(r.p)} n=${r.n}i ${t}`);
    }
    const restSum = rest.reduce((a, r) => a + r.n, 0);
    if (restSum > 0) {
      lines.push(`cf_paths,class=${tag(c)},path=(otros) n=${restSum}i ${t}`);
    }
  }
  return lines;
}

/** Writes line protocol to InfluxDB 3 (v2-compatible endpoint). */
async function influxWrite(lines) {
  if (lines.length === 0) return;
  const res = await fetch(
    `${INFLUX3_URL}/api/v2/write?org=default&bucket=${DB}&precision=s`,
    {
      method: "POST",
      headers: { Authorization: `Token ${INFLUX3_TOKEN}` },
      body: lines.join("\n"),
    },
  );
  if (!res.ok) {
    throw new Error(
      `influx ${res.status}: ${(await res.text()).slice(0, 140)}`,
    );
  }
}

async function main() {
  const nowS = Math.floor(Date.now() / 1000);
  // Window end: last completed 5-min bucket older than the lag guard.
  const toS = Math.floor((nowS - LAG_S) / BUCKET_S) * BUCKET_S;
  let fromS = toS - BUCKET_S;
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (Number.isSafeInteger(st.lastEnd)) fromS = st.lastEnd;
  } catch {
    fromS = toS - MAX_WINDOW_S; // first run: backfill a day
  }
  fromS = Math.max(fromS, toS - MAX_WINDOW_S);
  if (fromS >= toS) {
    console.log("[ae-influx] window not ready yet, nothing to do");
    return;
  }
  const lines = await collectWindow(fromS, toS);
  await influxWrite(lines);
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastEnd: toS }));
  console.log(
    `[ae-influx] ${new Date(fromS * 1000).toISOString()} → ${new Date(toS * 1000).toISOString()}: ${lines.length} points`,
  );
}

await main();
