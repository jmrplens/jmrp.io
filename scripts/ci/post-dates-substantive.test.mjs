/**
 * Unit tests for `isSubstantive` (src/utils/post-dates.ts): which commit
 * subjects move a page's revision date.
 *
 * Run: node --test scripts/ci/post-dates-substantive.test.mjs
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isSubstantive } from "../../src/utils/post-dates.ts";

const SHA = "0000000";

test("a cosmetic type with digits, i18n, does not move the date", () => {
  assert.equal(
    isSubstantive(SHA, "i18n(projects): name Ko-fi in the intro (#587)", ""),
    false,
  );
  assert.equal(isSubstantive(SHA, "i18n: fix a Spanish label", ""), false);
});

test("a type with digits that is not cosmetic, a11y, still moves it", () => {
  assert.equal(
    isSubstantive(SHA, "a11y(hash-calculator): announce hashes", ""),
    true,
  );
});

test("the other cosmetic and substantive types keep their meaning", () => {
  assert.equal(isSubstantive(SHA, "chore(cv): refresh the PDFs", ""), false);
  assert.equal(isSubstantive(SHA, "feat(projects): add Kleidos", ""), true);
  assert.equal(isSubstantive(SHA, "fix: a typo in a post", ""), true);
  assert.equal(isSubstantive(SHA, "i18n!: rename every key", ""), true);
  assert.equal(isSubstantive(SHA, "Rewrite the intro", ""), true);
});

test("the Content-Bump trailer still overrides the type", () => {
  assert.equal(isSubstantive(SHA, "feat: a sweep", "skip"), false);
  assert.equal(isSubstantive(SHA, "i18n: a real rewrite", "force"), true);
});
