// cspell:locale en,es
// cspell:words LILYGO
/**
 * Unit tests for the drift guard's pass/fail decision (GEO audit #12, M1).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import {
  ACCEPTED_DIVERGENCES,
  articleHeadlines,
  classifyDivergences,
  CONTRADICTABLE,
  divergentProperties,
  driftSkip,
  exitCodeFor,
  postHeadlines,
  projectValues,
  sameValues,
  siteValues,
  taggedLiteral,
  valueDifference,
} from "./software-drift-decision.mjs";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the declared exception is matched by project id and property", () => {
  assert.deepEqual(
    classifyDivergences("gitlab-mcp-server", ["description", "license"]),
    { contradicting: ["license"], accepted: ["description"] },
  );
});

test("the same property on another project is a contradiction", () => {
  assert.deepEqual(classifyDivergences("phonometry", ["description"]), {
    contradicting: ["description"],
    accepted: [],
  });
});

test("no divergence, nothing to report", () => {
  assert.deepEqual(classifyDivergences("gitlab-mcp-server", []), {
    contradicting: [],
    accepted: [],
  });
});

test("every exception carries a reason and a date", () => {
  for (const entry of Object.values(ACCEPTED_DIVERGENCES)) {
    assert.match(entry.decided, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.reason.length > 10);
  }
});

test("only a contradiction fails the run", () => {
  assert.equal(exitCodeFor({ contradictions: 1 }), 1);
  assert.equal(exitCodeFor({ contradictions: 0 }), 0);
});

test("a project with its own docs site is compared", () => {
  assert.equal(
    driftSkip({
      id: "phonometry",
      status: "active",
      repo: "https://github.com/jmrplens/phonometry",
      docs: "https://phonometry.dev/",
    }),
    null,
  );
});

test("a README-documented project is skipped silently, as before", () => {
  assert.deepEqual(
    driftSkip({
      id: "A-Lab",
      status: "archived",
      repo: "https://github.com/jmrplens/A-Lab",
      docs: "https://github.com/jmrplens/A-Lab#readme",
    }),
    { quiet: true, reason: "documentation is the repository README" },
  );
});

// Kleidos was skipped as "no public repository" while its node on
// kleidos.dev and the copy in projects.yaml drifted apart (GEO audit #13).
test("a project in development without a public repository is compared", () => {
  assert.equal(
    driftSkip({
      id: "device",
      status: "upcoming",
      docs: "https://device.example/",
    }),
    null,
  );
});

test("a project without a repository states its docs as url, and no codeRepository", () => {
  const values = projectValues(
    { ...FULL_RECORD, repo: undefined, docs: "https://device.example/" },
    {},
  );
  assert.equal(values.url, "https://device.example/");
  assert.equal(values.codeRepository, undefined);
});

// Multi-valued properties are compared as sets. Before, every property was
// compared as JSON text and `operatingSystem` not at all, so "Windows, Linux,
// macOS" on a project's site and ["Linux", "macOS", "Windows"] on /projects/
// passed unnoticed, and the same systems in another order or shape would
// have failed as a contradiction the day the property was added.

// One record as projects.yaml authors it, every field the comparison reads
// filled in.
const FULL_RECORD = Object.freeze({
  id: "example",
  name: "example",
  alternateName: Object.freeze(["example tool"]),
  summary: Object.freeze({ en: "An example.", es: "Its Spanish summary." }),
  disambiguatingDescription: Object.freeze({
    en: "The example by its author.",
    es: "El ejemplo de su autor.",
  }),
  keywords: Object.freeze({ en: "example, tool", es: "ejemplo, herramienta" }),
  license: "MIT",
  language: "Go",
  applicationCategory: "DeveloperApplication",
  applicationSubCategory: "Network monitoring",
  operatingSystem: "Linux, macOS, BSD",
  repo: "https://github.com/jmrplens/example",
  docs: "https://docs.jmrp.io/example/",
});

test("operatingSystem is one of the properties compared", () => {
  assert.ok(CONTRADICTABLE.includes("operatingSystem"));
  // From the record through the values jmrp.io states: a property the record
  // states but `projectValues` leaves out is undefined, and
  // `divergentProperties` skips it, so it would pass as agreement.
  assert.deepEqual(
    divergentProperties(
      { operatingSystem: "Windows, Linux, macOS" },
      projectValues(FULL_RECORD, {}),
    ),
    ["operatingSystem"],
  );
});

test("every compared property is read from projects.yaml, and nothing else", () => {
  const values = projectValues(FULL_RECORD, {});
  assert.deepEqual(new Set(Object.keys(values)), new Set(CONTRADICTABLE));
  for (const property of CONTRADICTABLE) {
    assert.notEqual(values[property], undefined, property);
  }
});

test("every compared project states each property it authors, operatingSystem included", () => {
  // Where each property comes from in a record, restated here so the test
  // does not take its expectations from the function it checks.
  const source = {
    name: (project) => project.name,
    alternateName: (project) => project.alternateName,
    description: (project) => project.summary?.en,
    "description@es": (project) => project.summary?.es,
    disambiguatingDescription: (project) =>
      project.disambiguatingDescription?.en,
    "disambiguatingDescription@es": (project) =>
      project.disambiguatingDescription?.es,
    keywords: (project) => project.keywords?.en,
    "keywords@es": (project) => project.keywords?.es,
    license: (project) => project.licenseUrl ?? project.license,
    programmingLanguage: (project) => project.language,
    applicationCategory: (project) => project.applicationCategory,
    applicationSubCategory: (project) => project.applicationSubCategory,
    operatingSystem: (project) => project.operatingSystem,
    codeRepository: (project) => project.repo,
    url: (project) => project.repo ?? project.docs,
  };
  assert.deepEqual(new Set(Object.keys(source)), new Set(CONTRADICTABLE));

  const licenseUrls = JSON.parse(read("src/data/license-urls.json"));
  const compared = loadYaml(
    read("src/content/profile/projects.yaml"),
  ).projects.filter((project) => driftSkip(project) === null);
  const withSystems = compared.filter((project) => project.operatingSystem);
  assert.ok(withSystems.length > 0, "no compared project states its systems");

  for (const project of compared) {
    const values = projectValues(project, licenseUrls);
    for (const property of CONTRADICTABLE) {
      if (source[property](project) === undefined) continue;
      assert.notEqual(values[property], undefined, `${project.id} ${property}`);
    }
  }
  for (const project of withSystems) {
    assert.equal(
      projectValues(project, licenseUrls).operatingSystem,
      project.operatingSystem,
      project.id,
    );
  }
});

test("the same systems in another order or shape agree", () => {
  const ours = { operatingSystem: "Linux, macOS, Windows" };
  for (const theirs of [
    "Windows, Linux, macOS",
    ["Linux", "macOS", "Windows"],
    ["Windows", "macOS", "Linux"],
    "Linux,macOS ,  Windows,",
  ]) {
    assert.deepEqual(
      divergentProperties({ operatingSystem: theirs }, ours),
      [],
    );
  }
  assert.deepEqual(
    divergentProperties(
      { operatingSystem: ["Linux"] },
      { operatingSystem: "Linux" },
    ),
    [],
  );
});

test("a system missing on either side is a contradiction", () => {
  const ours = { operatingSystem: "Linux, macOS, Windows" };
  assert.deepEqual(
    divergentProperties({ operatingSystem: ["Linux", "macOS"] }, ours),
    ["operatingSystem"],
  );
  assert.deepEqual(
    divergentProperties(
      { operatingSystem: "Linux" },
      { operatingSystem: "Linux, macOS, Windows, FreeBSD" },
    ),
    ["operatingSystem"],
  );
});

test("an extra system on either side is a contradiction", () => {
  assert.deepEqual(
    divergentProperties(
      { operatingSystem: ["Linux", "macOS", "Windows", "FreeBSD"] },
      { operatingSystem: "Linux, macOS, Windows" },
    ),
    ["operatingSystem"],
  );
  assert.deepEqual(
    divergentProperties(
      { operatingSystem: "Windows, Linux, macOS" },
      { operatingSystem: "Linux, macOS, BSD" },
    ),
    ["operatingSystem"],
  );
});

test("the difference names what each side lacks", () => {
  assert.deepEqual(
    valueDifference(
      "operatingSystem",
      "Windows, Linux, macOS",
      "Linux, macOS, BSD",
    ),
    { onlyTheirs: ['"Windows"'], onlyOurs: ['"BSD"'] },
  );
  assert.deepEqual(
    valueDifference("operatingSystem", ["Linux"], "Linux, Windows"),
    { onlyTheirs: [], onlyOurs: ['"Windows"'] },
  );
});

test("applicationCategory and programmingLanguage are lists too", () => {
  assert.deepEqual(
    divergentProperties(
      { applicationCategory: "Game, Multimedia" },
      { applicationCategory: ["Multimedia", "Game"] },
    ),
    [],
  );
  assert.deepEqual(
    divergentProperties(
      { programmingLanguage: ["TypeScript", "Go"] },
      { programmingLanguage: "Go, TypeScript" },
    ),
    [],
  );
  assert.deepEqual(
    divergentProperties(
      { programmingLanguage: ["Go", "C"] },
      { programmingLanguage: "Go" },
    ),
    ["programmingLanguage"],
  );
});

test("a ComputerLanguage node names its language", () => {
  const node = { "@type": "ComputerLanguage", name: "C++" };
  assert.deepEqual(
    divergentProperties(
      { programmingLanguage: node },
      { programmingLanguage: "C++" },
    ),
    [],
  );
  assert.deepEqual(
    divergentProperties(
      { programmingLanguage: [node] },
      { programmingLanguage: "Go" },
    ),
    ["programmingLanguage"],
  );
});

test("a comma in a single-valued property is text, not a separator", () => {
  assert.deepEqual(
    divergentProperties(
      { description: "Fast, small and safe" },
      { description: "small, Fast and safe" },
    ),
    ["description"],
  );
  assert.deepEqual(
    divergentProperties({ name: ["A", "B"] }, { name: "A, B" }),
    ["name"],
  );
});

test("any property stated as an array is read as a set", () => {
  assert.deepEqual(
    divergentProperties(
      { license: ["https://a.example/", "https://b.example/"] },
      { license: ["https://b.example/", "https://a.example/"] },
    ),
    [],
  );
  assert.deepEqual(
    divergentProperties({ name: ["phonometry"] }, { name: "phonometry" }),
    [],
  );
});

test("a property one side does not state is not compared", () => {
  assert.deepEqual(
    divergentProperties({ name: "x" }, { name: "x", operatingSystem: "Linux" }),
    [],
  );
  assert.deepEqual(
    divergentProperties({ name: "x", operatingSystem: "Linux" }, { name: "x" }),
    [],
  );
});

test("values agree whatever the order of arrays and keys", () => {
  assert.ok(
    sameValues(["https://a/", "https://b/"], ["https://b/", "https://a/"]),
  );
  assert.ok(sameValues({ "@id": "x", name: "X" }, { name: "X", "@id": "x" }));
  assert.ok(
    sameValues(
      [{ "@id": "x", sameAs: ["a", "b"] }, "y"],
      ["y", { sameAs: ["b", "a"], "@id": "x" }],
    ),
  );
  assert.ok(sameValues("only", ["only"]));
  // Two spellings of the same accented letter are two values, and a nested
  // array holding both reads the same in either order.
  assert.ok(
    sameValues({ v: ["\u{E9}", "e\u{301}"] }, { v: ["e\u{301}", "\u{E9}"] }),
  );
  assert.ok(!sameValues("\u{E9}", "e\u{301}"));
});

test("values that differ in content still differ", () => {
  assert.ok(!sameValues(["https://a/"], ["https://a/", "https://b/"]));
  assert.ok(!sameValues({ "@id": "x" }, { "@id": "x", name: "X" }));
  // Outside a list property, a comma is part of the text.
  assert.ok(!sameValues("a, b", ["a", "b"]));
  assert.ok(!sameValues(undefined, "a"));
});

// phonometry declares "MIT AND LicenseRef-EASA-ANP", as its PyPI metadata
// does, and its docs site states both URLs as `license` on the shared
// `#software` node. Read as one identifier, the expression resolved to
// itself and the run failed on `phonometry: license`.
const PHONOMETRY_DOCS_LICENSE = Object.freeze([
  "https://opensource.org/license/MIT",
  "https://github.com/jmrplens/phonometry/blob/main/LICENSES/LicenseRef-EASA-ANP.txt",
]);

test("an AND expression is compared as the list of its URLs", () => {
  const licenseUrls = JSON.parse(read("src/data/license-urls.json"));
  const ours = projectValues(
    { ...FULL_RECORD, license: "MIT AND LicenseRef-EASA-ANP" },
    licenseUrls,
  );
  assert.deepEqual(
    divergentProperties({ license: [...PHONOMETRY_DOCS_LICENSE] }, ours),
    [],
  );
  // In either order: JSON-LD arrays are unordered.
  assert.deepEqual(
    divergentProperties(
      { license: PHONOMETRY_DOCS_LICENSE.toReversed() },
      ours,
    ),
    [],
  );
  // A site that states one of the two terms still contradicts.
  assert.deepEqual(
    divergentProperties({ license: PHONOMETRY_DOCS_LICENSE[0] }, ours),
    ["license"],
  );
});

test("phonometry's projects.yaml entry agrees with the license its docs node states", () => {
  const licenseUrls = JSON.parse(read("src/data/license-urls.json"));
  const phonometry = loadYaml(
    read("src/content/profile/projects.yaml"),
  ).projects.find((project) => project.id === "phonometry");
  assert.deepEqual(
    divergentProperties(
      { license: [...PHONOMETRY_DOCS_LICENSE] },
      projectValues(phonometry, licenseUrls),
    ),
    [],
  );
});

test("one identifier still states one URL", () => {
  const licenseUrls = JSON.parse(read("src/data/license-urls.json"));
  assert.equal(
    projectValues(FULL_RECORD, licenseUrls).license,
    "https://opensource.org/license/MIT",
  );
});

// GEO audit #13: mikroscope's docs site said "Network monitoring" and
// /projects/ "Monitoring" on the same node, and nothing compared the
// property.
test("applicationSubCategory is compared", () => {
  assert.ok(CONTRADICTABLE.includes("applicationSubCategory"));
  assert.deepEqual(
    divergentProperties(
      siteValues({ applicationSubCategory: "Network monitoring" }),
      projectValues(
        { ...FULL_RECORD, applicationSubCategory: "Monitoring" },
        {},
      ),
    ),
    ["applicationSubCategory"],
  );
});

test("a localized property is read per language on the site's node", () => {
  const node = {
    description: [
      { "@value": "English.", "@language": "en" },
      { "@value": "Español.", "@language": "es" },
    ],
    keywords: "plain, english",
  };
  const values = siteValues(node);
  assert.equal(values.description, "English.");
  assert.equal(values["description@es"], "Español.");
  // An untagged value is the English one, and there is no Spanish one.
  assert.equal(values.keywords, "plain, english");
  assert.equal(values["keywords@es"], undefined);
  assert.equal(taggedLiteral(node.description, "fr"), undefined);
});

// Kleidos's site spells the vendor "LILYGO"; projects.yaml wrote "LilyGO" in
// `disambiguatingDescription` and `keywords`, two properties nothing compared.
test("a vendor spelled differently in disambiguatingDescription contradicts", () => {
  const theirs = siteValues({
    disambiguatingDescription: [
      {
        "@value": "Firmware for M5Stack and LILYGO boards.",
        "@language": "en",
      },
      { "@value": "Firmware para placas M5Stack y LILYGO.", "@language": "es" },
    ],
  });
  const ours = projectValues(
    {
      ...FULL_RECORD,
      disambiguatingDescription: {
        en: "Firmware for M5Stack and LilyGO boards.",
        es: "Firmware para placas M5Stack y LILYGO.",
      },
    },
    {},
  );
  assert.deepEqual(divergentProperties(theirs, ours), [
    "disambiguatingDescription",
  ]);
});

// The node as kleidos.dev served it on 2026-11-21, the properties
// projects.yaml restates. A future edit of the entry that departs from the
// site fails here without the network; the live comparison catches the site
// moving.
const KLEIDOS_NODE = Object.freeze({
  "@id": "https://kleidos.dev/#software",
  name: "Kleidos",
  alternateName: ["Kleidos firmware", "Kleidos password manager"],
  url: "https://kleidos.dev/",
  description: [
    {
      "@value":
        "Kleidos is a hardware password manager: passwords encrypted on a device you hold, typed over Bluetooth once you unlock it. No app, no cloud. Not released.",
      "@language": "en",
    },
    {
      "@value":
        "Kleidos es un gestor de contraseñas por hardware: contraseñas cifradas en un dispositivo que tienes tú, escritas por Bluetooth al desbloquearlo. Sin app ni nube. Sin publicar.",
      "@language": "es",
    },
  ],
  disambiguatingDescription: [
    {
      "@value":
        "Hardware password manager firmware for nine M5Stack and LILYGO ESP32 boards, by José M. Requena Plens.",
      "@language": "en",
    },
    {
      "@value":
        "Firmware de gestor de contraseñas por hardware para nueve placas ESP32 de M5Stack y LILYGO, escrito por José M. Requena Plens.",
      "@language": "es",
    },
  ],
  license: "https://spdx.org/licenses/GPL-3.0-or-later.html",
  programmingLanguage: { "@type": "ComputerLanguage", name: "C++" },
  keywords: [
    {
      "@value":
        "hardware password manager, ESP32, ESP32-S3, Bluetooth LE HID keyboard, AES-256-CBC, HMAC-SHA256, PBKDF2, TOTP, GPL-3.0-or-later firmware, M5Stack, LILYGO T-Deck, no cloud",
      "@language": "en",
    },
    {
      "@value":
        "gestor de contraseñas hardware, ESP32, ESP32-S3, teclado HID por Bluetooth LE, AES-256-CBC, HMAC-SHA256, PBKDF2, TOTP, firmware GPL-3.0-or-later, M5Stack, LILYGO T-Deck, sin nube",
      "@language": "es",
    },
  ],
});

test("Kleidos's projects.yaml entry agrees with the node kleidos.dev serves", () => {
  const licenseUrls = JSON.parse(read("src/data/license-urls.json"));
  const kleidos = loadYaml(
    read("src/content/profile/projects.yaml"),
  ).projects.find((project) => project.id === "kleidos");
  assert.equal(driftSkip(kleidos), null);
  const theirs = siteValues(KLEIDOS_NODE);
  const ours = projectValues(kleidos, licenseUrls);
  assert.deepEqual(divergentProperties(theirs, ours), []);
  // Every restated property was actually compared, not skipped as unstated.
  for (const property of [
    "name",
    "alternateName",
    "description",
    "description@es",
    "disambiguatingDescription",
    "disambiguatingDescription@es",
    "keywords",
    "keywords@es",
    "license",
    "programmingLanguage",
    "url",
  ]) {
    assert.notEqual(theirs[property], undefined, `site ${property}`);
    assert.notEqual(ours[property], undefined, `ours ${property}`);
  }
});

test("each subjectOf article is its own key, matched to the post's title", () => {
  const theirs = articleHeadlines([
    {
      "@id": "https://jmrp.io/blog/011-vault/#article",
      headline: "A Vault File",
    },
    {
      "@id": "https://jmrp.io/es/blog/011-vault/#article",
      headline: "Un llavero",
    },
    { url: "https://elsewhere.example/" },
  ]);
  assert.deepEqual(Object.keys(theirs), [
    "subjectOf headline https://jmrp.io/blog/011-vault/#article",
    "subjectOf headline https://jmrp.io/es/blog/011-vault/#article",
  ]);
  const ours = postHeadlines(
    [
      { lang: "en", slug: "011-vault", title: "A Vault File" },
      { lang: "es", slug: "011-vault", title: "Una bóveda" },
      { lang: "en", slug: "015-draft", title: "Draft", draft: true },
    ],
    "https://jmrp.io",
  );
  assert.equal(Object.keys(ours).length, 2);
  assert.deepEqual(divergentProperties(theirs, ours, Object.keys(theirs)), [
    "subjectOf headline https://jmrp.io/es/blog/011-vault/#article",
  ]);
});

test("the Kleidos headline exception covers that one article only", () => {
  const wrong =
    "subjectOf headline https://jmrp.io/es/blog/011-encrypt-then-mac-vault/#article";
  const other =
    "subjectOf headline https://jmrp.io/es/blog/012-device-bound-key-derivation/#article";
  assert.deepEqual(classifyDivergences("kleidos", [wrong, other]), {
    contradicting: [other],
    accepted: [wrong],
  });
});

test("the headlines jmrp.io states are the posts' titles", () => {
  const es011 = loadYaml(
    /^---\n([\s\S]*?)\n---/.exec(
      read("src/content/posts/es/011-encrypt-then-mac-vault.mdx"),
    )[1],
  );
  const ours = postHeadlines([{ lang: "es", ...es011 }], "https://jmrp.io");
  assert.equal(
    ours[
      "subjectOf headline https://jmrp.io/es/blog/011-encrypt-then-mac-vault/#article"
    ],
    es011.title,
  );
});
