/**
 * /projects live-token Sync Checker
 *
 * /projects/ ships `PRJ_*` placeholder tokens that nginx replaces at serve
 * time (`/etc/nginx/lua/projects_ssr_metrics.lua`) with values from the JSON
 * that `scripts/ghc/write-summary.mjs` writes. Three parties must agree on
 * the token names, and nothing structural ties them together:
 *
 * 1. the built pages (what the components emit),
 * 2. the summary the timer writes (`buildNullSummary()` is its full key set),
 * 3. the summary actually served on 127.0.0.1:8999/stats/projects.
 *
 * A token the summary does not carry renders as a dash forever (or, for a
 * `*_CLASS` token, hides its row forever) with no error anywhere. And a token
 * that escapes into a page nginx does not filter (the homepage, llms.txt,
 * JSON-LD) is published verbatim.
 *
 * So this check:
 * - (dist) every `PRJ_*` in the /projects pages and twins is a declared key;
 * - (dist) no other built file contains `PRJ_`;
 * - (live, production only) the served summary has exactly the declared keys.
 *
 * Each part SKIPS with a note when its input is absent (no `dist/`, probe not
 * reachable), so CI runners and dev machines pass by design.
 *
 * Run manually: `node scripts/ci/check-projects-tokens.mjs [distDir]`
 * Wired into `pnpm verify` ("Lint: Projects token sync").
 */

import fs from "node:fs";
import path from "node:path";

import { buildNullSummary } from "../ghc/write-summary.mjs";

const TOKEN_RE = /PRJ_[A-Z0-9_]+/g;
const STATS_URL =
  process.env.PROJECTS_STATS_URL ?? "http://127.0.0.1:8999/stats/projects";
const FETCH_TIMEOUT_MS = 4000;

/** Built files that are allowed (and expected) to carry tokens. */
export const TOKEN_PAGES = [
  "projects/index.html",
  "es/projects/index.html",
  "projects/index.md",
  "es/projects/index.md",
];

/** File types scanned for leaked tokens. */
const SCANNED_EXTENSIONS = new Set([
  ".html",
  ".md",
  ".txt",
  ".xml",
  ".json",
  ".jsonld",
  ".webmanifest",
]);

/**
 * The distinct `PRJ_*` tokens in a text.
 *
 * @param {string} text - Any file content.
 * @returns {Set<string>} Token names found.
 */
export function tokensIn(text) {
  return new Set(text.match(TOKEN_RE));
}

/**
 * Tokens used but not declared, and declared but unused.
 *
 * @param {Set<string>} used - Tokens found in the pages.
 * @param {Set<string>} declared - Keys the summary provides.
 * @returns {{ undeclared: string[], unused: string[] }} Both differences, sorted.
 */
export function compareTokens(used, declared) {
  return {
    undeclared: [...used]
      .filter((token) => !declared.has(token))
      .sort((a, b) => a.localeCompare(b)),
    unused: [...declared]
      .filter((token) => !used.has(token))
      .sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Every scannable file under `dir`, relative to it, with `/` separators.
 *
 * @param {string} dir - Root to walk.
 * @returns {string[]} Relative paths.
 */
function walk(dir) {
  const out = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (SCANNED_EXTENSIONS.has(path.extname(entry.name)))
        out.push(path.relative(dir, full).split(path.sep).join("/"));
    }
  };
  visit(dir);
  return out;
}

/**
 * Checks the built output. Returns problems, or `null` when there is no
 * build to check.
 *
 * @param {string} distDir - Build output directory.
 * @param {Set<string>} declared - Keys the summary provides.
 * @returns {string[] | null} Problem descriptions, empty when clean.
 */
export function checkDist(distDir, declared) {
  if (!fs.existsSync(path.join(distDir, "projects/index.html"))) return null;
  const problems = [];
  const used = new Set();
  for (const page of TOKEN_PAGES) {
    const file = path.join(distDir, page);
    if (!fs.existsSync(file)) {
      problems.push(`${page}: missing from the build`);
      continue;
    }
    for (const token of tokensIn(fs.readFileSync(file, "utf8")))
      used.add(token);
  }
  const { undeclared } = compareTokens(used, declared);
  for (const token of undeclared)
    problems.push(
      `${token}: rendered on /projects but not in the summary (would show a dash forever)`,
    );
  const allowed = new Set(TOKEN_PAGES);
  for (const rel of walk(distDir)) {
    if (allowed.has(rel)) continue;
    const leaked = tokensIn(fs.readFileSync(path.join(distDir, rel), "utf8"));
    if (leaked.size > 0)
      problems.push(
        `${rel}: contains ${[...leaked].slice(0, 3).join(", ")}, but nginx only substitutes the /projects pages`,
      );
  }
  return problems;
}

/**
 * Checks the summary nginx is serving. Returns problems, or `null` when the
 * probe is unreachable (anywhere but the production server).
 *
 * @param {Set<string>} declared - Keys the summary provides.
 * @returns {Promise<string[] | null>} Problem descriptions, empty when clean.
 */
async function checkLive(declared) {
  let body;
  try {
    const response = await fetch(STATS_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    body = await response.json();
  } catch {
    return null;
  }
  const served = new Set(Object.keys(body?.tokens ?? {}));
  const { undeclared, unused } = compareTokens(served, declared);
  return [
    ...unused.map(
      (token) =>
        `${token}: declared in the repo but absent from the served summary (the timer runs older code?)`,
    ),
    ...undeclared.map(
      (token) =>
        `${token}: in the served summary but no longer declared in the repo`,
    ),
  ];
}

/**
 * Runs both checks and reports.
 *
 * @param {string} distDir - Build output directory.
 * @returns {Promise<number>} Process exit code.
 */
async function main(distDir) {
  const declared = new Set(Object.keys(buildNullSummary()));
  const distProblems = checkDist(distDir, declared);
  const liveProblems = await checkLive(declared);
  if (distProblems === null)
    console.log(`⏭  No build at ${distDir}: dist checks skipped.`);
  if (liveProblems === null)
    console.log(`⏭  ${STATS_URL} not reachable: live check skipped.`);
  const problems = [...(distProblems ?? []), ...(liveProblems ?? [])];
  if (problems.length > 0) {
    console.error("❌ /projects token sync:");
    for (const problem of problems) console.error(`   - ${problem}`);
    return 1;
  }
  console.log(
    `✅ /projects token sync: ${declared.size} declared tokens consistent.`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main(process.argv[2] ?? "dist"));
}
