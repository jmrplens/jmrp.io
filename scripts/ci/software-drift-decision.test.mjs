/**
 * Unit tests for the drift guard's pass/fail decision (GEO audit #12, M1).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import {
  ACCEPTED_DIVERGENCES,
  classifyDivergences,
  CONTRADICTABLE,
  divergentProperties,
  driftSkip,
  exitCodeFor,
  projectValues,
  sameValues,
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
      docs: "https://docs.jmrp.io/phonometry/",
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

test("a project in development without a public repository is skipped out loud", () => {
  const skip = driftSkip({
    id: "device",
    status: "upcoming",
    docs: "https://docs.jmrp.io/device/",
  });
  assert.equal(skip?.quiet, false);
  assert.match(skip?.reason ?? "", /no public repository \(status: upcoming\)/);
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
  summary: Object.freeze({ en: "An example.", es: "Its Spanish summary." }),
  license: "MIT",
  language: "Go",
  applicationCategory: "DeveloperApplication",
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
    description: (project) => project.summary?.en,
    "description@es": (project) => project.summary?.es,
    license: (project) => project.licenseUrl ?? project.license,
    programmingLanguage: (project) => project.language,
    applicationCategory: (project) => project.applicationCategory,
    operatingSystem: (project) => project.operatingSystem,
    codeRepository: (project) => project.repo,
    url: (project) => project.repo,
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
