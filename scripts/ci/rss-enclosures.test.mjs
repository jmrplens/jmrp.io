/**
 * Unit tests for the RSS enclosure-length step
 * (`src/integrations/post-build/rss-enclosures.ts`) and for the validator rule
 * that backs it (`scripts/ci/validate-rss.mjs`).
 *
 * The defect these lock down (GEO audit #11, B7): all 24 enclosures declared
 * `length="0"`, because the feed renders before Astro writes the covers it
 * points at. The step must write each file's real size, and must fail, naming
 * the feed and the URL, when a cover is not in the build; a zero is never an
 * acceptable fallback. The validator must reject any zero that escapes.
 *
 * Everything runs in a temp directory; nothing in the project is touched.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  fillEnclosureLengths,
  patchRssEnclosureLengths,
} from "../../src/integrations/post-build/rss-enclosures.ts";
import { validateItemEnclosure, validateSingleFeed } from "./validate-rss.mjs";

/** Silent logger with the shape the step expects. */
const logger = /** @type {any} */ ({
  info() {},
  warn() {},
  error() {},
  debug() {},
  fork: () => logger,
  options: {},
  label: "test",
});

const COVER = "_astro/cover.abc_123.jpeg";
const COVER_BYTES = 4321;

let distDir = "";

before(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-enclosures-"));
  fs.mkdirSync(path.join(distDir, "_astro"));
  fs.writeFileSync(path.join(distDir, COVER), Buffer.alloc(COVER_BYTES, 1));
});

after(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

/** A minimal feed shaped like the one `src/utils/rss.ts` renders. */
function feed(enclosures) {
  const items = enclosures
    .map(
      (enclosure, i) => `
    <item>
      <title>Post ${i + 1}</title>
      <link>https://jmrp.io/blog/00${i + 1}-post/</link>
      <guid isPermaLink="true">https://jmrp.io/blog/00${i + 1}-post/</guid>
      <description>Summary</description>
      <content:encoded><![CDATA[Summary <a href="https://jmrp.io/blog/00${i + 1}-post/">Continue reading</a>]]></content:encoded>
      <pubDate>Wed, 30 Sep 2026 00:00:00 GMT</pubDate>
      ${enclosure}
    </item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Feed</title>
    <description>Feed</description>
    <link>https://jmrp.io/es/</link>
    <atom:link href="https://jmrp.io/es/rss.xml" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}

const PLACEHOLDER = `<enclosure url="https://jmrp.io/${COVER}" length="0" type="image/jpeg" />`;

test("writes the built file's size over the placeholder", () => {
  const { xml, count } = fillEnclosureLengths(feed([PLACEHOLDER]), distDir);
  assert.equal(count, 1);
  assert.match(xml, new RegExp(`length="${COVER_BYTES}"`));
  assert.doesNotMatch(xml, /length="0"/);
});

test("recomputes a stale non-zero value too, and is idempotent", () => {
  const stale = PLACEHOLDER.replace('length="0"', 'length="99"');
  const once = fillEnclosureLengths(feed([stale]), distDir).xml;
  assert.match(once, new RegExp(`length="${COVER_BYTES}"`));
  assert.equal(fillEnclosureLengths(once, distDir).xml, once);
});

test("adds the attribute when a tag lacks it", () => {
  const bare = `<enclosure url="https://jmrp.io/${COVER}" type="image/jpeg" />`;
  const { xml } = fillEnclosureLengths(feed([bare]), distDir);
  assert.match(xml, new RegExp(`type="image/jpeg" length="${COVER_BYTES}" />`));
});

test("decodes XML entities in the URL before looking the file up", () => {
  const name = "_astro/a&b.jpeg";
  fs.writeFileSync(path.join(distDir, name), Buffer.alloc(7));
  const tag = `<enclosure url="https://jmrp.io/_astro/a&amp;b.jpeg" length="0" type="image/jpeg" />`;
  assert.match(fillEnclosureLengths(feed([tag]), distDir).xml, /length="7"/);
});

test("fails loudly, naming the URL, when the cover is not in the build", () => {
  const missing = PLACEHOLDER.replace("cover.abc_123", "gone");
  assert.throws(
    () => fillEnclosureLengths(feed([missing]), distDir),
    /missing from the build: https:\/\/jmrp\.io\/_astro\/gone\.jpeg/,
  );
});

test("refuses a URL that climbs out of the build directory", () => {
  const escape = `<enclosure url="https://jmrp.io/%2F..%2F..%2Fetc%2Fpasswd" length="0" type="image/jpeg" />`;
  assert.throws(
    () => fillEnclosureLengths(feed([escape]), distDir),
    /outside the build/,
  );
});

test("patches every feed in the build, naming the feed on failure", async () => {
  fs.mkdirSync(path.join(distDir, "es"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "rss.xml"), feed([PLACEHOLDER]));
  fs.writeFileSync(path.join(distDir, "es", "rss.xml"), feed([PLACEHOLDER]));
  await patchRssEnclosureLengths(distDir, logger);
  for (const file of ["rss.xml", "es/rss.xml"]) {
    const xml = fs.readFileSync(path.join(distDir, file), "utf8");
    assert.match(xml, new RegExp(`length="${COVER_BYTES}"`), file);
  }

  fs.writeFileSync(
    path.join(distDir, "es", "rss.xml"),
    feed([PLACEHOLDER.replace("cover.abc_123", "gone")]),
  );
  await assert.rejects(
    patchRssEnclosureLengths(distDir, logger),
    /^Error: es\/rss\.xml: enclosure file is missing/,
  );
});

test("the validator rejects a zero, a missing and a non-numeric length", () => {
  for (const length of ["0", undefined, "", "12kB", "-5"]) {
    const results = { errors: [], warnings: [] };
    validateItemEnclosure(
      {
        enclosure: {
          url: "https://jmrp.io/x.jpeg",
          type: "image/jpeg",
          length,
        },
      },
      1,
      results,
    );
    assert.equal(results.errors.length, 1, `length ${length}`);
    assert.match(results.errors[0], /Enclosure length/);
  }
  const ok = { errors: [], warnings: [] };
  validateItemEnclosure(
    {
      enclosure: {
        url: "https://jmrp.io/x.jpeg",
        type: "image/jpeg",
        length: "116251",
      },
    },
    1,
    ok,
  );
  assert.deepEqual(ok.errors, []);
});

test("the validator fails a whole feed that still carries the placeholder", async () => {
  const file = path.join(distDir, "placeholder.xml");
  fs.writeFileSync(file, feed([PLACEHOLDER]));
  const results = await validateSingleFeed(file);
  assert.equal(results.valid, false);
  assert.match(results.errors.join("\n"), /Item 1: Enclosure length '0'/);

  fs.writeFileSync(
    file,
    fillEnclosureLengths(feed([PLACEHOLDER]), distDir).xml,
  );
  assert.equal((await validateSingleFeed(file)).valid, true);
});
