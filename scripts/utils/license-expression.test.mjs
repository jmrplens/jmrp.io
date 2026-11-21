/**
 * Unit tests for the license rule shared by the card, the JSON-LD node,
 * `projects.json` and the drift check: one identifier states one URL, an AND
 * expression states the list, and every license in projects.yaml resolves.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import {
  isLicenseExpression,
  licenseIdentifiers,
  projectLicenses,
  projectLicenseValue,
} from "./license-expression.mjs";

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const TABLE = Object.freeze({
  MIT: "https://opensource.org/license/MIT",
  "LicenseRef-EASA-ANP":
    "https://github.com/jmrplens/phonometry/blob/main/LICENSES/LicenseRef-EASA-ANP.txt",
});

test("one identifier states one URL, as a string", () => {
  assert.deepEqual(licenseIdentifiers("MIT"), ["MIT"]);
  assert.equal(
    projectLicenseValue({ license: "MIT" }, TABLE),
    "https://opensource.org/license/MIT",
  );
});

test("an AND expression states the URL of each term, in its order", () => {
  const project = { license: "MIT AND LicenseRef-EASA-ANP" };
  assert.deepEqual(projectLicenses(project, TABLE), [
    { id: "MIT", url: "https://opensource.org/license/MIT" },
    {
      id: "LicenseRef-EASA-ANP",
      url: "https://github.com/jmrplens/phonometry/blob/main/LICENSES/LicenseRef-EASA-ANP.txt",
    },
  ]);
  assert.deepEqual(projectLicenseValue(project, TABLE), [
    "https://opensource.org/license/MIT",
    "https://github.com/jmrplens/phonometry/blob/main/LICENSES/LicenseRef-EASA-ANP.txt",
  ]);
});

test("the URLs a project's own site states win over the table", () => {
  assert.equal(
    projectLicenseValue(
      { license: "MIT", licenseUrl: "https://spdx.org/licenses/MIT.html" },
      TABLE,
    ),
    "https://spdx.org/licenses/MIT.html",
  );
  assert.deepEqual(
    projectLicenseValue(
      {
        license: "MIT AND LicenseRef-EASA-ANP",
        licenseUrl: ["https://a.example/", "https://b.example/"],
      },
      TABLE,
    ),
    ["https://a.example/", "https://b.example/"],
  );
});

test("licenseUrl gives one URL per identifier or the license is refused", () => {
  assert.throws(
    () =>
      projectLicenses(
        {
          license: "MIT AND LicenseRef-EASA-ANP",
          licenseUrl: "https://a.example/",
        },
        TABLE,
      ),
    /names 2 identifier\(s\) and licenseUrl gives 1 URL\(s\)/,
  );
});

test("OR, WITH and parentheses are refused, not read as one identifier", () => {
  for (const expression of [
    "MIT OR Apache-2.0",
    "GPL-2.0-or-later WITH Classpath-exception-2.0",
    "(MIT AND LicenseRef-EASA-ANP)",
    "MIT AND",
    "",
  ]) {
    assert.equal(isLicenseExpression(expression), false, expression);
    assert.throws(
      () => licenseIdentifiers(expression),
      /expected one SPDX identifier or identifiers joined by AND/,
      expression,
    );
  }
  assert.equal(isLicenseExpression("MIT AND LicenseRef-EASA-ANP"), true);
  assert.equal(isLicenseExpression("GPL-3.0-or-later"), true);
});

test("an identifier the table does not know falls back to itself", () => {
  // The documented fallback for a partial table; the next test refuses it
  // for every project projects.yaml lists.
  assert.equal(projectLicenseValue({ license: "Zlib" }, TABLE), "Zlib");
});

test("every license in projects.yaml resolves to URLs, and only phonometry's names two", () => {
  const table = JSON.parse(read("src/data/license-urls.json"));
  const projects = loadYaml(read("src/content/profile/projects.yaml")).projects;
  const licensed = projects.filter((project) => project.license);
  assert.ok(licensed.length > 0, "no project states a license");
  for (const project of licensed) {
    for (const { id, url } of projectLicenses(project, table)) {
      assert.match(url, /^https:\/\//, `${project.id}: ${id}`);
    }
  }
  // Every other project keeps one identifier and one URL, as before the
  // expression was read.
  const several = licensed
    .filter((project) => licenseIdentifiers(project.license).length > 1)
    .map((project) => project.id);
  assert.deepEqual(several, ["phonometry"]);
  const phonometry = licensed.find((project) => project.id === "phonometry");
  // The list phonometry's docs site states as `license` on the shared
  // `#software` node, and the expression its PyPI metadata declares.
  assert.equal(phonometry.license, "MIT AND LicenseRef-EASA-ANP");
  assert.deepEqual(projectLicenseValue(phonometry, table), [
    "https://opensource.org/license/MIT",
    "https://github.com/jmrplens/phonometry/blob/main/LICENSES/LicenseRef-EASA-ANP.txt",
  ]);
});
