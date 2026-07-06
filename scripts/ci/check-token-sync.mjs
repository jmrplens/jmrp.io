/**
 * Light/Dark Token Sync Checker
 *
 * `src/styles/tokens.css` cannot merge its duplicated theme blocks in plain
 * CSS (there is no preprocessor in this project): `@media (prefers-color-scheme:
 * light)` cannot appear in a selector list next to `:root[data-theme="light"]`,
 * so the two blocks are maintained by hand as literal duplicates. Likewise
 * `:root[data-theme="dark"]` restates the subset of `:root` (the dark
 * baseline) needed to win the cascade over the light `@media` block when the
 * OS is light but the user forces dark.
 *
 * Each half of a pair is marked with a `/* KEEP-IN-SYNC: <label> * /`
 * sentinel comment immediately before the rule.
 *
 * PARSING STRATEGY (no real CSS parser is used): tokens.css is full of prose
 * comments, some containing literal `{`/`}` (e.g. an aside like
 * `/* old } shorthand * /`). Counting braces on the raw text would let those
 * corrupt the "find the end of this rule" walk, and matching declarations
 * on the raw body could pick up text that only looks like `--foo: bar;`
 * inside a comment. To avoid both, this script masks the ENTIRE file up
 * front, before locating any sentinel or brace: every comment is replaced
 * character-for-character with spaces (newlines kept as-is, so line numbers
 * stay identical to the source) — EXCEPT comments that start with
 * `/* KEEP-IN-SYNC:`, which are left untouched so they can still be found.
 * Brace matching and declaration extraction then run on this masked text,
 * where stray braces/colons/semicolons hidden in prose simply cannot exist
 * anymore. Line numbers reported in diagnostics are computed on the masked
 * text too, but since masking never removes a newline they are identical to
 * the real source line numbers.
 *
 * Comparison semantics (deliberately different per pair, documented in
 * tokens.css's file header too):
 *   - "light-tokens": FULL EQUALITY. The `@media` block and the manual
 *     `:root[data-theme="light"]` override must declare the exact same set
 *     of keys with the exact same values — neither may have a token the
 *     other lacks.
 *   - "dark-tokens": SUBSET. `:root` (first occurrence, the baseline) also
 *     holds tokens that never change with theme (fonts, spacing, z-index,
 *     ...), so it may have extra keys the override doesn't restate — that's
 *     expected, not a desync. Every key the override (`:root[data-theme=
 *     "dark"]`, second occurrence) DOES declare must exist in the baseline
 *     with an identical value.
 *
 * Exits with `process.exitCode = 1` (does not throw or hard-exit) and prints
 * a readable diff — pointing at the exact declaration lines, not just the
 * sentinel — when a pair is out of sync.
 *
 * Run manually: `node scripts/ci/check-token-sync.mjs`
 * Wired into `pnpm verify` ("Lint: Token sync") and the `sa-stylelint` CI job.
 */

import fs from "node:fs";
import path from "node:path";

const TOKENS_FILE = path.join(process.cwd(), "src/styles/tokens.css");
const SENTINEL_PREFIX = "/* KEEP-IN-SYNC:";

/**
 * @typedef {"equal" | "subset"} SyncMode
 */

/**
 * @typedef {object} SyncPair
 * @property {string} label - Sentinel label (`KEEP-IN-SYNC: <label>`).
 * @property {SyncMode} mode - "equal" for full set equality, "subset" for
 *   "second block's keys must exist in the first with the same value".
 */

/** @type {SyncPair[]} */
const PAIRS = [
  { label: "light-tokens", mode: "equal" },
  { label: "dark-tokens", mode: "subset" },
];

/**
 * Blanks out every CSS comment in the file except `KEEP-IN-SYNC` sentinels,
 * replacing each non-newline character of the comment with a space. This
 * neutralizes stray `{`/`}`/`--foo:...;`-shaped text living in prose
 * comments before any brace-matching or declaration extraction happens,
 * while preserving every character offset and line number so diagnostics
 * still point at the real source location.
 *
 * @param {string} css - Full contents of tokens.css.
 * @returns {string} Same-length string with non-sentinel comments blanked.
 */
function maskComments(css) {
  return css.replaceAll(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.startsWith(SENTINEL_PREFIX)
      ? comment
      : comment.replaceAll(/[^\n]/g, " "),
  );
}

/**
 * @typedef {{ value: string, line: number }} DeclarationInfo
 */

/**
 * @typedef {object} ExtractedBlock
 * @property {Map<string, DeclarationInfo>} declarations - Custom property name → value + source line.
 * @property {number} nextIndex - Offset right after the closing brace, for locating the next occurrence.
 * @property {number} line - 1-indexed source line of the sentinel comment (for diagnostics).
 */

/**
 * Checks whether a single character may appear in a `--custom-property` name
 * (word character or hyphen). A one-character check has no quantifier, so —
 * unlike a `[\w-]+`-shaped regex — it carries no backtracking risk (Sonar
 * S8786: a regex must not let two quantifiers ambiguously repartition the
 * same input).
 *
 * @param {string} ch - A single character.
 * @returns {boolean} `true` when `ch` is a valid custom-property name character.
 */
function isNameChar(ch) {
  return /[\w-]/.test(ch);
}

/**
 * Extracts `--custom-property: value;` declarations from a CSS rule body by
 * scanning with `indexOf` and manual index walks instead of a single regex
 * with adjacent quantifiers (Sonar S8786). Behaviorally identical to the
 * `/(--[\w-]+)\s*:([^;]+);/g` loop this replaces: same property names,
 * trimmed values, and per-declaration source lines.
 *
 * @param {string} body - The `{ ... }` rule body (comments already blanked by {@link maskComments}).
 * @param {number} braceStart - Absolute offset of `body[0]` within `maskedCss` (for line-number math).
 * @param {string} maskedCss - The full masked file (for computing line numbers).
 * @returns {Map<string, DeclarationInfo>} Custom property name → value + source line.
 */
function extractDeclarations(body, braceStart, maskedCss) {
  const declarations = new Map();
  let cursor = 0;
  for (;;) {
    const nameStart = body.indexOf("--", cursor);
    if (nameStart === -1) break;

    let nameEnd = nameStart + 2;
    while (nameEnd < body.length && isNameChar(body[nameEnd])) nameEnd++;
    if (nameEnd === nameStart + 2) {
      // Bare "--" with no name characters after it — not a declaration.
      cursor = nameStart + 2;
      continue;
    }

    let valueStart = nameEnd;
    while (valueStart < body.length && /\s/.test(body[valueStart])) {
      valueStart++;
    }
    if (body[valueStart] !== ":") {
      // No colon (after optional whitespace) — not a declaration; resume
      // scanning right after the name so it can't be matched again.
      cursor = nameEnd;
      continue;
    }

    const semiIndex = body.indexOf(";", valueStart + 1);
    if (semiIndex === -1) break; // No terminating `;` left in this rule.

    const name = body.slice(nameStart, nameEnd);
    const rawValue = body.slice(valueStart + 1, semiIndex);
    const absoluteIndex = braceStart + nameStart;
    const line = maskedCss.slice(0, absoluteIndex).split("\n").length;
    declarations.set(name, { value: rawValue.trim(), line });
    cursor = semiIndex + 1;
  }
  return declarations;
}

/**
 * Extracts the `--custom-property: value;` declarations from the CSS rule
 * that immediately follows a `KEEP-IN-SYNC` sentinel comment.
 *
 * @param {string} maskedCss - Full contents of tokens.css with non-sentinel comments blanked (see {@link maskComments}).
 * @param {string} label - Sentinel label to search for.
 * @param {number} fromIndex - Offset to start searching from (used to find repeated labels in order).
 * @returns {ExtractedBlock} The parsed declarations plus positional metadata.
 */
function extractBlockAfterSentinel(maskedCss, label, fromIndex) {
  const sentinel = `/* KEEP-IN-SYNC: ${label} */`;
  const sentinelIndex = maskedCss.indexOf(sentinel, fromIndex);
  if (sentinelIndex === -1) {
    throw new Error(
      `Sentinel "${sentinel}" not found after offset ${fromIndex} in ${TOKENS_FILE}`,
    );
  }

  const braceStart = maskedCss.indexOf("{", sentinelIndex);
  if (braceStart === -1) {
    throw new Error(`No opening brace found after sentinel "${sentinel}"`);
  }

  // Walk forward matching braces to find the end of this top-level rule.
  // Handles one level of nesting (`@media { :root:not(...) { ... } }`).
  // Comments are already blanked, so no stray brace hiding in prose can
  // unbalance this count.
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < maskedCss.length; i++) {
    if (maskedCss[i] === "{") depth++;
    else if (maskedCss[i] === "}") {
      depth--;
      if (depth === 0) {
        braceEnd = i;
        break;
      }
    }
  }
  if (braceEnd === -1) {
    throw new Error(`Unbalanced braces after sentinel "${sentinel}"`);
  }

  const body = maskedCss.slice(braceStart, braceEnd + 1);
  const declarations = extractDeclarations(body, braceStart, maskedCss);

  const line = maskedCss.slice(0, sentinelIndex).split("\n").length;
  return { declarations, nextIndex: braceEnd + 1, line };
}

/**
 * Diffs a single key present in the override/second block (`infoB`) against
 * its counterpart in the baseline/first block (`infoA`, absent when the key
 * only exists in the override). Shared by both sync modes since a missing-
 * or-differing check against the baseline is identical either way; only the
 * message wording (and whether the reverse direction is also checked) differs.
 *
 * @param {string} key - Custom property name being compared.
 * @param {DeclarationInfo | undefined} infoA - Baseline declaration, if any.
 * @param {DeclarationInfo} infoB - Override/second-block declaration.
 * @param {number} firstLine - Sentinel line of the baseline block (for "missing" messages).
 * @param {boolean} isSubset - `true` for "subset" mode wording, `false` for "equal" mode wording.
 * @returns {string | undefined} A diff line, or `undefined` when the key matches.
 */
function diffKeyAgainstBaseline(key, infoA, infoB, firstLine, isSubset) {
  if (!infoA) {
    return isSubset
      ? `  - ${key}: declared at line ${infoB.line} (override), missing from baseline near line ${firstLine}`
      : `  - ${key}: declared at line ${infoB.line}, missing from the block near line ${firstLine}`;
  }
  if (infoA.value !== infoB.value) {
    return isSubset
      ? `  - ${key}: baseline line ${infoA.line} = "${infoA.value}" vs override line ${infoB.line} = "${infoB.value}"`
      : `  - ${key}: line ${infoA.line} = "${infoA.value}" vs line ${infoB.line} = "${infoB.value}"`;
  }
}

/**
 * "equal" mode diff: the two blocks must declare the exact same set of keys
 * with the exact same values — checked in both directions.
 *
 * @param {Map<string, DeclarationInfo>} a - First/baseline block declarations.
 * @param {Map<string, DeclarationInfo>} b - Second/override block declarations.
 * @param {ExtractedBlock} first - First block metadata (for line references).
 * @param {ExtractedBlock} second - Second block metadata (for line references).
 * @returns {string[]} Diff lines; empty when both blocks match exactly.
 */
function diffEqual(a, b, first, second) {
  const issues = [];
  for (const [key, infoA] of a) {
    const diff = diffKeyAgainstBaseline(
      key,
      infoA,
      b.get(key),
      second.line,
      false,
    );
    if (diff) issues.push(diff);
  }
  for (const [key, infoB] of b) {
    if (!a.has(key)) {
      issues.push(
        `  - ${key}: declared at line ${infoB.line}, missing from the block near line ${first.line}`,
      );
    }
  }
  return issues;
}

/**
 * "subset" mode diff: every key declared in the override (second block) must
 * exist in the baseline (first block) with an identical value. Extra keys
 * that only exist in the baseline are expected, not an error.
 *
 * @param {Map<string, DeclarationInfo>} a - Baseline block declarations.
 * @param {Map<string, DeclarationInfo>} b - Override block declarations.
 * @param {ExtractedBlock} first - Baseline block metadata (for line references).
 * @returns {string[]} Diff lines; empty when the override is a valid subset.
 */
function diffSubset(a, b, first) {
  const issues = [];
  for (const [key, infoB] of b) {
    const diff = diffKeyAgainstBaseline(
      key,
      a.get(key),
      infoB,
      first.line,
      true,
    );
    if (diff) issues.push(diff);
  }
  return issues;
}

/**
 * Compares two extracted blocks according to a pair's sync mode.
 *
 * @param {SyncPair} pair - Pair definition (label + comparison mode).
 * @param {ExtractedBlock} first - Document-order first occurrence of the sentinel.
 * @param {ExtractedBlock} second - Document-order second occurrence of the sentinel.
 * @returns {string[]} Human-readable diff lines; empty when the pair is in sync.
 */
function diffPair(pair, first, second) {
  const a = first.declarations;
  const b = second.declarations;
  return pair.mode === "equal"
    ? diffEqual(a, b, first, second)
    : diffSubset(a, b, first);
}

/**
 * Runs the sync check for every configured pair and prints a report.
 *
 * @returns {boolean} `true` when every pair is in sync, `false` otherwise.
 */
function checkTokenSync() {
  const rawCss = fs.readFileSync(TOKENS_FILE, "utf8");
  const css = maskComments(rawCss);
  const report = [];
  let inSync = true;

  for (const pair of PAIRS) {
    const sentinel = `/* KEEP-IN-SYNC: ${pair.label} */`;
    let first;
    let second;
    try {
      first = extractBlockAfterSentinel(css, pair.label, 0);
      second = extractBlockAfterSentinel(css, pair.label, first.nextIndex);
    } catch (error) {
      inSync = false;
      report.push(
        `✗ ${pair.label}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const thirdIndex = css.indexOf(sentinel, second.nextIndex);
    if (thirdIndex !== -1) {
      inSync = false;
      const line = css.slice(0, thirdIndex).split("\n").length;
      report.push(
        `✗ ${pair.label}: found a third sentinel at line ${line} — expected exactly 2.`,
      );
      continue;
    }

    const issues = diffPair(pair, first, second);
    if (issues.length > 0) {
      inSync = false;
      const modeLabel =
        pair.mode === "equal"
          ? "must match exactly"
          : "override must be a subset of the baseline";
      report.push(`✗ ${pair.label} out of sync (${modeLabel}):`, ...issues);
    } else {
      report.push(
        `✓ ${pair.label} in sync (${first.declarations.size} vs ${second.declarations.size} tokens compared).`,
      );
    }
  }

  console.log(report.join("\n"));
  return inSync;
}

try {
  const inSync = checkTokenSync();
  if (inSync) {
    console.log("\n✅ All token pairs in sync.");
  } else {
    console.error("\n❌ Token sync check failed — see diff above.");
    process.exitCode = 1;
  }
} catch (error) {
  console.error("❌ Unexpected error:", error);
  process.exitCode = 1;
}
