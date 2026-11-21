/* cspell:ignore geoip -- Influx column names written by ae-edge-row.mjs */
import assert from "node:assert/strict";
import { test } from "node:test";

import { edgeRow } from "./ae-edge-row.mjs";
import { nextState, ZONE_SOURCES } from "./ae-sites.mjs";
import {
  pathClass,
  windowPatterns,
  zoneQuery,
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
