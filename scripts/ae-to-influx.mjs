/* cspell:ignore otros vacio referers geoip starlark undercounts */
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
 * Worker v2 rows (blob11 = status marks them) additionally feed:
 * - cf_agents,agent=            n         (named AI crawlers, bots, browsers)
 * - cf_status,class=,status=,cache=  n    (edge verdicts: HIT/MISS/redirects)
 * - cf_geo,country=,city=       n,lat,lon (Cloudflare's own geolocation)
 * - cf_referers,ref=            n         (external referer hosts)
 * - cf_proto,proto=,tls=        n
 *
 * ── Edge-served requests into the nginx measurement (2026-09-05) ────────
 * The origin only ever sees about a third of the traffic; the rest is served
 * from the edge cache and never reaches nginx or its logs. So the "Nginx
 * (InfluxDB3)" dashboard, which counts rows of `nginx_access`, undercounts.
 * For every request the worker answered WITHOUT the origin (cache verdict
 * HIT, or a redirect the worker minted itself), this script writes one row
 * per request into database `nginx`, measurement `nginx_access`, with the
 * same tag names Telegraf produces from the access log plus `source=edge`
 * (Telegraf tags its own rows `source=nginx`). Requests the origin DID see
 * (MISS, EXPIRED, REVALIDATED, bypass, passthrough) are already in the log
 * and are deliberately skipped, so origin + edge rows add up to the real
 * total with nothing counted twice.
 *
 * What the edge does not know is filled honestly: `client_ip` is the literal
 * `cf-edge` (the worker never records visitor IPs), `verb` is GET (only
 * GET/HEAD are cacheable), `resp_bytes` is 0 (unknown; it exists because the
 * dashboards count rows with count(resp_bytes)), and `resp_content_type` is
 * derived from the request class only where it is certain (page, md-twin,
 * llms-txt, feed-xml). `agent` and `ua_class` carry the named crawler or
 * browser family, not a full User-Agent string. `site`, `request_clean` and
 * `ua_class` mirror what the Telegraf starlark processor derives for nginx
 * rows (one dataset per edge worker, see EDGE_SITES: jmrp.io and, since
 * 2026-09-05, mcp.jmrp.io); `edge=1`, `ssl_protocol` and the GeoIP coordinates come from the
 * worker's own record. `trusted` and `lang` do not exist on edge rows.
 *
 * ── Backfill ──────────────────────────────────────────────────────────────
 * `node scripts/ae-to-influx.mjs --backfill-from 2026-08-26T17:00:00Z
 * [--backfill-to <iso>]` replays the edge-served rows (nginx_access only)
 * hour by hour from that instant up to the end recorded in the state file,
 * without touching the state. Timestamps are deterministic, so replaying a
 * window rewrites the same points.
 *
 * Runs from a systemd timer every 5 minutes. Manual: `node scripts/ae-to-influx.mjs`.
 */

import fs from "node:fs";
import net from "node:net";
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
const NGINX_DB = "nginx";
/**
 * Every edge worker that keeps a per-request log with the shared blob
 * layout, and the nginx_access identity its edge-served rows carry.
 * mcp.jmrp.io's worker started logging on 2026-09-05; before that there is
 * nothing to ingest for it.
 */
const EDGE_SITES = [
  { dataset: "jmrp_edge_requests", site: "jmrp", host: "jmrp.io" },
  { dataset: "mcp_edge_requests", site: "mcp", host: "mcp.jmrp.io" },
];
/** Cache verdicts the origin never saw: the request ended at the edge. */
const EDGE_ONLY_VERDICTS = [
  "HIT",
  "markdown-negotiation",
  "rss-human-redirect",
];
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

/** Groups AE rows by their time bucket (`t`). */
function groupByBucket(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.t)) map.set(r.t, []);
    map.get(r.t).push(r);
  }
  return map;
}

/**
 * Per-path series, with the long tail of page paths folded into one bucket.
 *
 * Only `page` is capped: the other classes are small closed sets, while page
 * paths are unbounded and would otherwise create a new InfluxDB series for
 * every URL a scanner invents.
 *
 * @param {object[]} paths - Rows of {t, c, p, n}.
 * @returns {string[]} Line-protocol lines.
 */
function pathLines(paths) {
  const byBucket = new Map();
  for (const r of paths) {
    const key = `${r.t}|${r.c}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(r);
  }
  const out = [];
  for (const [key, rows] of byBucket) {
    const [t, c] = key.split("|", 2);
    rows.sort((a, b) => b.n - a.n);
    const capped = c === "page";
    for (const r of capped ? rows.slice(0, 20) : rows) {
      out.push(`cf_paths,class=${tag(c)},path=${tag(r.p)} n=${r.n}i ${t}`);
    }
    const restSum = capped ? rows.slice(20).reduce((a, r) => a + r.n, 0) : 0;
    if (restSum > 0) {
      out.push(`cf_paths,class=${tag(c)},path=(otros) n=${restSum}i ${t}`);
    }
  }
  return out;
}

/**
 * City-level series, top 30 cities per bucket.
 *
 * @param {object[]} geo - Rows of {t, cc, city, lat, lon, n}.
 * @returns {string[]} Line-protocol lines.
 */
function geoLines(geo) {
  const out = [];
  for (const [t, rows] of groupByBucket(geo)) {
    for (const r of rows.slice(0, 30)) {
      out.push(
        `cf_geo,country=${tag(r.cc)},city=${tag(r.city)} n=${r.n}i,lat=${Number(r.lat)},lon=${Number(r.lon)} ${t}`,
      );
    }
  }
  return out;
}

/**
 * Referer series, top 15 per bucket with the tail summed into one entry.
 *
 * @param {object[]} referers - Rows of {t, ref, n}.
 * @returns {string[]} Line-protocol lines.
 */
function refererLines(referers) {
  const out = [];
  for (const [t, rows] of groupByBucket(referers)) {
    for (const r of rows.slice(0, 15)) {
      out.push(`cf_referers,ref=${tag(r.ref)} n=${r.n}i ${t}`);
    }
    const rest = rows.slice(15).reduce((a, r) => a + r.n, 0);
    if (rest > 0) out.push(`cf_referers,ref=(otros) n=${rest}i ${t}`);
  }
  return out;
}

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
  lines.push(...pathLines(paths));
  // ── Worker v2 dimensions (blob11 = final status marks the new rows) ──────
  const V2 = `${W} AND blob11 != ''`;

  const agents = await aeQuery(
    `SELECT ${B}, blob4 AS a, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${V2} GROUP BY t, a`,
  );
  for (const r of agents) {
    lines.push(`cf_agents,agent=${tag(r.a)} n=${r.n}i ${r.t}`);
  }

  const statuses = await aeQuery(
    `SELECT ${B}, index1 AS c, blob11 AS st, blob12 AS cache, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${V2} GROUP BY t, c, st, cache`,
  );
  for (const r of statuses) {
    lines.push(
      `cf_status,class=${tag(r.c)},status=${tag(r.st)},cache=${tag(r.cache)} n=${r.n}i ${r.t}`,
    );
  }

  // Geolocation: city-level with Cloudflare's own coordinates. Top 30 cities
  // per bucket; the tail folds into the country with no city to keep the
  // series set bounded.
  const geo = await aeQuery(
    `SELECT ${B}, blob3 AS cc, blob7 AS city, AVG(double1) AS lat, AVG(double2) AS lon, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${V2} AND double1 != 0 GROUP BY t, cc, city ORDER BY n DESC`,
  );
  lines.push(...geoLines(geo));

  const referers = await aeQuery(
    `SELECT ${B}, blob5 AS ref, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${V2} AND blob5 != '' GROUP BY t, ref ORDER BY n DESC`,
  );
  lines.push(...refererLines(referers));

  const proto = await aeQuery(
    `SELECT ${B}, blob9 AS pr, blob10 AS tls, SUM(_sample_interval) AS n FROM jmrp_edge_requests ${V2} GROUP BY t, pr, tls`,
  );
  for (const r of proto) {
    lines.push(
      `cf_proto,proto=${tag(r.pr)},tls=${tag(r.tls)} n=${r.n}i ${r.t}`,
    );
  }

  return lines;
}

/** Content-Type the edge served, derived from the request class when certain. */
const CLASS_CONTENT_TYPE = {
  page: "text/html; charset=utf-8",
  "md-twin": "text/markdown; charset=utf-8",
  "llms-txt": "text/plain; charset=utf-8",
  "feed-xml": "application/rss+xml; charset=utf-8",
};

/** nginx logs "HTTP/2.0"; the worker records "HTTP/2". Same for 3 and 1.x. */
function httpVersion(proto) {
  const m = /^HTTP\/(\d+(?:\.\d+)?)$/u.exec(proto || "");
  if (!m) return "";
  return m[1].includes(".") ? m[1] : `${m[1]}.0`;
}

/**
 * Escapes a tag value for line protocol without changing it: spaces, commas
 * and equals signs get a backslash. The older `tag()` above replaces them with
 * underscores, which the `cf_*` measurements were written with and must keep
 * (a changed tag value is a new series); nginx_access rows use this one so
 * "Google LLC" here is the same "Google LLC" Telegraf writes for origin rows.
 * Edge rows written before 2026-09-05 22:00 carry the underscored form.
 */
const tagEsc = (s) =>
  String(s || "-")
    .replaceAll("\\", "\\\\")
    .replaceAll(" ", String.raw`\ `)
    .replaceAll(",", String.raw`\,`)
    .replaceAll("=", String.raw`\=`)
    .slice(0, 200);

/** Escapes a line-protocol string field (JSON escaping of `"` and `\\` is what LP wants). */
const fieldStr = (s) => JSON.stringify(String(s ?? "").slice(0, 255));

/**
 * Own addresses, so edge rows can carry the same `trusted` tag nginx rows
 * get from `geo $is_trusted_ip`: loopback and RFC 1918 statically, plus the
 * DDNS entries the whitelist script keeps in nginx's dynamic map.
 */
const TRUSTED = new net.BlockList();
TRUSTED.addAddress("127.0.0.1");
TRUSTED.addAddress("::1", "ipv6");
// RFC 1918 ranges, the same three `geo $is_trusted_ip` lists; not hosts.
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- private range, RFC 1918
TRUSTED.addSubnet("192.168.0.0", 16);
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- private range, RFC 1918
TRUSTED.addSubnet("10.0.0.0", 8);
// eslint-disable-next-line sonarjs/no-hardcoded-ip -- private range, RFC 1918
TRUSTED.addSubnet("172.16.0.0", 12);
try {
  const dyn = fs.readFileSync(
    "/etc/nginx/snippets/trusted_ip_map_dynamic.conf",
    "utf8",
  );
  for (const m of dyn.matchAll(/^\s*([0-9a-f.:]+)(?:\/(\d+))?\s+1;/gimu)) {
    const family = m[1].includes(":") ? "ipv6" : "ipv4";
    if (m[2]) TRUSTED.addSubnet(m[1], Number(m[2]), family);
    else TRUSTED.addAddress(m[1], family);
  }
} catch {
  // No dynamic map on this host: the static ranges still apply.
}

/** "1" | "0" for a known address, undefined when the edge recorded none. */
function trustedFlag(ip) {
  if (!ip || !net.isIP(ip)) return;
  const family = net.isIPv6(ip) ? "ipv6" : "ipv4";
  return TRUSTED.check(ip, family) ? "1" : "0";
}

/** Primary language of an Accept-Language value, lowercased ("es-ES,…" → "es"). */
function primaryLanguage(value) {
  const m = /^\s*([a-z]{2,3})(?:[-_][a-z0-9]{2,8})*\s*(?:[,;]|$)/iu.exec(
    value || "",
  );
  return m ? m[1].toLowerCase() : undefined;
}

/** Blob 20 of the worker record, split into its named parts. */
function miscParts(misc) {
  const p = String(misc || "").split("|");
  return {
    region: p[0],
    cipher: p[2],
    fetchDest: p[5],
    fetchMode: p[6],
    fetchSite: p[7],
    verifiedBot: p[8],
    cfRay: p[9],
    contentType: p[10],
  };
}

/**
 * Tags and fields of one edge-served request, in nginx_access vocabulary.
 *
 * @param {object} r - One Analytics Engine row.
 * @param {{site: string, host: string}} site - The nginx_access identity.
 * @returns {{tags: string[], fields: string[]}} Line-protocol pieces.
 */
function edgeRow(r, site) {
  const path = String(r.p || "/").split("?", 1)[0] || "/";
  const misc = miscParts(r.misc);
  const tags = [
    "source=edge",
    `client_ip=${tagEsc(r.ip || "cf-edge")}`,
    `verb=${tagEsc(r.method || "GET")}`,
    `request=${tagEsc(r.qs ? `${path}?${r.qs}` : path)}`,
    `request_clean=${tagEsc(path)}`,
    `resp_code=${tagEsc(r.st)}`,
    `referrer=${tagEsc(r.referer_full || r.ref || "-")}`,
    // Full User-Agent when the worker recorded it (blobs 14+, from
    // 2026-09-05 evening); the named agent/family before that.
    `agent=${tagEsc(r.ua_full || r.a || r.ua || "-")}`,
    `server_name=${site.host}`,
    `site=${site.site}`,
    `geoip_country_code=${tagEsc(r.cc || "-")}`,
    `geoip_city_name=${tagEsc(r.city || "-")}`,
    `geoip_asn_org=${tagEsc(r.asn_org || r.asn || "-")}`,
    `edge_cache=${tagEsc(r.cache)}`,
    `edge_colo=${tagEsc(r.colo || "-")}`,
    // Same vocabulary as the Telegraf starlark: named crawler or family.
    `ua_class=${tagEsc(r.a || r.ua || "-")}`,
    // Every edge-served request came through the worker by definition.
    "edge=1",
  ];
  const trusted = trustedFlag(r.ip);
  if (trusted) tags.push(`trusted=${trusted}`);
  const lang = primaryLanguage(r.lang);
  if (lang) tags.push(`lang=${tagEsc(lang)}`);
  const hv = httpVersion(r.proto);
  if (hv) tags.push(`http_version=${hv}`);
  if (r.tls) tags.push(`ssl_protocol=${tagEsc(r.tls)}`);
  const ct = misc.contentType || CLASS_CONTENT_TYPE[r.c];
  if (ct) tags.push(`resp_content_type=${tagEsc(ct)}`);
  if (misc.region) tags.push(`geoip_region=${tagEsc(misc.region)}`);
  if (misc.cipher) tags.push(`tls_cipher=${tagEsc(misc.cipher)}`);
  if (misc.fetchDest) tags.push(`fetch_dest=${tagEsc(misc.fetchDest)}`);
  if (misc.fetchMode) tags.push(`fetch_mode=${tagEsc(misc.fetchMode)}`);
  if (misc.fetchSite) tags.push(`fetch_site=${tagEsc(misc.fetchSite)}`);
  if (misc.verifiedBot) tags.push(`verified_bot=${tagEsc(misc.verifiedBot)}`);
  const contentLength = Number(r.contentLength) || 0;
  const fields = [
    `resp_bytes=${contentLength}i`,
    `http_accept=${fieldStr(r.accept)}`,
  ];
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (lat !== 0 && lon !== 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
    fields.push(`geoip_lat=${lat}`, `geoip_lon=${lon}`);
  }
  if (Number(r.asn) > 0) fields.push(`geoip_asn=${Math.trunc(Number(r.asn))}i`);
  if (Number(r.rtt) > 0) fields.push(`edge_rtt_ms=${Number(r.rtt)}`);
  if (Number(r.edge_ms) > 0) fields.push(`edge_ms=${Number(r.edge_ms)}`);
  if (Number(r.age) > 0) fields.push(`edge_age=${Math.trunc(Number(r.age))}i`);
  if (misc.cfRay) fields.push(`cf_ray=${fieldStr(misc.cfRay)}`);
  return { tags, fields };
}

/**
 * One `nginx_access` row per edge-served request in the window.
 *
 * Rows are sorted deterministically and spread over the nanoseconds of their
 * second, so identical requests in the same second become distinct points
 * and a re-run of the same window rewrites the same points instead of
 * adding new ones.
 *
 * @param {number} fromS - Window start (unix seconds, inclusive).
 * @param {number} toS - Window end (unix seconds, exclusive).
 * @returns {Promise<string[]>} Line-protocol lines for database `nginx`.
 */
async function collectEdgeServed(fromS, toS, site = EDGE_SITES[0]) {
  const verdicts = EDGE_ONLY_VERDICTS.map((v) => `'${v}'`).join(", ");
  const rows = await aeQuery(
    `SELECT toUnixTimestamp(timestamp) AS ts, index1 AS c, blob1 AS p, blob2 AS ua, blob3 AS cc, blob4 AS a, blob5 AS ref, blob6 AS colo, blob7 AS city, blob8 AS asn_org, blob9 AS proto, blob10 AS tls, blob11 AS st, blob12 AS cache, blob13 AS accept, blob14 AS method, blob15 AS ua_full, blob16 AS ip, blob17 AS lang, blob18 AS referer_full, blob19 AS qs, blob20 AS misc, double1 AS lat, double2 AS lon, double3 AS asn, double4 AS rtt, double5 AS contentLength, double6 AS age, double7 AS edge_ms, double9 AS tms, _sample_interval AS n FROM ${site.dataset} WHERE timestamp >= toDateTime(${fromS}) AND timestamp < toDateTime(${toS}) AND blob11 != '' AND blob12 IN (${verdicts})`,
  );
  const key = (r) =>
    [
      r.tms,
      r.ts,
      r.p,
      r.ip,
      r.a,
      r.cc,
      r.city,
      r.asn_org,
      r.st,
      r.cache,
      r.proto,
      r.ref,
    ].join("\u{1}");
  rows.sort((x, y) => key(x).localeCompare(key(y)));
  const perSecond = new Map();
  const lines = [];
  for (const r of rows) {
    const ts = Number(r.ts);
    const weight = Math.max(1, Number(r.n) || 1);
    for (let i = 0; i < weight; i += 1) {
      const seq = (perSecond.get(ts) || 0) + 1;
      perSecond.set(ts, seq);
      const { tags, fields } = edgeRow(r, site);
      // Nanosecond timestamp. With the worker's own millisecond clock (double
      // 9, from 2026-09-05 evening) the point sits at that millisecond plus a
      // per-millisecond sequence; older rows only have the AE second.
      const tms = Number(r.tms);
      let nanos;
      if (tms > 0) {
        const msKey = `ms:${tms}`;
        const seqMs = (perSecond.get(msKey) || 0) + 1;
        perSecond.set(msKey, seqMs);
        nanos = `${Math.trunc(tms)}${String(seqMs).padStart(6, "0")}`;
      } else {
        nanos = `${ts}${String(seq).padStart(9, "0")}`;
      }
      lines.push(`nginx_access,${tags.join(",")} ${fields.join(",")} ${nanos}`);
    }
  }
  return lines;
}

/** Writes line protocol to InfluxDB 3 (v2-compatible endpoint). */
async function influxWrite(lines, db = DB, precision = "s") {
  if (lines.length === 0) return;
  const res = await fetch(
    `${INFLUX3_URL}/api/v2/write?org=default&bucket=${db}&precision=${precision}`,
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

/** Replays edge-served rows for [fromS, toS) in one-hour windows. */
async function backfill(fromS, toS) {
  const HOUR = 3600;
  let total = 0;
  for (let a = fromS; a < toS; a += HOUR) {
    const b = Math.min(a + HOUR, toS);
    const lines = [];
    for (const site of EDGE_SITES) {
      lines.push(...(await collectEdgeServed(a, b, site)));
    }
    await influxWrite(lines, NGINX_DB, "ns");
    total += lines.length;
    console.log(
      `[ae-influx] backfill ${new Date(a * 1000).toISOString()} → ${new Date(b * 1000).toISOString()}: ${lines.length} edge-served rows`,
    );
  }
  console.log(`[ae-influx] backfill done: ${total} edge-served rows`);
}

/** Reads `--name value` from argv. */
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const backfillFrom = argValue("--backfill-from");
  if (backfillFrom) {
    const fromS = Math.floor(Date.parse(backfillFrom) / 1000);
    let toS;
    const toArg = argValue("--backfill-to");
    toS = toArg
      ? Math.floor(Date.parse(toArg) / 1000)
      : JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).lastEnd;
    if (
      !Number.isSafeInteger(fromS) ||
      !Number.isSafeInteger(toS) ||
      fromS >= toS
    ) {
      throw new Error("backfill: invalid range");
    }
    await backfill(fromS, toS);
    return;
  }
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
  const edgeLines = [];
  for (const site of EDGE_SITES) {
    edgeLines.push(...(await collectEdgeServed(fromS, toS, site)));
  }
  await influxWrite(lines);
  await influxWrite(edgeLines, NGINX_DB, "ns");
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastEnd: toS }));
  console.log(
    `[ae-influx] ${new Date(fromS * 1000).toISOString()} → ${new Date(toS * 1000).toISOString()}: ${lines.length} points (cloudflare), ${edgeLines.length} edge-served rows (nginx_access)`,
  );
}

await main();
