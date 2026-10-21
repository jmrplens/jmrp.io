/**
 * Unit tests for the canonical project list (`public/identity/projects.json`):
 * the record a project in development gets, and the guarantee that every
 * released project's record is unchanged by that support.
 */
// The fixtures carry a Spanish summary, as every projects.yaml entry does.
// cspell:locale en,es
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import { serializeDocument, toRecords } from "./build-projects.mjs";

/** A released project, shaped like a `projects.yaml` entry. */
const released = {
  id: "example",
  name: "Example",
  status: "active",
  schemaType: "SoftwareApplication",
  kicker: "Example · tooling",
  language: "Go",
  license: "MIT",
  repo: "https://github.com/jmrplens/example",
  docs: "https://docs.jmrp.io/example/",
  listings: [
    { label: "npm", url: "https://www.npmjs.com/package/example", icon: "x:y" },
  ],
  topics: [{ name: "Go", wikidata: "Q37227" }],
  summary: { en: "An example.", es: "Un ejemplo." },
};

/** A project in development: no repository, no license, its own sitemap. */
const upcoming = {
  id: "device",
  name: "Device",
  status: "upcoming",
  schemaType: "SoftwareSourceCode",
  language: "C++",
  docs: "https://docs.jmrp.io/device/",
  docsEs: "https://docs.jmrp.io/device/es/",
  sitemap: "sitemap.xml",
  topics: [{ name: "Password manager", wikidata: "Q1056952" }],
  summary: { en: "A device.", es: "Un dispositivo." },
};

test("a released project keeps every field, in the published order", () => {
  const [record] = toRecords({ projects: [released] });
  assert.deepEqual(Object.keys(record), [
    "id",
    "name",
    "status",
    "schemaType",
    "kicker",
    "language",
    "license",
    "licenseUrl",
    "repo",
    "docs",
    "description",
    "descriptionEs",
    "keywords",
    "sameAs",
  ]);
  assert.equal(record.licenseUrl, "https://opensource.org/licenses/MIT");
  assert.deepEqual(record.sameAs, [
    "https://github.com/jmrplens/example",
    "https://www.npmjs.com/package/example",
  ]);
});

test("a project in development has no repository and no invented license", () => {
  const [record] = toRecords({ projects: [upcoming] });
  assert.equal(record.status, "upcoming");
  for (const field of ["repo", "license", "licenseUrl"]) {
    assert.equal(Object.hasOwn(record, field), false, field);
  }
  // `sameAs` stays an array (the hub types it as one), just without the repo.
  assert.deepEqual(record.sameAs, []);
  assert.equal(JSON.stringify(record).includes("undefined"), false);
});

test("sitemap is written only when the YAML sets it", () => {
  const [withSitemap, withoutSitemap] = toRecords({
    projects: [upcoming, released],
  });
  assert.equal(withSitemap.sitemap, "sitemap.xml");
  assert.equal(Object.hasOwn(withoutSitemap, "sitemap"), false);
});

test("an upcoming project that states a license still exports it", () => {
  const [record] = toRecords({
    projects: [{ ...upcoming, license: "GPL-3.0" }],
  });
  assert.equal(record.license, "GPL-3.0");
  assert.equal(typeof record.licenseUrl, "string");
});

test("the committed projects.json is what the YAML generates", () => {
  // The same comparison `--check` makes, so `pnpm test:unit` catches a
  // projects.yaml edit that forgot to regenerate the published list.
  const read = (path) =>
    readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const { serialized } = serializeDocument(
    loadYaml(read("src/content/profile/projects.yaml")),
  );
  assert.equal(serialized, read("public/identity/projects.json"));
});
