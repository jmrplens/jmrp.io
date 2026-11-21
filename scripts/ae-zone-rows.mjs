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

import { agentClass, agentName } from "./ae-ua-class.mjs";

/** Rows per GraphQL page on the Free plan (settings.httpRequestsAdaptive.maxPageSize). */
export const PAGE_SIZE = 10_000;

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
