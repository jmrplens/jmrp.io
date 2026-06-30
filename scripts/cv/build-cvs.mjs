/**
 * Builds the CV PDFs as part of `pnpm build`.
 *
 * Locally (e.g. on the deploy server) it regenerates the ATS LaTeX from the YAML
 * and compiles all six PDFs via `cv_latex/compile_cv.sh`, so every deploy ships
 * CVs with fresh GitHub stats. In CI (`process.env.CI`) — where the LaTeX
 * toolchain is not installed — it is skipped and the committed PDFs are used (the
 * `verify-ats` step validates those). It also skips, with a warning, if no LaTeX
 * engine is found, so a contributor without TeX can still run `pnpm build`.
 *
 * @module
 */

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "..", "..", "cv_latex", "compile_cv.sh");

/** Returns true if the given executable is on PATH. */
function hasBinary(bin) {
  // NOSONAR: "which" is a standard tool; this only runs on a trusted dev/deploy
  // host (skipped entirely in CI), so PATH is controlled.
  return spawnSync("which", [bin], { stdio: "ignore" }).status === 0; // NOSONAR
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
  console.log("CV build: compiling all CV PDFs from the YAML…");
  // NOSONAR: runs a repo-owned script via "bash" on a trusted host (skipped in CI).
  execFileSync("bash", [SCRIPT], { stdio: "inherit" }); // NOSONAR
}

main();
