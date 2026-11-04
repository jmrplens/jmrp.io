/* cspell:ignore geoip starlark subrequest */
/**
 * One edge-served request as a row of InfluxDB's `nginx_access`: the tags and
 * fields `scripts/ae-to-influx.mjs` writes for a record of the Workers'
 * Analytics Engine datasets. Separate from that script because it runs its
 * ingestion on load; this module only reads the dynamic trust map, so the row
 * shape can be tested.
 *
 * Column names and types are a contract with Telegraf, which writes the same
 * measurement from the access log. InfluxDB 3 never changes a column's type
 * and a mismatch drops the whole batch, so read `information_schema.columns`
 * before adding a column here.
 *
 * ── Cloudflare location (2026-11-04) ───────────────────────────────────────
 * Telegraf fills the cf_* columns from the access log's Cloudflare tail. Edge
 * rows carry the same columns, so a query by cf_city also counts docs.jmrp.io
 * and what the edge serves for jmrp.io and mcp.jmrp.io. The geoip_* columns
 * stay as they were; on these rows they repeat the same Cloudflare data.
 * - Tags: cf_colo, cf_country, cf_continent, cf_region, cf_region_code,
 *   cf_city, cf_tz.
 * - String fields: cf_postal, cf_ray. Float fields: cf_lat, cf_lon.
 * - cf_colo equals edge_colo here. On origin rows, with Tiered Cache, it can
 *   name the data centre that reached the origin instead.
 * - cf_ray here is the ray id the Worker read from the request: 16 hex
 *   digits, without the "-COLO" suffix the origin's cf_ray ends in (cf_colo
 *   holds that). The origin logs the ray of the Worker's subrequest, so the
 *   two never join.
 * - cf_worker and peer_addr describe how a request reached nginx. These rows
 *   have no nginx line, so they stay empty.
 *
 * An absent value is left out, as Telegraf does, so `cf_city IS NULL` means
 * Cloudflare did not know the city.
 */

import fs from "node:fs";
import net from "node:net";

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
 * and equals signs get a backslash. The older `tag()` in ae-to-influx.mjs
 * replaces them with underscores, which the measurements of the `cloudflare`
 * database were written with and must keep (a changed tag value is a new
 * series); nginx_access rows use this one so
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
  // One line at a time: a single multiline regex over the whole file let
  // `^\s*` and `\s+` overlap across line breaks and backtrack super-linearly
  // on a malformed map (SonarCloud S5852). Per line the pattern is anchored
  // at both ends and cannot.
  for (const line of dyn.split("\n")) {
    const m = /^[ \t]*([0-9a-f.:]+)(?:\/(\d+))?[ \t]+1;[ \t]*$/iu.exec(line);
    if (!m) continue;
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

/**
 * Blob 20 of the worker record, split into its named parts: miscBag in the
 * three workers, region|regionCode|tlsCipher|continent|timezone|
 * sec-fetch-dest|sec-fetch-mode|sec-fetch-site|verifiedBot|cf-ray|
 * content-type|accept-encoding|isEUCountry|postalCode. Nothing the client
 * sends comes before sec-fetch-dest, so a "|" in a header can shift cfRay or
 * postalCode, which are string fields, but never the location tags.
 *
 * @param {string} [misc] - The blob; a shorter or empty one leaves parts unset.
 * @returns {Record<string, string | undefined>} The parts this module reads.
 */
export function miscParts(misc) {
  const p = String(misc || "").split("|");
  return {
    region: p[0],
    regionCode: p[1],
    cipher: p[2],
    continent: p[3],
    timezone: p[4],
    fetchDest: p[5],
    fetchMode: p[6],
    fetchSite: p[7],
    verifiedBot: p[8],
    cfRay: p[9],
    contentType: p[10],
    postalCode: p[13],
  };
}

/**
 * Tags and fields of one edge-served request, in nginx_access vocabulary.
 *
 * @param {object} r - One Analytics Engine row.
 * @param {{site: string, host: string}} site - The nginx_access identity.
 * @returns {{tags: string[], fields: string[]}} Line-protocol pieces.
 */
export function edgeRow(r, site) {
  const path = String(r.p || "/").split("?", 1)[0] || "/";
  const request = r.qs ? `${path}?${r.qs}` : path;
  const misc = miscParts(r.misc);
  const tags = [
    "source=edge",
    `client_ip=${tagEsc(r.ip || "cf-edge")}`,
    `verb=${tagEsc(r.method || "GET")}`,
    `request=${tagEsc(request)}`,
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
  // Tags the worker only sometimes knows: written when present, skipped
  // when empty, so an absent value never becomes a "-" series of its own.
  const optionalTags = [
    ["trusted", trustedFlag(r.ip)],
    ["lang", primaryLanguage(r.lang)],
    ["http_version", httpVersion(r.proto)],
    ["ssl_protocol", r.tls],
    ["resp_content_type", misc.contentType || CLASS_CONTENT_TYPE[r.c]],
    ["geoip_region", misc.region],
    ["tls_cipher", misc.cipher],
    ["fetch_dest", misc.fetchDest],
    ["fetch_mode", misc.fetchMode],
    ["fetch_site", misc.fetchSite],
    ["verified_bot", misc.verifiedBot],
    ["cf_colo", r.colo],
    ["cf_country", r.cc],
    ["cf_continent", misc.continent],
    ["cf_region", misc.region],
    ["cf_region_code", misc.regionCode],
    ["cf_city", r.city],
    ["cf_tz", misc.timezone],
  ];
  for (const [name, value] of optionalTags) {
    if (value) tags.push(`${name}=${tagEsc(value)}`);
  }
  const contentLength = Number(r.contentLength) || 0;
  const fields = [
    `resp_bytes=${contentLength}i`,
    `http_accept=${fieldStr(r.accept)}`,
  ];
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (lat !== 0 && lon !== 0 && Number.isFinite(lat) && Number.isFinite(lon)) {
    fields.push(
      `geoip_lat=${lat}`,
      `geoip_lon=${lon}`,
      `cf_lat=${lat}`,
      `cf_lon=${lon}`,
    );
  }
  // Positive numbers only; integers get line protocol's `i` suffix.
  const optionalNumbers = [
    ["geoip_asn", r.asn, true],
    ["edge_rtt_ms", r.rtt, false],
    ["edge_ms", r.edge_ms, false],
    ["edge_age", r.age, true],
  ];
  for (const [name, raw, integer] of optionalNumbers) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    fields.push(integer ? `${name}=${Math.trunc(value)}i` : `${name}=${value}`);
  }
  if (misc.cfRay) fields.push(`cf_ray=${fieldStr(misc.cfRay)}`);
  // Quoted even when all digits: the column is a string in InfluxDB.
  if (misc.postalCode) fields.push(`cf_postal=${fieldStr(misc.postalCode)}`);
  return { tags, fields };
}
