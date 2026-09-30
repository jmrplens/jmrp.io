/**
 * Unit tests for the schema.org range guard and its vocabulary generator.
 *
 * The guard exists because `schema-dts` accepted GEO audit #10's M2
 * (`hasPart` holding an `ItemList` and `Service` nodes that carried an
 * `@id`). So the M2 shape itself is replayed here and must fail, the
 * corrected shape must pass, and each rule (parent types, `@id` resolution,
 * literals, warnings) has a fixture of its own. The tests run against the
 * committed vocabulary, so a regenerated file that lost a relation the site
 * depends on fails here too.
 */

// cspell:ignore rdfs bibo
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  checkRanges,
  createVocabulary,
  jsonLdBlocks,
  loadVocabulary,
} from "./check-schema-ranges.mjs";
import {
  compactVocabulary,
  serializeVocabulary,
} from "./generate-schema-vocabulary.mjs";

const SCRIPT = fileURLToPath(
  new URL("check-schema-ranges.mjs", import.meta.url),
);
const vocabulary = loadVocabulary();
const ORIGIN = "https://jmrp.io";

/** One page holding one `@graph`. */
const onePage = (graph, file = "page/index.html") => ({
  file,
  blocks: [{ "@context": "https://schema.org", "@graph": graph }],
});

/** Violation keys for a set of pages. */
const violationsOf = (...pages) =>
  checkRanges(pages, vocabulary).violations.map((v) => v.key);

test("the committed vocabulary is schema.org's, with the relations the site needs", () => {
  assert.match(vocabulary.release, /^\d+\.\d+$/);
  assert.equal(vocabulary.isA("TechArticle", "CreativeWork"), true);
  assert.equal(vocabulary.isA("ItemList", "CreativeWork"), false);
  assert.equal(vocabulary.isA("URL", "Text"), true);
  assert.deepEqual(vocabulary.property("hasPart").range, ["CreativeWork"]);
  assert.equal(vocabulary.property("notAProperty"), undefined);
});

test("hasPart -> ItemList fails (audit #10, M2)", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "CollectionPage",
          "@id": `${ORIGIN}/projects/contributions/#contributions`,
          hasPart: {
            "@type": "ItemList",
            "@id": `${ORIGIN}/projects/contributions/#highlights`,
          },
        },
      ]),
    ),
    ["CollectionPage.hasPart = ItemList (expected CreativeWork)"],
  );
});

test("hasPart -> Service with an @id fails, the shape schema-dts let through", () => {
  const services = ["a", "b"].map((n) => ({
    "@type": "Service",
    "@id": `${ORIGIN}/homelab/#${n}`,
    name: n,
  }));
  assert.deepEqual(
    violationsOf(onePage([{ "@type": "CollectionPage", hasPart: services }])),
    ["CollectionPage.hasPart = Service (expected CreativeWork)"],
  );
});

test("the corrected shape passes: ItemList under mainEntity (range Thing)", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "CollectionPage",
          mainEntity: [{ "@type": "ItemList" }, { "@type": "Service" }],
        },
      ]),
    ),
    [],
  );
});

test("hasPart -> CreativeWork passes", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        { "@type": "CollectionPage", hasPart: { "@type": "CreativeWork" } },
      ]),
    ),
    [],
  );
});

test("a subtype of a range class passes (TechArticle, SoftwareApplication)", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "CollectionPage",
          hasPart: [
            { "@type": "TechArticle" },
            { "@type": "SoftwareApplication" },
          ],
        },
      ]),
    ),
    [],
  );
});

test("one fitting type among several is enough", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "CollectionPage",
          hasPart: { "@type": ["WebAPI", "SoftwareApplication"] },
        },
      ]),
    ),
    [],
  );
});

test("a bare @id reference is resolved to the type it has on the page", () => {
  const list = { "@type": "ItemList", "@id": `${ORIGIN}/x/#list` };
  const page = { "@type": "WebPage", "@id": `${ORIGIN}/x/#page` };
  assert.deepEqual(
    violationsOf(
      onePage([
        list,
        page,
        { "@type": "CollectionPage", hasPart: { "@id": list["@id"] } },
      ]),
    ),
    ["CollectionPage.hasPart = ItemList (expected CreativeWork)"],
  );
  assert.deepEqual(
    violationsOf(
      onePage([
        list,
        page,
        { "@type": "CollectionPage", hasPart: { "@id": page["@id"] } },
      ]),
    ),
    [],
  );
});

test("a reference resolves across pages when the page does not type it", () => {
  const other = onePage(
    [{ "@type": "Service", "@id": `${ORIGIN}/homelab/#svc` }],
    "homelab/index.html",
  );
  const referring = onePage([
    { "@type": "CollectionPage", hasPart: { "@id": `${ORIGIN}/homelab/#svc` } },
  ]);
  assert.deepEqual(violationsOf(other, referring), [
    "CollectionPage.hasPart = Service (expected CreativeWork)",
  ]);
});

test("an unresolved reference is a warning, not a violation", () => {
  const result = checkRanges(
    [
      onePage([
        { "@type": "CollectionPage", hasPart: { "@id": `${ORIGIN}/nowhere` } },
      ]),
    ],
    vocabulary,
  );
  assert.deepEqual(result.violations, []);
  assert.equal(result.warnings.unresolvedReference.length, 1);
});

test("literals are Text fallbacks and are never checked", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "CreativeWork",
          author: "A name as plain text",
          hasPart: "a string",
          dateModified: "2026-09-30",
          position: 3,
          description: { "@value": "texto", "@language": "es" },
        },
      ]),
    ),
    [],
  );
});

test("a Role is accepted in place of the range class", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "Person",
          worksFor: {
            "@type": "OrganizationRole",
            worksFor: { "@type": "Organization", name: "x" },
          },
        },
      ]),
    ),
    [],
  );
});

test("nested nodes are checked, not only top-level graph nodes", () => {
  assert.deepEqual(
    violationsOf(
      onePage([
        {
          "@type": "WebPage",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: {
              "@type": "ListItem",
              item: { "@type": "CreativeWork", hasPart: { "@type": "Place" } },
            },
          },
        },
      ]),
    ),
    ["CreativeWork.hasPart = Place (expected CreativeWork)"],
  );
});

test("unknown properties and domain mismatches are warnings only", () => {
  const result = checkRanges(
    [
      onePage([
        {
          "@type": "SoftwareApplication",
          codeRepository: "https://github.com/jmrplens/x",
          programmingLanguage: "Rust",
          "query-input": "required name=q",
        },
      ]),
    ],
    vocabulary,
  );
  assert.deepEqual(result.violations, []);
  assert.deepEqual(
    result.warnings.outsideDomain.map((w) => w.key),
    [
      "SoftwareApplication.codeRepository (domain SoftwareSourceCode)",
      "SoftwareApplication.programmingLanguage (domain SoftwareSourceCode)",
    ],
  );
  assert.deepEqual(
    result.warnings.unknownProperty.map((w) => w.key),
    ["SoftwareApplication.query-input"],
  );
});

test("an unknown value type fails its range; an unknown node type warns", () => {
  const result = checkRanges(
    [
      onePage([
        { "@type": "CollectionPage", hasPart: { "@type": "CreativeWorks" } },
      ]),
    ],
    vocabulary,
  );
  assert.deepEqual(
    result.violations.map((v) => v.key),
    ["CollectionPage.hasPart = CreativeWorks (expected CreativeWork)"],
  );
  assert.deepEqual(
    result.warnings.unknownType.map((w) => w.key),
    ["@type CreativeWorks"],
  );
});

test("jsonLdBlocks reads every block, whatever the attribute order", () => {
  const html =
    '<head><script nonce="n" type="application/ld+json">{"@type":"WebSite"}</script>' +
    '<script type="application/ld+json" data-x="1">[{"@type":"Person"}]</script>' +
    '<script type="application/ld+json">{broken</script>' +
    '<script type="module">{"@type":"Nope"}</script></head>';
  const { blocks, errors } = jsonLdBlocks(html);
  assert.deepEqual(blocks, [{ "@type": "WebSite" }, [{ "@type": "Person" }]]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /block 3 is not valid JSON/);
});

test("the generator keeps superclasses, ranges, domains and supersession", () => {
  const graph = [
    { "@id": "schema:Thing", "@type": "rdfs:Class" },
    {
      "@id": "schema:CreativeWork",
      "@type": "rdfs:Class",
      "rdfs:subClassOf": { "@id": "schema:Thing" },
    },
    {
      "@id": "schema:Text",
      "@type": ["schema:DataType", "rdfs:Class"],
    },
    {
      "@id": "schema:URL",
      "@type": "rdfs:Class",
      "rdfs:subClassOf": { "@id": "schema:Text" },
    },
    {
      "@id": "schema:hasPart",
      "@type": "rdf:Property",
      "schema:domainIncludes": { "@id": "schema:CreativeWork" },
      "schema:rangeIncludes": { "@id": "schema:CreativeWork" },
    },
    {
      "@id": "schema:oldProp",
      "@type": "rdf:Property",
      "schema:rangeIncludes": [
        { "@id": "schema:URL" },
        { "@id": "schema:Text" },
      ],
      "schema:supersededBy": { "@id": "schema:hasPart" },
    },
    // Instances and foreign terms are not vocabulary the check needs.
    { "@id": "schema:Monday", "@type": "schema:DayOfWeek" },
    { "@id": "bibo:Thesis", "@type": "rdfs:Class" },
  ];
  const compact = compactVocabulary(graph);
  assert.deepEqual(compact, {
    classes: {
      Thing: [],
      CreativeWork: ["Thing"],
      Text: [],
      URL: ["Text"],
    },
    properties: {
      hasPart: { range: ["CreativeWork"], domain: ["CreativeWork"] },
      oldProp: {
        range: ["Text", "URL"],
        domain: [],
        supersededBy: ["hasPart"],
      },
    },
  });
  const text = serializeVocabulary(
    { release: "1.0", source: "s", sha256: "h" },
    compact,
  );
  const parsed = JSON.parse(text);
  assert.equal(parsed.release, "1.0");
  assert.match(parsed["//"], /cspell:disable/);
  // Round trip: what the generator writes is what the check can read.
  const round = createVocabulary(parsed);
  assert.equal(round.isA("URL", "Text"), true);
  assert.deepEqual(round.property("oldProp").supersededBy, ["hasPart"]);
});

/**
 * Writes a scratch site holding one page with the given graph.
 *
 * @param {object[] | null} graph - The page's `@graph`; null for no site.
 * @returns {string} The directory.
 */
function makeSite(graph) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-ranges-"));
  if (graph) {
    const block = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": graph,
    });
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!DOCTYPE html><html><head><script type="application/ld+json">${block}</script></head><body></body></html>`,
    );
  }
  return dir;
}

test("CLI exit codes: 0 clean, 1 violations, 2 could not run", () => {
  const clean = makeSite([
    { "@type": "CollectionPage", hasPart: { "@type": "CreativeWork" } },
  ]);
  const broken = makeSite([
    { "@type": "CollectionPage", hasPart: { "@type": "ItemList" } },
  ]);
  const notASite = makeSite(null);
  try {
    const run = (dir) =>
      spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.equal(run(clean).status, 0);
    const failed = run(broken);
    assert.equal(failed.status, 1);
    assert.match(
      failed.stderr,
      /CollectionPage\.hasPart = ItemList \(expected CreativeWork\)/,
    );
    assert.equal(run(notASite).status, 2);
  } finally {
    for (const dir of [clean, broken, notASite])
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
