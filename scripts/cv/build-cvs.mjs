/**
 * Builds the CV PDFs as part of `pnpm build`.
 *
 * Locally (e.g. on the deploy server) it regenerates the ATS LaTeX from the YAML
 * and compiles all six PDFs via `cv_latex/compile_cv.sh`. In CI (`process.env.CI`)
 * — where the LaTeX toolchain is not installed — it is skipped and the committed
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
 * Trade-off worth knowing: the four ATS PDFs embed GitHub stars/downloads
 * fetched at generation time (see github-stats.mjs). Those numbers drift
 * without any file changing, so a skipped build keeps the previous figures.
 * Force a refresh with `pnpm build:cv --force` (or `CV_BUILD_FORCE=1`), which
 * is also what to run after bumping the LaTeX toolchain.
 *
 * @module
 */

import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
  // PDF embeds the vendored fonts — both changes must invalidate the cache.
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

/** SHA-256 over the input files' relative paths and contents. */
function computeInputHash(files) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(ROOT, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
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
    // No cache yet, or it is unreadable/corrupt — treat as a miss and rebuild.
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
    console.warn(`CV build: could not write cache — ${error.message}`);
  }
}

function main() {
  if (process.env.CI) {
    console.log(
      "CV build: CI detected — skipping LaTeX, using committed PDFs.",
    );
    return;
  }
  if (!hasBinary("lualatex") || !hasBinary("xelatex")) {
    console.warn(
      "CV build: LaTeX (lualatex/xelatex) not found — skipping CV compilation.",
    );
    return;
  }

  const force =
    process.argv.includes("--force") || process.env.CV_BUILD_FORCE === "1";
  const inputFiles = collectInputFiles();
  const inputHash = computeInputHash(inputFiles);

  if (!force && inputHash === readCachedHash() && outputsPresent()) {
    console.log(
      `CV build: inputs unchanged (${inputFiles.length} files) — reusing the ` +
        "six existing PDFs. Use `--force` to recompile and refresh GitHub stats.",
    );
    return;
  }

  console.log(
    force
      ? "CV build: --force — compiling all CV PDFs from the YAML…"
      : "CV build: inputs changed — compiling all CV PDFs from the YAML…",
  );
  // NOSONAR: runs a repo-owned script via "bash" on a trusted host (skipped in CI).
  execFileSync("bash", [SCRIPT], { stdio: "inherit" }); // NOSONAR

  // Cache only after a successful compile: execFileSync throws on failure, so a
  // broken run never records a hash that would skip the next attempt.
  writeCache(inputHash, inputFiles.length);
}

main();
