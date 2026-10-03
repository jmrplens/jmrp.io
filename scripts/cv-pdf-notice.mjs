/**
 * Finds the CV PDFs a deploy left uncommitted, for the notice
 * `scripts/deploy-live.mjs` prints at the end of a production deploy.
 *
 * `build:cv` recompiles the six PDFs under `public/pdf/` whenever a figure
 * they embed changes (the downloads snapshot is part of its hash), so after
 * most deploys the served PDFs differ from the committed ones and `main`
 * lags production by a deploy. The PDFs stay in git (author decision,
 * 2026-09-30), so the deploy says so, with the commands that commit them,
 * instead of leaving it to be spotted in `git status` (GEO audit #11).
 *
 * The git calls are injected, so the parsing and the notice are tested
 * without a repository.
 *
 * Deliberately NOT in `scripts/cv/`: `build-cvs.mjs` hashes every `.mjs`
 * there as a PDF input, so an edit to this deploy-time helper (or to its
 * test) would force the ~70 s LaTeX recompile and rewrite the very PDFs it
 * reports on.
 *
 * @module
 */

/** Where the PDFs live, relative to the repository root. */
export const PDF_DIR = "public/pdf";

/** A CV PDF directly under {@link PDF_DIR}. */
const CV_PDF_RE = /^public\/pdf\/CV_[^/]+\.pdf$/;

/**
 * `git status` arguments: NUL-separated porcelain (no path quoting), every
 * untracked file listed on its own, and only {@link PDF_DIR}.
 */
export const GIT_STATUS_ARGS = Object.freeze([
  "status",
  "--porcelain=v1",
  "-z",
  "--untracked-files=all",
  "--",
  PDF_DIR,
]);

/**
 * @typedef {object} PorcelainEntry
 * @property {string} xy The two status letters (`??` for untracked).
 * @property {string} path Path relative to the repository root (the new
 *   path of a rename or copy).
 */

/**
 * @typedef {object} CvPdfChange
 * @property {string} path Path relative to the repository root.
 * @property {"untracked" | "deleted" | "renamed" | "added" | "modified"} state
 *   What git sees, in words.
 */

/**
 * @callback GitRunner
 * @param {readonly string[]} args - Arguments for `git`, run in the repository.
 * @returns {{status: number | null, stdout?: string | null, error?: Error}}
 *   The result, shaped like `spawnSync`'s with `encoding: "utf8"`.
 */

/**
 * Parses `git status --porcelain=v1 -z`. In that format a rename or copy is
 * followed by its original path as a field of its own, which is skipped.
 * Pure.
 *
 * @param {string} text - Raw output.
 * @returns {PorcelainEntry[]} One entry per changed path.
 */
export function parsePorcelainZ(text) {
  const fields = text.split("\0");
  /** @type {PorcelainEntry[]} */
  const entries = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    // "XY path" is at least four characters; the last field is empty.
    if (field.length < 4) continue;
    const xy = field.slice(0, 2);
    entries.push({ xy, path: field.slice(3) });
    if (/[RC]/.test(xy)) index += 1;
  }
  return entries;
}

/**
 * Names a porcelain status in words. Pure.
 *
 * @param {string} xy - The two status letters.
 * @returns {CvPdfChange["state"]} The state.
 */
function describeStatus(xy) {
  if (xy === "??") return "untracked";
  if (xy.includes("D")) return "deleted";
  if (xy.includes("R")) return "renamed";
  if (xy.startsWith("A")) return "added";
  return "modified";
}

/**
 * The CV PDFs in a `git status --porcelain=v1 -z` output, in git's order.
 * Pure.
 *
 * @param {string} text - Raw output.
 * @returns {CvPdfChange[]} Changed or untracked CV PDFs.
 */
export function findUncommittedCvPdfs(text) {
  return parsePorcelainZ(text)
    .filter((entry) => CV_PDF_RE.test(entry.path))
    .map((entry) => ({ path: entry.path, state: describeStatus(entry.xy) }));
}

/**
 * Asks git which CV PDFs are uncommitted.
 *
 * @param {GitRunner} git - Runs git in the repository root.
 * @returns {CvPdfChange[] | null} The PDFs, or null outside a git work tree
 *   (a deploy from an exported tree has nothing to commit).
 * @throws {Error} When git answers inside a work tree but `status` fails.
 */
export function detectUncommittedCvPdfs(git) {
  const inside = git(["rev-parse", "--is-inside-work-tree"]);
  if (inside.error || inside.status !== 0 || inside.stdout?.trim() !== "true") {
    return null;
  }
  const status = git(GIT_STATUS_ARGS);
  if (status.error || status.status !== 0) {
    const reason = status.error?.message ?? `exit code ${status.status}`;
    throw new Error(`git status failed (${reason})`);
  }
  return findUncommittedCvPdfs(status.stdout ?? "");
}

/**
 * Quotes a word for a POSIX shell, leaving plain paths as they are.
 *
 * @param {string} word - A path or argument.
 * @returns {string} The word, single-quoted when it needs to be.
 */
function shellQuote(word) {
  if (/^[\w./-]+$/.test(word)) return word;
  // Each `'` closes the quote, writes an escaped `'`, and reopens it.
  const escaped = word.replaceAll("'", String.raw`'\''`);
  return `'${escaped}'`;
}

/**
 * The notice for uncommitted CV PDFs, one line per entry, with the exact
 * commands that commit them. A `chore` commit, because a CLAUDE.md rule
 * keeps that type from moving any page's date. Pure.
 *
 * @param {readonly CvPdfChange[]} pdfs - Non-empty list from
 *   {@link findUncommittedCvPdfs}.
 * @param {object} options - Options.
 * @param {string} options.root - Repository root, for `git -C`.
 * @param {Date} options.date - Deploy time; its UTC day names the commit.
 * @returns {string[]} Lines, without a log prefix.
 */
export function formatCvPdfNotice(pdfs, { root, date }) {
  const paths = pdfs.map((pdf) => shellQuote(pdf.path)).join(" ");
  const width = Math.max(...pdfs.map((pdf) => pdf.state.length));
  const day = date.toISOString().slice(0, 10);
  const repo = shellQuote(root);
  return [
    `⚠ NOTICE: ${pdfs.length} CV PDF(s) under ${PDF_DIR}/ are not committed: build:cv rebuilt them for this deploy, so the live site serves files that git does not have yet.`,
    ...pdfs.map((pdf) => `    ${pdf.state.padEnd(width)}  ${pdf.path}`),
    "  Commit them so git matches production (a chore commit moves no page date):",
    `    git -C ${repo} add -- ${paths}`,
    `    git -C ${repo} commit -m "chore(cv): refresh the CV PDFs from the ${day} deploy" -- ${paths}`,
    "  then push the branch and merge it through a PR as usual. Not fatal: the deploy itself is complete.",
  ];
}
