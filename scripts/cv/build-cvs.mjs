/**
 * Builds the CV PDFs as part of `pnpm build`.
 *
 * Locally (e.g. on the deploy server) it regenerates the ATS LaTeX from the YAML
 * and compiles all six PDFs via `cv_latex/compile_cv.sh`. In CI (`process.env.CI`),
 * where the LaTeX toolchain is not installed, it is skipped and the committed
 * PDFs are used (the `verify-ats` step validates those). It also skips, with a
 * warning, if no LaTeX engine is found, so a contributor without TeX can still
 * run `pnpm build`.
 *
 * ── Content-hash skip ────────────────────────────────────────────────────────
 * Compiling six PDFs costs ~70 s, a quarter of a full build, and ran on every
 * deploy even when the change was a CSS tweak. LaTeX also stamps each PDF with
 * its build time, so every build rewrote all six files and dirtied the git
 * worktree with binary noise. This module now hashes every input that can
 * change a PDF (the CV YAML, the LaTeX sources and templates, the compile
 * script and these scripts) and skips the compile when the hash matches the
 * previous run AND all six PDFs are still on disk.
 *
 * The downloads snapshot is hashed by what the PDFs print from it, not by its
 * raw counts (see `downloadsDisplayProjection`): Docker pulls, NuGet and
 * conda-forge move the exact totals on every refresh, while a badge only says
 * "~185k downloads". Hashing the raw counts recompiled all six PDFs on every
 * deploy and left them modified in git (GEO audit #13).
 *
 * Trade-off worth knowing: the PDFs also embed GitHub stars and release
 * counts fetched at generation time (see github-stats.mjs). Those numbers
 * drift without any file changing, so a skipped build keeps the previous
 * figures. Force a refresh with `pnpm build:cv --force` (or
 * `CV_BUILD_FORCE=1`), which is also what to run after bumping the LaTeX
 * toolchain.
 *
 * @module
 */

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DOWNLOADS_DATA_PATH,
  refreshDownloadsFile,
} from "../refresh-downloads.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(ROOT, "cv_latex", "compile_cv.sh");
const CACHE_FILE = path.join(ROOT, ".cache", "cv-build.json");
const PDF_DIR = path.join(ROOT, "public", "pdf");

/**
 * Directories whose files feed the PDFs, with the extensions that matter.
 * Anything outside this list cannot change a PDF; anything inside it must
 * invalidate the cache.
 */
const INPUT_SOURCES = [
  { dir: path.join(ROOT, "src", "content", "cv"), exts: [".yaml", ".yml"] },
  { dir: path.join(ROOT, "cv_latex"), exts: [".tex", ".cls", ".sty", ".sh"] },
  // The design CVs render the publications straight from papers.bib, and every
  // PDF embeds the vendored fonts: both changes must invalidate the cache.
  // (collectInputFiles does not recurse, so each directory is listed.)
  {
    dir: path.join(ROOT, "src", "content", "publications_data"),
    exts: [".bib"],
  },
  { dir: path.join(ROOT, "cv_latex", "resources"), exts: [".jpeg"] },
  { dir: path.join(ROOT, "cv_latex", "resources", "fonts"), exts: [".ttf"] },
  { dir: __dirname, exts: [".mjs"] },
];

/**
 * Individual files outside {@link INPUT_SOURCES} that still feed the PDFs.
 * Listed one by one rather than by directory: `scripts/` is full of unrelated
 * tooling, and hashing all of it would force a ~70 s LaTeX recompile every
 * time an unrelated script changed.
 */
const INPUT_FILES = [
  // The project metric badges combine GitHub Releases with the other
  // distribution channels declared here, so a change to the channel map
  // changes the numbers printed in the PDFs.
  path.join(ROOT, "scripts", "download-sources.mjs"),
  // The download figures themselves. Refreshed by `main()` before the hash is
  // taken, and hashed through the same formatter the PDFs print with (see
  // `hashableContent`), so a build whose printed badges moved recompiles and
  // one whose exact totals moved below the rounding is skipped. Before this the PDFs fetched their own figures
  // and only when something ELSE changed, so they trailed the page next to
  // them by a build or more (GEO audit #9, A1).
  path.join(ROOT, DOWNLOADS_DATA_PATH),
];

/** The six PDFs `compile_cv.sh` produces; all must exist for a skip to be safe. */
const EXPECTED_PDFS = [
  "CV_RequenaPlensJoseManuel_ENG.pdf",
  "CV_RequenaPlensJoseManuel_ENG_ATS.pdf",
  "CV_RequenaPlensJoseManuel_ENG_ATS_EXT.pdf",
  "CV_RequenaPlensJoseManuel_SPA.pdf",
  "CV_RequenaPlensJoseManuel_SPA_ATS.pdf",
  "CV_RequenaPlensJoseManuel_SPA_ATS_EXT.pdf",
];

/** Returns true if the given executable is on PATH. */
function hasBinary(bin) {
  // NOSONAR: "which" is a standard tool; this only runs on a trusted dev/deploy
  // host (skipped entirely in CI), so PATH is controlled.
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0; // NOSONAR
}

/**
 * Every input file that can change a PDF, sorted so the hash is stable.
 * `cv_latex/generated/` is excluded on purpose: it holds the ATS `.tex` files
 * this build regenerates, so hashing them would compare an output with itself.
 * @returns {string[]} absolute paths
 */
function collectInputFiles() {
  const files = [];
  for (const { dir, exts } of INPUT_SOURCES) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!exts.includes(path.extname(entry.name))) continue;
      files.push(path.join(dir, entry.name));
    }
  }
  files.push(...INPUT_FILES.filter((file) => fs.existsSync(file)));
  return files.sort((a, b) => a.localeCompare(b));
}

/**
 * @typedef {(
 *   stats: { stars: number, releases: number, downloads: number },
 *   locale: string,
 * ) => string[]} StatsFormatter
 * The badge formatter of github-stats.mjs (`formatStats`).
 */

/** The locales the six PDFs are generated in. */
const PDF_LOCALES = ["en", "es"];

/**
 * What the PDFs print from a downloads snapshot, as a stable string.
 *
 * The generators read one figure per project, `projects[<repo>].total`, and
 * print it only through `formatStats`, which rounds it to thousands and drops
 * it below the display floor. Everything else in the file (the site-wide
 * total, the per-channel split, `generatedAt`) never reaches a PDF. So the
 * projection runs every project's total through that same formatter, in both
 * locales, and keeps only the badges: totals that differ below the rounding
 * give the same string, and a change to the rounding or the floor in
 * github-stats.mjs moves the hash with it. Stars and releases are passed as
 * zero because they come from the live API, not from this file; their badges
 * are therefore constant here.
 *
 * A project without a numeric total maps to null: `fetchRepoStats` then
 * fetches that project's figure live, so a total appearing or disappearing
 * changes what the PDFs print and must change the hash.
 *
 * @param {unknown} snapshot - The parsed downloads snapshot.
 * @param {StatsFormatter} format - The formatter the PDFs use.
 * @returns {string} JSON of `[project, badges by locale | null][]`, sorted.
 */
export function downloadsDisplayProjection(snapshot, format) {
  const projects =
    snapshot && typeof snapshot === "object" && "projects" in snapshot
      ? snapshot.projects
      : undefined;
  const entries =
    projects && typeof projects === "object" ? Object.entries(projects) : [];
  const projection = entries
    .map(([name, figures]) => {
      const total = figures?.total;
      if (typeof total !== "number") return [name, null];
      return [
        name,
        PDF_LOCALES.map((locale) =>
          format({ stars: 0, releases: 0, downloads: total }, locale),
        ),
      ];
    })
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(projection);
}

/**
 * The bytes of an input file that matter to the PDFs. Every file is hashed
 * whole except the downloads snapshot, which is hashed by what the PDFs print
 * from it (see {@link downloadsDisplayProjection}): its exact totals and its
 * `generatedAt` change on every refresh whether or not a printed badge did,
 * and hashing them recompiled the six PDFs (~70 s) on every build for nothing.
 *
 * @param {string} file - Absolute path of the input file.
 * @param {{ root?: string, format: StatsFormatter }} options - The repository
 *   root the file is relative to, and the PDFs' badge formatter.
 * @returns {Buffer | string} What to hash for it.
 */
export function hashableContent(file, { root = ROOT, format }) {
  const content = fs.readFileSync(file);
  if (path.relative(root, file) !== DOWNLOADS_DATA_PATH) return content;
  try {
    return downloadsDisplayProjection(
      JSON.parse(content.toString("utf8")),
      format,
    );
  } catch {
    // An unreadable snapshot is hashed as bytes: any edit to it recompiles,
    // which is the safe direction.
    return content;
  }
}

/**
 * SHA-256 over the input files' relative paths and hashable contents.
 *
 * @param {string[]} files - Absolute paths, in a stable order.
 * @param {{ root?: string, format: StatsFormatter }} options - See
 *   {@link hashableContent}.
 * @returns {string} The hex digest.
 */
export function computeInputHash(files, { root = ROOT, format }) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file));
    hash.update("\0");
    hash.update(hashableContent(file, { root, format }));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** True when all six PDFs exist and are non-empty. */
function outputsPresent() {
  return EXPECTED_PDFS.every((name) => {
    const file = path.join(PDF_DIR, name);
    return fs.existsSync(file) && fs.statSync(file).size > 0;
  });
}

/** Previous run's hash, or null when there is no usable cache. */
function readCachedHash() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    return typeof cached.inputHash === "string" ? cached.inputHash : null;
  } catch {
    // No cache yet, or it is unreadable or corrupt: treat it as a miss and rebuild.
    return null;
  }
}

/** Persists the hash. A write failure must not fail the build, only the skip. */
function writeCache(inputHash, fileCount) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({ inputHash, fileCount, pdfs: EXPECTED_PDFS }, null, 2),
    );
  } catch (error) {
    console.warn(`CV build: could not write cache: ${error.message}`);
  }
}

async function main() {
  if (process.env.CI) {
    console.log("CV build: CI detected; skipping LaTeX, using committed PDFs.");
    return;
  }
  if (!hasBinary("lualatex") || !hasBinary("xelatex")) {
    console.warn(
      "CV build: LaTeX (lualatex/xelatex) not found; skipping CV compilation.",
    );
    return;
  }

  const force =
    process.argv.includes("--force") || process.env.CV_BUILD_FORCE === "1";

  // Fresh figures before the hash, always: this is the snapshot the Astro
  // build that follows will reuse, so the page and the PDFs read one file.
  try {
    await refreshDownloadsFile({
      root: ROOT,
      token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN,
      maxAgeMs: 0,
      log: console.log,
    });
  } catch (error) {
    // No snapshot at all and no network: the compile below would embed
    // nothing but zeros, and the Astro build would fail on the import anyway.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`CV build: could not fetch download totals (${message})`);
  }

  // Imported here, after the refresh, rather than at the top: github-stats.mjs
  // reads the snapshot when it loads and throws without one when
  // CV_REQUIRE_DOWNLOADS_SNAPSHOT is exported, which on a fresh clone would
  // fail before the refresh above had written the file.
  const { formatStats } = await import("./github-stats.mjs");
  const inputFiles = collectInputFiles();
  const inputHash = computeInputHash(inputFiles, { format: formatStats });

  if (!force && inputHash === readCachedHash() && outputsPresent()) {
    console.log(
      `CV build: inputs unchanged (${inputFiles.length} files); reusing the ` +
        "six existing PDFs. Use `--force` to recompile and refresh GitHub stats.",
    );
    return;
  }

  console.log(
    force
      ? "CV build: --force, compiling all CV PDFs from the YAML..."
      : "CV build: inputs changed, compiling all CV PDFs from the YAML...",
  );
  // A repo-owned script, run by an absolute interpreter path so nothing on
  // PATH can stand in for it (skipped in CI).
  execFileSync("/bin/bash", [SCRIPT], {
    stdio: "inherit",
    // The generators run from cv_latex/: name the root, and make a missing
    // downloads snapshot fatal so the PDFs cannot disagree with /cv/.
    env: {
      ...process.env,
      JMRP_REPO_ROOT: ROOT,
      CV_REQUIRE_DOWNLOADS_SNAPSHOT: "1",
    },
  });

  // Cache only after a successful compile: execFileSync throws on failure, so a
  // broken run never records a hash that would skip the next attempt.
  writeCache(inputHash, inputFiles.length);
}

// Run only when executed (`pnpm build:cv`), not when a test imports the hash
// helpers: `main()` refreshes the downloads snapshot over the network and
// compiles LaTeX.
// realpath on both sides, because the worktrees and `pnpm` may reach this
// file through a symlink.
function isEntryPoint() {
  try {
    return (
      fs.realpathSync(process.argv[1] ?? "") ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    // No script path (`node -e`, a REPL) or one that no longer exists.
    return false;
  }
}

if (isEntryPoint()) await main();
