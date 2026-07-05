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
 * sentinel comment immediately before the rule. This script has no real CSS
 * parser: for each sentinel it walks forward to the first `{`, matches
 * braces to find the end of that top-level rule (handling the one level of
 * `@media { :root:not(...) { ... } }` nesting used by the light auto block),
 * strips `/* ... * /` comments, and extracts every `--custom-prop: value;`
 * declaration inside.
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
 * a readable diff when a pair is out of sync.
 *
 * Run manually: `node scripts/ci/check-token-sync.mjs`
 * Wired into `pnpm verify` ("Lint: Token sync") and the `sa-stylelint` CI job.
 */

import fs from "node:fs";
import path from "node:path";

const TOKENS_FILE = path.join(process.cwd(), "src/styles/tokens.css");

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
 * @typedef {object} ExtractedBlock
 * @property {Map<string, string>} declarations - Custom property name → trimmed value.
 * @property {number} nextIndex - Offset right after the closing brace, for locating the next occurrence.
 * @property {number} line - 1-indexed source line of the sentinel comment (for diagnostics).
 */

/**
 * Extracts the `--custom-property: value;` declarations from the CSS rule
 * that immediately follows a `KEEP-IN-SYNC` sentinel comment.
 *
 * @param {string} css - Full contents of tokens.css.
 * @param {string} label - Sentinel label to search for.
 * @param {number} fromIndex - Offset to start searching from (used to find repeated labels in order).
 * @returns {ExtractedBlock} The parsed declarations plus positional metadata.
 */
function extractBlockAfterSentinel(css, label, fromIndex) {
  const sentinel = `/* KEEP-IN-SYNC: ${label} */`;
  const sentinelIndex = css.indexOf(sentinel, fromIndex);
  if (sentinelIndex === -1) {
    throw new Error(
      `Sentinel "${sentinel}" not found after offset ${fromIndex} in ${TOKENS_FILE}`,
    );
  }

  const braceStart = css.indexOf("{", sentinelIndex);
  if (braceStart === -1) {
    throw new Error(`No opening brace found after sentinel "${sentinel}"`);
  }

  // Walk forward matching braces to find the end of this top-level rule.
  // Handles one level of nesting (`@media { :root:not(...) { ... } }`); the
  // selectors involved never contain literal `{`/`}` themselves.
  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
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

  const body = css
    .slice(braceStart, braceEnd + 1)
    .replaceAll(/\/\*[\s\S]*?\*\//g, "");

  const declarations = new Map();
  const declRegex = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match;
  while ((match = declRegex.exec(body))) {
    const [, name, rawValue] = match;
    declarations.set(name, rawValue.trim());
  }

  const line = css.slice(0, sentinelIndex).split("\n").length;
  return { declarations, nextIndex: braceEnd + 1, line };
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
  const issues = [];
  const a = first.declarations;
  const b = second.declarations;

  if (pair.mode === "equal") {
    for (const [key, value] of a) {
      if (!b.has(key)) {
        issues.push(
          `  - ${key}: declared at line ${first.line}, missing at line ${second.line}`,
        );
      } else if (b.get(key) !== value) {
        issues.push(
          `  - ${key}: line ${first.line} = "${value}" vs line ${second.line} = "${b.get(key)}"`,
        );
      }
    }
    for (const key of b.keys()) {
      if (!a.has(key)) {
        issues.push(
          `  - ${key}: declared at line ${second.line}, missing at line ${first.line}`,
        );
      }
    }
  } else {
    // subset: every key declared in the override (second block) must exist
    // in the baseline (first block) with an identical value. Extra keys
    // that only exist in the baseline are expected, not an error.
    for (const [key, value] of b) {
      if (!a.has(key)) {
        issues.push(
          `  - ${key}: declared at line ${second.line} (override), missing from baseline at line ${first.line}`,
        );
      } else if (a.get(key) !== value) {
        issues.push(
          `  - ${key}: baseline line ${first.line} = "${a.get(key)}" vs override line ${second.line} = "${value}"`,
        );
      }
    }
  }

  return issues;
}

/**
 * Runs the sync check for every configured pair and prints a report.
 *
 * @returns {boolean} `true` when every pair is in sync, `false` otherwise.
 */
function checkTokenSync() {
  const css = fs.readFileSync(TOKENS_FILE, "utf8");
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
