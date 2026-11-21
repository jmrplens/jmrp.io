/* cspell:ignore geoip -- Influx column names written by ae-edge-row.mjs */
import assert from "node:assert/strict";
import { test } from "node:test";

import { edgeRow } from "./ae-edge-row.mjs";
import { nextState, ZONE_SOURCES } from "./ae-sites.mjs";
import {
  collectZone,
  PAGE_SIZE,
  pathClass,
  windowPatterns,
  ZONE_FIELDS,
  ZONE_RETENTION_MARGIN_S,
  ZONE_RETENTION_S,
  zoneBackfillCutter,
  zoneBackfillNotice,
  zoneBackfillWindow,
  zoneQuery,
  zoneRequests,
  zoneToEdgeRow,
} from "./ae-zone-rows.mjs";

const source = ZONE_SOURCES.find((s) => s.dataset === "zone:phonometry.dev");

const GPTBOT = {
  datetime: "2026-11-21T08:03:45Z",
  clientIP: "203.0.113.9",
  clientRequestHTTPMethodName: "GET",
  clientRequestPath: "/signals/index.md",
  clientRequestQuery: "?lang=en",
  clientRequestHTTPProtocol: "HTTP/2",
  clientSSLProtocol: "TLSv1.3",
  userAgent:
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot",
  clientAsn: "8075",
  clientASNDescription: "Microsoft Corporation",
  clientCountryName: "US",
  edgeResponseStatus: "200",
  rayName: "a5de2e01ef6de8ea",
  verifiedBotCategory: "AI Crawler",
};

test("the query asks one zone, one host, eyeball requests, a half-open window and any of the patterns", () => {
  const body = JSON.parse(
    zoneQuery(
      source,
      ["/robots.txt", "%/index.md"],
      1_763_712_000,
      1_763_712_300,
    ),
  );
  assert.match(body.query, /zoneTag:"594554a63737deee229566971a765fd4"/);
  assert.match(body.query, /clientRequestHTTPHost:"phonometry\.dev"/);
  assert.match(body.query, /requestSource:"eyeball"/);
  assert.match(
    body.query,
    /datetime_geq:"2025-11-21T08:00:00\.000Z",datetime_lt:"2025-11-21T08:05:00\.000Z"/,
  );
  assert.match(
    body.query,
    /OR:\[\{clientRequestPath_like:"\/robots\.txt"\},\{clientRequestPath_like:"%\/index\.md"\}\]/,
  );
  assert.match(body.query, /limit:10000/);
  assert.doesNotMatch(
    body.query,
    /Referer/i,
    "the Free plan refuses the referrer",
  );
});

test("the class of a path, as the row builder reads it", () => {
  assert.equal(pathClass("/index.md"), "md-twin");
  assert.equal(pathClass("/signals/index.md"), "md-twin");
  assert.equal(pathClass("/llms.txt"), "llms-txt");
  assert.equal(pathClass("/llms/llms-signals.txt"), "llms-txt");
  assert.equal(pathClass("/robots.txt"), "other");
  assert.equal(pathClass("/.well-known/security.txt"), "other");
});

test("a zone request becomes the row a Worker would have written, marked as from the zone", () => {
  const row = zoneToEdgeRow(GPTBOT);
  assert.equal(row.ts, Date.parse(GPTBOT.datetime) / 1000);
  assert.equal(row.qs, "lang=en");
  assert.equal(row.cache, "zone");
  const { tags, fields } = edgeRow(row, source);
  for (const expected of [
    "source=edge",
    "client_ip=203.0.113.9",
    String.raw`request=/signals/index.md?lang\=en`,
    "request_clean=/signals/index.md",
    "resp_code=200",
    String.raw`agent=Mozilla/5.0\ AppleWebKit/537.36\ (KHTML\,\ like\ Gecko);\ compatible;\ GPTBot/1.2;\ +https://openai.com/gptbot`,
    "site=phonometry-dev",
    "server_name=phonometry.dev",
    "edge_cache=zone",
    "ua_class=GPTBot",
    String.raw`geoip_asn_org=Microsoft\ Corporation`,
    "http_version=2.0",
    "ssl_protocol=TLSv1.3",
    String.raw`resp_content_type=text/markdown;\ charset\=utf-8`,
    String.raw`verified_bot=AI\ Crawler`,
    "cf_country=US",
  ]) {
    assert.ok(
      tags.includes(expected),
      `missing ${expected} in ${tags.join(" ")}`,
    );
  }
  assert.ok(fields.includes("geoip_asn=8075i"));
  assert.ok(fields.includes('cf_ray="a5de2e01ef6de8ea"'));
  assert.ok(
    fields.every((f) => !f.startsWith("geoip_lat=")),
    "the zone knows no coordinates",
  );
});

test("a window in which the Worker still logs the copies reads only the paths it never logged", () => {
  const always = [
    "/robots.txt",
    "/ai.txt",
    "/humans.txt",
    "/ads.txt",
    "/.well-known/%",
  ];
  const retired = ["%/index.md", "/llms%.txt", "/sitemap%.xml"];
  assert.deepEqual(windowPatterns(source, new Set(["beacon"])), [
    ...always,
    ...retired,
  ]);
  assert.deepEqual(windowPatterns(source, new Set()), [...always, ...retired]);
  for (const verdict of ["asset", "redirect", "not-modified"]) {
    assert.deepEqual(
      windowPatterns(source, new Set(["beacon", verdict])),
      always,
      verdict,
    );
  }
});

test("a zone source keeps its own end in the state, moved only when its rows were written", () => {
  const state = { lastEnd: 100, sites: { [source.dataset]: 40 } };
  assert.equal(
    nextState(state, 200, { [source.dataset]: true }).sites[source.dataset],
    200,
  );
  assert.equal(
    nextState(state, 200, { [source.dataset]: false }).sites[source.dataset],
    40,
  );
});

/** The window a zone query body asks for, in epoch seconds. */
function queryWindow(body) {
  const { query } = JSON.parse(body);
  const [, from, to] = /datetime_geq:"([^"]+)",datetime_lt:"([^"]+)"/u.exec(
    query,
  );
  return [Date.parse(from) / 1000, Date.parse(to) / 1000];
}

/** A GraphQL answer carrying these zone rows. */
const answer = (rows) => ({
  viewer: { zones: [{ httpRequestsAdaptive: rows }] },
});

/**
 * Fake queries for collectZone: the Worker wrote `verdicts` in the window,
 * and the zone answers `rows`. Each call is recorded.
 */
function fakeQueries(verdicts, rows) {
  const calls = { ae: [], graphql: [] };
  return {
    calls,
    query: {
      aeQuery: async (sql, account) => {
        calls.ae.push({ sql, account });
        return verdicts.map((v) => ({ v, n: 1 }));
      },
      graphql: async (body) => {
        calls.graphql.push(body);
        return answer(rows);
      },
    },
  };
}

/** The nanosecond timestamp a line protocol line ends with. */
const stamp = (line) => line.slice(line.lastIndexOf(" ") + 1);

test("a row is one request: the dataset has no sample interval to weight it", () => {
  // ZoneHttpRequestsAdaptive refuses `sampleInterval` ("unknown field"), so
  // the query must not name it and no row may claim to stand for more.
  assert.ok(!ZONE_FIELDS.includes("sampleInterval"));
  const { query } = JSON.parse(zoneQuery(source, ["/robots.txt"], 0, 300));
  assert.doesNotMatch(query, /sampleInterval/u);
  assert.equal(zoneToEdgeRow(GPTBOT).n, 1);
});

test("a full page halves the window until each half fits", async () => {
  const from = 1_763_712_000;
  const to = from + 400;
  const asked = [];
  const full = Array.from({ length: PAGE_SIZE }, () => GPTBOT);
  const graphql = async (body) => {
    const [a, b] = queryWindow(body);
    asked.push([a - from, b - from]);
    // Only the first quarter is busy enough to fill a page.
    if (a === from && b - a > 100) return answer(full);
    return answer([{ ...GPTBOT, rayName: `${a}-${b}` }]);
  };
  const rows = await zoneRequests(source, ["/robots.txt"], from, to, graphql);
  assert.deepEqual(asked, [
    [0, 400],
    [0, 200],
    [0, 100],
    [100, 200],
    [200, 400],
  ]);
  assert.deepEqual(
    rows.map((r) => r.rayName),
    [
      `${from}-${from + 100}`,
      `${from + 100}-${from + 200}`,
      `${from + 200}-${to}`,
    ],
    "the halves come back oldest first",
  );
});

test("a full page for a single second is an error, not a silent cut", async () => {
  const full = Array.from({ length: PAGE_SIZE }, () => GPTBOT);
  await assert.rejects(
    zoneRequests(source, ["/robots.txt"], 10, 11, async () => answer(full)),
    /phonometry-dev: more than 10000 requests in one second/u,
  );
});

test("the Worker's verdicts in the window are asked of its own account and dataset", async () => {
  const { calls, query } = fakeQueries([], []);
  await collectZone(1000, 1300, source, query);
  assert.deepEqual(calls.ae, [
    {
      sql: "SELECT blob12 AS v, count() AS n FROM phonometry_dev_requests WHERE timestamp >= toDateTime(1000) AND timestamp < toDateTime(1300) GROUP BY v",
      account: "4dbfb3b955a0c856bfe066f2a6061dd5",
    },
  ]);
});

test("a group the Worker logged in the window is not read from the zone", async () => {
  const logged = fakeQueries(["beacon", "asset"], []);
  await collectZone(1000, 1300, source, logged.query);
  const { query: onlyStatic } = JSON.parse(logged.calls.graphql[0]);
  assert.match(onlyStatic, /"\/robots\.txt"/u);
  assert.doesNotMatch(onlyStatic, /index\.md|llms|sitemap/u);

  const quiet = fakeQueries(["beacon"], []);
  await collectZone(1000, 1300, source, quiet.query);
  assert.match(JSON.parse(quiet.calls.graphql[0]).query, /"%\/index\.md"/u);
});

test("a window in which the Worker logged every group asks the zone nothing", async () => {
  const workerOnly = {
    ...source,
    groups: [{ patterns: ["%/index.md"], workerVerdicts: ["asset"] }],
  };
  const { calls, query } = fakeQueries(["asset"], [GPTBOT]);
  assert.deepEqual(await collectZone(1000, 1300, workerOnly, query), []);
  assert.equal(calls.graphql.length, 0);
});

test("rows get the same timestamps whatever order the zone answers in", async () => {
  const second = Date.parse(GPTBOT.datetime) / 1000;
  const rows = [
    { ...GPTBOT, rayName: "c3" },
    { ...GPTBOT, rayName: "a1" },
    { ...GPTBOT, rayName: "b2", clientRequestPath: "/llms.txt" },
    { ...GPTBOT, rayName: "d4", datetime: "2026-11-21T08:03:46Z" },
  ];
  const forward = await collectZone(0, 1, source, fakeQueries([], rows).query);
  const backward = await collectZone(
    0,
    1,
    source,
    fakeQueries([], rows.toReversed()).query,
  );
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward.map(stamp), [
    `${second}000000001`,
    `${second}000000002`,
    `${second}000000003`,
    `${second + 1}000000001`,
  ]);
  assert.deepEqual(
    forward.map((l) => /cf_ray="(\w+)"/u.exec(l)[1]),
    ["a1", "b2", "c3", "d4"],
  );
});

test("a row is written once, the line the code wrote before the move", async () => {
  const plain = await collectZone(
    0,
    1,
    source,
    fakeQueries([], [GPTBOT]).query,
  );
  assert.equal(plain.length, 1);
  const { tags, fields } = edgeRow(zoneToEdgeRow(GPTBOT), source);
  assert.equal(
    plain[0],
    `nginx_access,${tags.join(",")} ${fields.join(",")} ${Date.parse(GPTBOT.datetime) / 1000}000000001`,
  );
});

test("a backfill reads the zone only inside its retention", () => {
  const now = 1_800_000_000;
  const edge = now - ZONE_RETENTION_S + ZONE_RETENTION_MARGIN_S;
  assert.equal(ZONE_RETENTION_S, 31 * 86_400);
  assert.equal(zoneBackfillWindow(edge - 7200, edge - 3600, now), null);
  assert.equal(zoneBackfillWindow(edge - 3600, edge, now), null);
  assert.deepEqual(zoneBackfillWindow(edge - 1800, edge + 1800, now), [
    edge,
    edge + 1800,
  ]);
  assert.deepEqual(zoneBackfillWindow(edge, edge + 3600, now), [
    edge,
    edge + 3600,
  ]);
  assert.deepEqual(zoneBackfillWindow(now - 7200, now - 3600, now), [
    now - 7200,
    now - 3600,
  ]);
});

test("a backfill measures the zone's edge as each window runs, not when it started", () => {
  const start = 1_800_000_000;
  let now = start;
  const cut = zoneBackfillCutter(() => now);
  const startEdge = start - ZONE_RETENTION_S + ZONE_RETENTION_MARGIN_S;
  // The first window straddles the edge as it stood when the run began.
  assert.deepEqual(cut(startEdge - 1800, startEdge + 1800), [
    startEdge,
    startEdge + 1800,
  ]);
  // Twenty minutes of older windows later, the next one is cut at the edge
  // of that moment: the start-time edge is past Cloudflare's 31 days by then.
  now = start + 1200;
  const laterEdge = now - ZONE_RETENTION_S + ZONE_RETENTION_MARGIN_S;
  assert.deepEqual(cut(startEdge, startEdge + 3600), [
    laterEdge,
    startEdge + 3600,
  ]);
  assert.equal(cut(startEdge, laterEdge), null);
});

test("the backfill's notice says where the zone starts, or that it is skipped", () => {
  const now = 1_800_000_000;
  const edge = now - ZONE_RETENTION_S + ZONE_RETENTION_MARGIN_S;
  const datasets = ["zone:phonometry.dev"];
  assert.equal(zoneBackfillNotice(datasets, edge, now, now), null);
  assert.equal(zoneBackfillNotice([], edge - 3600, now, now), null);
  assert.equal(
    zoneBackfillNotice(datasets, edge - 3600, now, now),
    `zone:phonometry.dev: the zone keeps 31 days; backfill reads it from about ${new Date(edge * 1000).toISOString()} only`,
  );
  assert.equal(
    zoneBackfillNotice(datasets, edge - 7200, edge, now),
    "zone:phonometry.dev: the zone keeps 31 days; the whole backfill is older, so they are skipped",
  );
});
