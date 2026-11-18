/* cspell:ignore geoip Raspeig Comunidad Valenciana */
/**
 * Unit tests for the edge rows of `nginx_access`, above all the cf_* columns:
 * Telegraf writes the same columns from the access log, InfluxDB 3 never changes
 * a column's type, and one value of the wrong type drops the whole batch. The
 * types pinned here are the ones `information_schema.columns` reported on
 * 2026-11-04.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { edgeRow, miscParts } from "./ae-edge-row.mjs";

const SITE = { site: "docs", host: "docs.jmrp.io" };
const CF_TAGS = [
  "cf_colo",
  "cf_country",
  "cf_continent",
  "cf_region",
  "cf_region_code",
  "cf_city",
  "cf_tz",
];
const CF_STRING_FIELDS = ["cf_postal", "cf_ray"];
const CF_FLOAT_FIELDS = ["cf_lat", "cf_lon"];

/**
 * A blob 20 as the three workers build it (miscBag).
 * @param {Partial<Record<string, string>>} parts Values to set.
 * @returns {string} The "|"-joined blob of 14 parts.
 */
function misc({
  region = "Comunidad Valenciana",
  regionCode = "VC",
  cipher = "AEAD-AES128-GCM-SHA256",
  continent = "EU",
  timezone = "Europe/Madrid",
  fetchDest = "document",
  postal = "03001",
  // The cf-ray request header a Worker reads: no "-COLO" suffix.
  ray = "a5559c8f0d8d31c1",
} = {}) {
  return [
    region,
    regionCode,
    cipher,
    continent,
    timezone,
    fetchDest,
    "navigate",
    "none",
    "",
    ray,
    "text/html",
    "gzip, br",
    "1",
    postal,
  ].join("|");
}

/**
 * One Analytics Engine row, with every location column known.
 * @param {object} [overrides] Columns to replace.
 * @returns {object} The row.
 */
function aeRow(overrides = {}) {
  return {
    c: "page",
    p: "/phonometry/",
    st: "200",
    cache: "HIT",
    cc: "ES",
    colo: "MAD",
    city: "San Vicente del Raspeig",
    lat: 38.3964,
    lon: -0.5255,
    misc: misc(),
    ...overrides,
  };
}

/**
 * The value written for a tag, as it stands in line protocol.
 * @param {string[]} tags Result of edgeRow.
 * @param {string} name Tag name.
 * @returns {string | undefined} The escaped value.
 */
function tagValue(tags, name) {
  const hit = tags.find((t) => t.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

/**
 * The value written for a field, as it stands in line protocol.
 * @param {string[]} fields Result of edgeRow.
 * @param {string} name Field name.
 * @returns {string | undefined} The raw value, quotes included.
 */
function fieldValue(fields, name) {
  const hit = fields.find((f) => f.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

test("miscParts reads the position of each part of the blob", () => {
  const parts = miscParts(misc());
  assert.equal(parts.region, "Comunidad Valenciana");
  assert.equal(parts.regionCode, "VC");
  assert.equal(parts.continent, "EU");
  assert.equal(parts.timezone, "Europe/Madrid");
  assert.equal(parts.cfRay, "a5559c8f0d8d31c1");
  assert.equal(parts.contentType, "text/html");
  assert.equal(parts.postalCode, "03001");
});

test("every location column is written, escaped as Telegraf's tags are", () => {
  const { tags } = edgeRow(aeRow(), SITE);
  assert.equal(tagValue(tags, "cf_colo"), "MAD");
  assert.equal(tagValue(tags, "cf_country"), "ES");
  assert.equal(tagValue(tags, "cf_continent"), "EU");
  assert.equal(tagValue(tags, "cf_region"), String.raw`Comunidad\ Valenciana`);
  assert.equal(tagValue(tags, "cf_region_code"), "VC");
  assert.equal(
    tagValue(tags, "cf_city"),
    String.raw`San\ Vicente\ del\ Raspeig`,
  );
  assert.equal(tagValue(tags, "cf_tz"), "Europe/Madrid");
});

test("non-ASCII names stay as written and commas are escaped", () => {
  const { tags } = edgeRow(
    aeRow({
      city: "Washington, D.C.",
      misc: misc({ region: "Île-de-France" }),
    }),
    SITE,
  );
  assert.equal(tagValue(tags, "cf_city"), String.raw`Washington\,\ D.C.`);
  assert.equal(tagValue(tags, "cf_region"), "Île-de-France");
});

test("postal code and ray are strings even when all digits", () => {
  const { fields } = edgeRow(aeRow({ misc: misc({ postal: "03001" }) }), SITE);
  for (const name of CF_STRING_FIELDS) {
    assert.match(fieldValue(fields, name), /^".+"$/u, name);
  }
  assert.equal(fieldValue(fields, "cf_postal"), '"03001"');
});

test("coordinates are floats, also when the number is whole", () => {
  const { fields } = edgeRow(aeRow({ lat: 40, lon: -3.5 }), SITE);
  assert.equal(fieldValue(fields, "cf_lat"), "40");
  assert.equal(fieldValue(fields, "cf_lon"), "-3.5");
  for (const name of CF_FLOAT_FIELDS) {
    assert.doesNotMatch(fieldValue(fields, name), /[i"]/u, name);
  }
});

test("each cf column has one kind, tag or field, and appears once", () => {
  const { tags, fields } = edgeRow(aeRow(), SITE);
  const names = (pairs) => pairs.map((p) => p.split("=", 1)[0]);
  const fieldNames = names(fields);
  const tagNames = names(tags);
  for (const name of CF_TAGS) {
    assert.equal(tagNames.filter((n) => n === name).length, 1, name);
    assert.ok(!fieldNames.includes(name), name);
  }
  for (const name of [...CF_STRING_FIELDS, ...CF_FLOAT_FIELDS]) {
    assert.equal(fieldNames.filter((n) => n === name).length, 1, name);
    assert.ok(!tagNames.includes(name), name);
  }
});

test("an absent value leaves its column out, never a placeholder", () => {
  const { tags, fields } = edgeRow(
    aeRow({
      cc: "",
      colo: "",
      city: "",
      lat: 0,
      lon: 0,
      misc: "||||||||||||||",
    }),
    SITE,
  );
  const names = new Set([...tags, ...fields].map((p) => p.split("=", 1)[0]));
  for (const name of [...CF_TAGS, ...CF_STRING_FIELDS, ...CF_FLOAT_FIELDS]) {
    assert.ok(!names.has(name), name);
  }
});

test("a blob shorter than today's, or none, costs only its own columns", () => {
  const { tags, fields } = edgeRow(
    aeRow({ misc: "Madrid|MD|cipher|EU|Europe/Madrid" }),
    SITE,
  );
  assert.equal(tagValue(tags, "cf_tz"), "Europe/Madrid");
  assert.equal(fieldValue(fields, "cf_postal"), undefined);
  assert.equal(fieldValue(fields, "cf_ray"), undefined);
  const bare = edgeRow(aeRow({ misc: undefined }), SITE);
  assert.equal(tagValue(bare.tags, "cf_region"), undefined);
  assert.equal(
    tagValue(bare.tags, "cf_city"),
    String.raw`San\ Vicente\ del\ Raspeig`,
  );
});

test('a "|" in a header cannot move a client value into a location tag', () => {
  const { tags } = edgeRow(aeRow({ misc: misc({ fetchDest: "x|y|z" }) }), SITE);
  assert.equal(tagValue(tags, "cf_region"), String.raw`Comunidad\ Valenciana`);
  assert.equal(tagValue(tags, "cf_region_code"), "VC");
  assert.equal(tagValue(tags, "cf_continent"), "EU");
  assert.equal(tagValue(tags, "cf_tz"), "Europe/Madrid");
});

test("the columns that describe a hop to nginx stay empty", () => {
  const { tags, fields } = edgeRow(aeRow(), SITE);
  const names = new Set([...tags, ...fields].map((p) => p.split("=", 1)[0]));
  assert.ok(!names.has("peer_addr"));
  assert.ok(!names.has("cf_worker"));
});

test("the geoip columns keep what they already carried", () => {
  const { tags, fields } = edgeRow(aeRow(), SITE);
  assert.equal(tagValue(tags, "geoip_country_code"), "ES");
  assert.equal(
    tagValue(tags, "geoip_region"),
    String.raw`Comunidad\ Valenciana`,
  );
  assert.equal(tagValue(tags, "edge_colo"), "MAD");
  assert.equal(fieldValue(fields, "geoip_lat"), "38.3964");
  assert.equal(fieldValue(fields, "geoip_lon"), "-0.5255");
});

/**
 * A phonometry.dev beacon row: blob 20 with the beacon's five appended parts
 * and doubles 10 to 15 read as load_ms, screen_w, screen_h, viewport_w,
 * viewport_h and dpr (ae-sites.mjs, BEACON_COLUMNS).
 * @param {object} [overrides] Columns to replace.
 * @returns {object} The row.
 */
function beaconRow(overrides = {}) {
  return aeRow({
    cache: "beacon",
    misc: `${misc()}|navigate|0|1|es-ES|Europe/Madrid`,
    load_ms: 421,
    screen_w: 1920,
    screen_h: 1080,
    viewport_w: 1280,
    viewport_h: 720,
    dpr: 1.5,
    ...overrides,
  });
}

const DEV = { site: "phonometry-dev", host: "phonometry.dev" };

test("a beacon row carries the page view's load time, screen and viewport", () => {
  const { tags, fields } = edgeRow(beaconRow(), DEV);
  assert.equal(fieldValue(fields, "page_load_ms"), "421");
  assert.equal(fieldValue(fields, "screen_width"), "1920i");
  assert.equal(fieldValue(fields, "screen_height"), "1080i");
  assert.equal(fieldValue(fields, "viewport_width"), "1280i");
  assert.equal(fieldValue(fields, "viewport_height"), "720i");
  assert.equal(fieldValue(fields, "device_pixel_ratio"), "1.5");
  assert.equal(tagValue(tags, "nav_type"), "navigate");
  assert.equal(tagValue(tags, "webdriver"), "1");
  assert.equal(tagValue(tags, "site"), "phonometry-dev");
  assert.equal(tagValue(tags, "edge_cache"), "beacon");
});

test("miscParts reads the beacon's appended parts and leaves them unset elsewhere", () => {
  const parts = miscParts(`${misc()}|reload|1|0|en|UTC`);
  assert.equal(parts.navType, "reload");
  assert.equal(parts.notFound, "1");
  assert.equal(parts.webdriver, "0");
  assert.equal(miscParts(misc()).navType, undefined);
});

test("rows of the other sites gain no beacon column", () => {
  const { tags, fields } = edgeRow(aeRow(), SITE);
  for (const name of [
    "page_load_ms",
    "screen_width",
    "screen_height",
    "viewport_width",
    "viewport_height",
    "device_pixel_ratio",
  ]) {
    assert.equal(fieldValue(fields, name), undefined, name);
  }
  assert.equal(tagValue(tags, "nav_type"), undefined);
  assert.equal(tagValue(tags, "webdriver"), undefined);
});

test("a beacon without a measured load time writes no zero", () => {
  const { fields } = edgeRow(beaconRow({ load_ms: 0, dpr: 0 }), DEV);
  assert.equal(fieldValue(fields, "page_load_ms"), undefined);
  assert.equal(fieldValue(fields, "device_pixel_ratio"), undefined);
});
