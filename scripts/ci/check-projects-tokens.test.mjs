import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  checkDist,
  compareTokens,
  TOKEN_PAGES,
  tokensIn,
} from "./check-projects-tokens.mjs";

const declared = new Set(["PRJ_AS_OF", "PRJ_STREAK"]);

/**
 * A throwaway build tree with the given files.
 *
 * @param {Record<string, string>} files - Relative path to content.
 * @returns {string} The directory.
 */
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prj-tokens-"));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const cleanPages = Object.fromEntries(
  TOKEN_PAGES.map((page) => [page, "updated PRJ_AS_OF, streak PRJ_STREAK"]),
);

test("tokensIn finds distinct tokens", () => {
  assert.deepEqual(
    [...tokensIn("a PRJ_AS_OF b PRJ_AS_OF PRJ_X_1_CLASS")],
    ["PRJ_AS_OF", "PRJ_X_1_CLASS"],
  );
});

test("compareTokens reports both directions", () => {
  assert.deepEqual(
    compareTokens(new Set(["PRJ_A", "PRJ_B"]), new Set(["PRJ_B", "PRJ_C"])),
    { undeclared: ["PRJ_A"], unused: ["PRJ_C"] },
  );
});

test("checkDist skips when there is no build", () => {
  assert.equal(checkDist(tree({}), declared), null);
});

test("checkDist passes a consistent build", () => {
  assert.deepEqual(
    checkDist(tree({ ...cleanPages, "index.html": "home" }), declared),
    [],
  );
});

test("checkDist flags an undeclared token on /projects", () => {
  const problems = checkDist(
    tree({ ...cleanPages, "projects/index.html": "PRJ_NOPE" }),
    declared,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /PRJ_NOPE/);
});

test("checkDist flags a token leaked into another page", () => {
  const problems = checkDist(
    tree({ ...cleanPages, "llms-full.txt": "stars PRJ_STREAK" }),
    declared,
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /llms-full\.txt/);
});
