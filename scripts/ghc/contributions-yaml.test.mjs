/**
 * Guards `contributions-yaml.mjs`'s loader against the exact YAML footgun
 * that broke it once (a `#` mid-string being read as a comment — see the
 * header comment in `src/content/profile/contributions.yaml`), and checks
 * the real, checked-in file loads and validates.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  deriveOwnProjects,
  foldProjectName,
  loadContributionsConfig,
} from "./contributions-yaml.mjs";

/**
 * Writes a minimal, valid `contributions.yaml` under a fresh temp root and
 * returns that root, so `loadContributionsConfig(root)` can read it exactly
 * like it reads the real file.
 *
 * @param {string} yaml - The YAML body (without the `type:` header).
 * @returns {string} The temp repository root.
 */
function tempRootWith(yaml) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ghc-contrib-"));
  const dir = path.join(root, "src/content/profile");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "contributions.yaml"),
    `type: contributions\n${yaml}`,
  );
  return root;
}

test("loadContributionsConfig defaults optional arrays/maps", () => {
  const root = tempRootWith(
    "featured:\n" +
      "  - repo: owner/repo\n" +
      "    number: 1\n" +
      "    kind: pull_request\n" +
      '    why: {en: "why", es: "por qué"}\n',
  );
  const config = loadContributionsConfig(root);
  assert.deepEqual(config.listingRepos, []);
  assert.deepEqual(config.exclude, []);
  assert.deepEqual(config.displayName, {});
  assert.deepEqual(config.securityTitleAllow, []);
  assert.deepEqual(config.listingAliases, {});
  assert.equal(config.featured.length, 1);
});

test("loadContributionsConfig throws on a missing type", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ghc-contrib-"));
  const dir = path.join(root, "src/content/profile");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "contributions.yaml"), "featured: []\n");
  assert.throws(() => loadContributionsConfig(root), /type: contributions/);
});

test("loadContributionsConfig throws on an empty featured list", () => {
  const root = tempRootWith("featured: []\n");
  assert.throws(() => loadContributionsConfig(root), /featured/);
});

test("a title containing a PR number (#1234) round-trips only when quoted", () => {
  // Unquoted: YAML treats the space-then-# as a comment start, silently
  // truncating the value. This is exactly the bug fixed in the real
  // contributions.yaml — guarded here so it cannot regress unnoticed.
  const root = tempRootWith(
    "featured:\n" +
      "  - repo: owner/repo\n" +
      "    number: 1\n" +
      "    kind: pull_request\n" +
      "    why:\n" +
      '      en: "Five merged fixes (#1255, #1268) with tests."\n' +
      '      es: "cinco correcciones"\n',
  );
  const config = loadContributionsConfig(root);
  assert.equal(
    config.featured[0].why.en,
    "Five merged fixes (#1255, #1268) with tests.",
  );
});

test("foldProjectName falls back to the bare repo name when unmapped", () => {
  assert.equal(foldProjectName("owner/repo", {}), "repo");
  assert.equal(foldProjectName("acmesh-official/acme.sh", {}), "acme.sh");
  assert.equal(
    foldProjectName("henrygd/beszel-docs", { "henrygd/beszel-docs": "Beszel" }),
    "Beszel",
  );
});

test("deriveOwnProjects matches every roster id mentioned in a listing PR title", () => {
  const activeRepos = ["gitlab-mcp-server", "libgen-mcp", "mikroscope"];
  assert.deepEqual(
    deriveOwnProjects(
      "New version: jmrplens.gitlab-mcp-server version 2.7.5",
      activeRepos,
      {},
    ),
    ["gitlab-mcp-server"],
  );
  assert.deepEqual(
    deriveOwnProjects("Add mikroscope to Monitoring", activeRepos, {}),
    ["mikroscope"],
  );
});

test("deriveOwnProjects matches every project a title names, not just the first", () => {
  const activeRepos = ["gitlab-mcp-server", "libgen-mcp"];
  const projects = deriveOwnProjects(
    "Add libgen-mcp and gitlab-mcp-server, two remote servers hosted at mcp.jmrp.io",
    activeRepos,
    {},
  );
  assert.deepEqual(
    new Set(projects),
    new Set(["libgen-mcp", "gitlab-mcp-server"]),
  );
});

test("deriveOwnProjects resolves a pre-rename title through listingAliases", () => {
  const activeRepos = ["phonometry"];
  assert.deepEqual(
    deriveOwnProjects("Adding pyoctaveband", activeRepos, {
      pyoctaveband: "phonometry",
    }),
    ["phonometry"],
  );
});

test("deriveOwnProjects returns an empty list when the title names no roster project", () => {
  assert.deepEqual(
    deriveOwnProjects("Fix a typo in the README", ["gitlab-mcp-server"], {}),
    [],
  );
});

test("the real repository contributions.yaml loads and folds beszel + beszel-docs to the same name", () => {
  const root = path.resolve(import.meta.dirname, "../..");
  const config = loadContributionsConfig(root);
  assert.ok(config.featured.length > 0 && config.featured.length <= 6);
  assert.equal(
    foldProjectName("henrygd/beszel", config.displayName),
    foldProjectName("henrygd/beszel-docs", config.displayName),
  );
  for (const item of config.exclude) {
    assert.match(item, /^[\w.-]+\/[\w.-]+#\d+$/, item);
  }
});
