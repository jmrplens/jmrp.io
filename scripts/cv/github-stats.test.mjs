/**
 * Unit tests for the repository-root lookup in github-stats.mjs: the PDF
 * generators run from cv_latex/, the Astro build from the root, and both
 * must read the same downloads snapshot (GEO audit #10, A1).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { findRepoRoot } from "./github-stats.mjs";

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("findRepoRoot finds the repository from cv_latex/, where compile_cv.sh runs", () => {
  assert.equal(findRepoRoot(path.join(REPO, "cv_latex"), {}), REPO);
  assert.equal(findRepoRoot(REPO, {}), REPO);
});

test("findRepoRoot honours JMRP_REPO_ROOT", () => {
  assert.equal(
    findRepoRoot(path.join(REPO, "cv_latex"), { JMRP_REPO_ROOT: "/srv/x" }),
    "/srv/x",
  );
});

test("findRepoRoot falls back to the start outside any repository", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghstats-"));
  try {
    assert.equal(findRepoRoot(dir, {}), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
