/**
 * Requests no Worker logs, read from the zone's own HTTP analytics and turned
 * into the rows ae-edge-row.mjs builds for a Worker's record.
 *
 * phonometry.dev serves every file as a static asset, so the Markdown copies,
 * the llms files, the sitemaps, robots.txt and the files of `/.well-known/`
 * run no code and write no Analytics Engine row; only the beacon does, and
 * agents run no script. Cloudflare still records each request to the zone,
 * and its GraphQL dataset `httpRequestsAdaptive` hands them out one by one:
 * time, address, method, path, query, User-Agent, network, country, status,
 * protocol, TLS version, ray id and verified-bot category. The Free plan keeps
 * 31 days of it, 30 at most per query and 10 000 rows per page, and does not
 * give the referrer (`clientRequestReferer` answers "does not have access").
 *
 * The dataset is sampled adaptively, but a row carries no weight to undo it:
 * `ZoneHttpRequestsAdaptive` has no `sampleInterval` (an introspection of its
 * 104 fields on 2026-11-21 found none, and a query naming it is refused with
 * "unknown field"). Sampling drops events instead of weighting them, so each
 * row is one request, and a sampled window undercounts with nothing in the
 * answer to say so. The Worker's own rows stay weighted by
 * `_sample_interval` (ae-to-influx.mjs).
 *
 * A row from here is marked `edge_cache=zone`, so a dashboard can tell it from
 * one a Worker wrote, and it carries the same `ua_class` and `agent` words
 * (ae-ua-class.mjs).
 *
 * While a Worker still logs some of these paths (before the deploy that hands
 * them to the assets, or after a rollback to such a version), the same request
 * would be counted twice. So a source names, for each group of paths, the
 * Worker verdicts that mean the Worker logged that group; a window in which
 * the Worker wrote any of them takes those paths from the Worker alone.
 */

import { edgeRow } from "./ae-edge-row.mjs";
import { agentClass, agentName } from "./ae-ua-class.mjs";

/** Rows per GraphQL page on the Free plan (settings.httpRequestsAdaptive.maxPageSize). */
export const PAGE_SIZE = 10_000;

/**
 * How far back the Free plan keeps httpRequestsAdaptive. A query that starts
 * earlier is refused, so a backfill reads the zone only inside it.
 */
export const ZONE_RETENTION_S = 31 * 86_400;

/**
 * Seconds kept clear of the retention edge: a window that starts right at it
 * when the run begins has aged past it by the time its query is sent.
 */
export const ZONE_RETENTION_MARGIN_S = 600;

/** The fields read for each request. */
export const ZONE_FIELDS = Object.freeze([
  "datetime",
  "clientIP",
  "clientRequestHTTPMethodName",
  "clientRequestPath",
  "clientRequestQuery",
  "clientRequestHTTPProtocol",
  "clientSSLProtocol",
  "userAgent",
  "clientAsn",
  "clientASNDescription",
  "clientCountryName",
  "edgeResponseStatus",
  "rayName",
  "verifiedBotCategory",
]);

/** Escapes a value for a GraphQL string literal. */
const literal = (value) => JSON.stringify(String(value));

/**
 * The GraphQL query for one window of one source and some of its path groups.
 *
 * @param {{zone: string, host: string}} source - The zone and the host asked for.
 * @param {string[]} patterns - `like` patterns of clientRequestPath, any of which matches.
 * @param {number} fromS - Window start, epoch seconds (inclusive).
 * @param {number} toS - Window end, epoch seconds (exclusive).
 * @returns {string} The request body.
 */
export function zoneQuery(source, patterns, fromS, toS) {
  const iso = (s) => new Date(s * 1000).toISOString();
  const any = patterns
    .map((pattern) => `{clientRequestPath_like:${literal(pattern)}}`)
    .join(",");
  const filter = [
    `datetime_geq:${literal(iso(fromS))}`,
    `datetime_lt:${literal(iso(toS))}`,
    `clientRequestHTTPHost:${literal(source.host)}`,
    `requestSource:"eyeball"`,
    `OR:[${any}]`,
  ].join(",");
  const query = `query{viewer{zones(filter:{zoneTag:${literal(source.zone)}}){httpRequestsAdaptive(limit:${PAGE_SIZE},filter:{${filter}},orderBy:[datetime_ASC,rayName_ASC]){${ZONE_FIELDS.join(" ")}}}}}`;
  return JSON.stringify({ query });
}

/**
 * The request class (index1 of a Worker's record) a path belongs to, as far
 * as ae-edge-row.mjs reads it: it names the content type of a copy or an llms
 * file when the row carries none.
 *
 * @param {string} path - The request path.
 * @returns {string} `md-twin`, `llms-txt` or `other`.
 */
export function pathClass(path) {
  if (path === "/index.md" || path.endsWith("/index.md")) return "md-twin";
  if (/^\/llms[^?]*\.txt$/u.test(path)) return "llms-txt";
  return "other";
}

/**
 * One zone request in the shape of a Worker's Analytics Engine row, the shape
 * edgeRow() takes. What the zone does not record stays empty or zero, and
 * edgeRow() leaves an empty value out.
 *
 * @param {object} z - One row of httpRequestsAdaptive.
 * @returns {object} The row.
 */
export function zoneToEdgeRow(z) {
  const ua = String(z.userAgent || "");
  const uaClass = agentClass(ua);
  const misc = Array.from({ length: 14 }, () => "");
  misc[8] = z.verifiedBotCategory || "";
  misc[9] = z.rayName || "";
  const path = String(z.clientRequestPath || "/");
  return {
    ts: Math.floor(Date.parse(z.datetime) / 1000),
    c: pathClass(path),
    p: path,
    qs: String(z.clientRequestQuery || "").replace(/^\?/u, ""),
    ua: uaClass,
    a: agentName(ua, uaClass),
    cc: z.clientCountryName || "",
    asn: Number(z.clientAsn) || 0,
    asn_org: z.clientASNDescription || "",
    proto: z.clientRequestHTTPProtocol || "",
    tls: z.clientSSLProtocol === "none" ? "" : z.clientSSLProtocol || "",
    st: String(z.edgeResponseStatus ?? ""),
    cache: "zone",
    method: z.clientRequestHTTPMethodName || "GET",
    ua_full: ua,
    ip: z.clientIP || "",
    misc: misc.join("|"),
    // One request per row: the dataset has no sample interval (see above).
    n: 1,
  };
}

/**
 * The path patterns a window reads: every group, minus the groups whose paths
 * the Worker logged in that window.
 *
 * @param {{groups: {patterns: string[], workerVerdicts?: string[]}[]}} source - The source.
 * @param {Set<string>} verdictsSeen - The verdicts the Worker wrote in the window.
 * @returns {string[]} The patterns.
 */
export function windowPatterns(source, verdictsSeen) {
  return source.groups
    .filter(({ workerVerdicts = [] }) =>
      workerVerdicts.every((v) => !verdictsSeen.has(v)),
    )
    .flatMap(({ patterns }) => patterns);
}

/**
 * Every zone request of [fromS, toS) on some paths. A page that comes back
 * full is not the whole window: the window is halved until each half fits.
 *
 * @param {{site: string, host: string, zone: string}} source - The zone source (ae-sites.mjs).
 * @param {string[]} patterns - The path patterns.
 * @param {number} fromS - Window start, epoch seconds.
 * @param {number} toS - Window end, epoch seconds.
 * @param {(body: string) => Promise<object>} graphql - Sends a GraphQL body, resolves to its `data`.
 * @returns {Promise<object[]>} The requests, oldest first.
 */
export async function zoneRequests(source, patterns, fromS, toS, graphql) {
  const data = await graphql(zoneQuery(source, patterns, fromS, toS));
  const rows = data.viewer.zones[0]?.httpRequestsAdaptive ?? [];
  if (rows.length < PAGE_SIZE) return rows;
  if (toS - fromS <= 1) {
    throw new Error(
      `${source.site}: more than ${PAGE_SIZE} requests in one second`,
    );
  }
  const mid = Math.floor((fromS + toS) / 2);
  return [
    ...(await zoneRequests(source, patterns, fromS, mid, graphql)),
    ...(await zoneRequests(source, patterns, mid, toS, graphql)),
  ];
}

/**
 * The `nginx_access` lines for the requests a zone source read in [fromS,
 * toS). The Worker's verdicts in the window decide which path groups are
 * read (windowPatterns), so a request the Worker logged is not read twice.
 *
 * Each row gets the timestamps ae-to-influx.mjs gives a Worker's row that
 * has no millisecond clock: the second, then a nine-digit sequence within
 * it. Rows are sorted first, so a re-run of the window rewrites the same
 * points instead of adding new ones.
 *
 * @param {number} fromS - Window start, epoch seconds.
 * @param {number} toS - Window end, epoch seconds.
 * @param {object} source - The zone source (ae-sites.mjs).
 * @param {{aeQuery: (sql: string, account: string) => Promise<object[]>, graphql: (body: string) => Promise<object>}} query
 *   Runs an Analytics Engine SQL query in an account, and a GraphQL body.
 * @returns {Promise<string[]>} Line-protocol lines for database `nginx`.
 */
export async function collectZone(fromS, toS, source, { aeQuery, graphql }) {
  const seen = await aeQuery(
    `SELECT blob12 AS v, count() AS n FROM ${source.worker.dataset} WHERE timestamp >= toDateTime(${fromS}) AND timestamp < toDateTime(${toS}) GROUP BY v`,
    source.worker.account,
  );
  const patterns = windowPatterns(source, new Set(seen.map((r) => r.v)));
  if (patterns.length === 0) return [];
  const rows = (await zoneRequests(source, patterns, fromS, toS, graphql)).map(
    (z) => zoneToEdgeRow(z),
  );
  const key = (r) => [r.ts, r.misc, r.p, r.ip].join("\u{1}");
  rows.sort((x, y) => key(x).localeCompare(key(y)));
  const perSecond = new Map();
  return rows.map((r) => {
    const seq = (perSecond.get(r.ts) || 0) + 1;
    perSecond.set(r.ts, seq);
    const { tags, fields } = edgeRow(r, source);
    return `nginx_access,${tags.join(",")} ${fields.join(",")} ${r.ts}${String(seq).padStart(9, "0")}`;
  });
}

/**
 * The oldest instant a zone query can safely start at: the retention edge
 * plus its margin.
 *
 * @param {number} nowS - The moment the query is about to be sent, epoch seconds.
 * @returns {number} Epoch seconds.
 */
export function zoneRetentionEdge(nowS) {
  return nowS - ZONE_RETENTION_S + ZONE_RETENTION_MARGIN_S;
}

/**
 * The part of a backfill window the zone still keeps: none when the window
 * ends before the retention edge, its start moved up to that edge when it
 * spans it, and the window unchanged otherwise.
 *
 * @param {number} fromS - Window start, epoch seconds.
 * @param {number} toS - Window end, epoch seconds.
 * @param {number} nowS - The moment the query is about to be sent, epoch seconds.
 * @returns {[number, number] | null} [from, to), or null when the zone keeps none of it.
 */
export function zoneBackfillWindow(fromS, toS, nowS) {
  const edge = zoneRetentionEdge(nowS);
  if (toS <= edge) return null;
  return [Math.max(fromS, edge), toS];
}

/**
 * The current time in whole epoch seconds, the clock a backfill reads unless
 * a test gives it another.
 *
 * @returns {number} Epoch seconds.
 */
export function epochSecondsNow() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Cuts each backfill window to what the zone keeps at the moment that window
 * runs, not when the backfill started. Windows run one at a time, oldest
 * first, and each one before the edge still queries every Worker dataset and
 * writes to InfluxDB: a backfill from 2026-08-26 run on 2026-11-21 spends
 * well over the 10-minute margin on those 1,300-odd windows, so an edge fixed
 * at the start would have aged past the 31 days by the first window it lets
 * through, and that query would be refused.
 *
 * @param {() => number} [clock] - Returns the current time, epoch seconds.
 * @returns {(fromS: number, toS: number) => [number, number] | null} zoneBackfillWindow, measured from the clock at each call.
 */
export function zoneBackfillCutter(clock = epochSecondsNow) {
  return (fromS, toS) => zoneBackfillWindow(fromS, toS, clock());
}

/**
 * The one line a backfill prints about the zone sources, or null when the
 * whole range is inside their retention and there is nothing to say.
 *
 * @param {string[]} datasets - The zone sources' dataset names.
 * @param {number} fromS - Backfill start, epoch seconds.
 * @param {number} toS - Backfill end, epoch seconds.
 * @param {number} nowS - The backfill's start, epoch seconds.
 * @returns {string | null} The notice.
 */
export function zoneBackfillNotice(datasets, fromS, toS, nowS) {
  const edge = zoneRetentionEdge(nowS);
  if (datasets.length === 0 || fromS >= edge) return null;
  const keeps = `${datasets.join(", ")}: the zone keeps ${ZONE_RETENTION_S / 86_400} days`;
  if (toS <= edge) {
    return `${keeps}; the whole backfill is older, so they are skipped`;
  }
  return `${keeps}; backfill reads it from about ${new Date(edge * 1000).toISOString()} only`;
}
