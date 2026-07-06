#!/usr/bin/env node
/**
 * Atomic blue/green deploy swap for the static build.
 *
 * `prepare`: picks the inactive color dir (builds/blue|builds/green),
 *   empties it, and prints its relative path to stdout.
 * `swap <dir>`: atomically retargets the `dist` symlink to <dir> using
 *   ln -sfn + rename(2) (via `fs.renameSync`), so Nginx never sees a missing
 *   root. Migrates a legacy `dist` directory to `builds/<color>` on first run.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BUILDS = path.join(ROOT, "builds");
const DIST = path.join(ROOT, "dist");
const COLORS = ["blue", "green"];

/**
 * Resolves what `dist` currently points to.
 * @returns {string | null} The resolved absolute path of the symlink target,
 *   the literal string "legacy-dir" if `dist` exists as a real directory, or
 *   `null` if `dist` does not exist.
 */
function currentTarget() {
  try {
    if (fs.lstatSync(DIST).isSymbolicLink()) {
      return path.resolve(ROOT, fs.readlinkSync(DIST));
    }
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw new Error(
      `deploy-swap: failed to inspect ${DIST}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  return "legacy-dir"; // dist exists but is a real directory
}

/**
 * Removes orphaned `.dist.tmp-*` symlinks left behind by a `swap` run that
 * crashed between creating the temp symlink and renaming it over `dist`
 * (see {@link swap}). Best-effort: a file that can't be removed (already
 * gone, permission issue) is silently skipped since it isn't in the way of
 * a fresh `prepare`/`swap` cycle using a new PID-suffixed name.
 * @returns {void}
 */
function cleanupOrphanedTmpLinks() {
  let entries;
  try {
    entries = fs.readdirSync(ROOT);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.startsWith(".dist.tmp-")) continue;
    try {
      fs.rmSync(path.join(ROOT, entry), { force: true });
    } catch {
      // Best-effort cleanup - a leftover orphan doesn't block this run.
    }
  }
}

/**
 * Picks the inactive color directory, empties it, and prints its
 * repo-relative path to stdout for the caller to use as `astro build --outDir`.
 * @returns {void}
 */
function prepare() {
  fs.mkdirSync(BUILDS, { recursive: true });
  cleanupOrphanedTmpLinks();
  const target = currentTarget();
  const active = COLORS.find((c) => target === path.join(BUILDS, c));
  const inactive = active === "blue" ? "green" : "blue";
  const outDir = path.join(BUILDS, inactive);
  fs.rmSync(outDir, { recursive: true, force: true });
  process.stdout.write(path.relative(ROOT, outDir));
}

/**
 * Atomically retargets the `dist` symlink to the freshly built directory.
 * @param {string} outDirArg Repo-relative or absolute path to the new build
 *   output directory (as produced by `prepare`).
 * @returns {void}
 */
function swap(outDirArg) {
  const outDir = path.resolve(ROOT, outDirArg);
  if (!fs.existsSync(path.join(outDir, "index.html"))) {
    console.error(`deploy-swap: ${outDirArg} has no index.html; aborting.`);
    process.exit(1);
  }
  const target = currentTarget();
  if (target === "legacy-dir") {
    // First run: migrate real dist/ out of the way, keep it as fallback color
    const active = COLORS.find((c) => path.join(BUILDS, c) !== outDir);
    const legacyDest = path.join(BUILDS, active);
    fs.rmSync(legacyDest, { recursive: true, force: true });
    fs.renameSync(DIST, legacyDest);
  }
  // Atomic retarget: create temp symlink, rename over dist. fs.renameSync
  // wraps rename(2) directly — same atomic, non-dereferencing semantics as
  // `mv -T` for a symlink-to-symlink swap, without spawning a subprocess.
  const tmpLink = path.join(ROOT, `.dist.tmp-${process.pid}`);
  fs.rmSync(tmpLink, { force: true });
  fs.symlinkSync(path.relative(ROOT, outDir), tmpLink);
  fs.renameSync(tmpLink, DIST);
  console.log(`deploy-swap: dist -> ${path.relative(ROOT, outDir)}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "prepare") prepare();
else if (cmd === "swap" && arg) swap(arg);
else {
  console.error("usage: deploy-swap.mjs prepare | swap <outDir>");
  process.exit(1);
}
