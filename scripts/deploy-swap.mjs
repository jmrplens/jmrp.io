#!/usr/bin/env node
/**
 * Atomic blue/green deploy swap for the static build.
 *
 * `prepare`: picks the inactive color dir (builds/blue|builds/green),
 *   empties it, and prints its relative path to stdout.
 * `swap <dir>`: gives the files that did not change the modification time of
 *   the live build, so their validators survive the deploy, then atomically
 *   retargets the `dist` symlink to <dir> using ln -sfn + rename(2) (via
 *   `fs.renameSync`), so Nginx never sees a missing root. Migrates a legacy
 *   `dist` directory to `builds/<color>` on first run.
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
    if (error?.code === "ENOENT") return null;
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
 * Gives one file of the new build the modification time of its live copy, if
 * the two are byte-identical. Nginx reads only whole seconds, and whole seconds
 * are what this writes: `Stats.mtime` rounds to the millisecond, which can carry
 * into the next second and change the ETag it was meant to keep.
 * @param {string} livePath Path of the file in the live build.
 * @param {string} nextPath Path of the file in the new build.
 * @returns {boolean} Whether the modification time was changed.
 */
function keepLiveMtime(livePath, nextPath) {
  let live;
  try {
    live = fs.lstatSync(livePath);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!live.isFile()) return false;
  const next = fs.lstatSync(nextPath);
  const liveSeconds = Math.trunc(live.mtimeMs / 1000);
  if (
    live.size !== next.size ||
    liveSeconds === Math.trunc(next.mtimeMs / 1000)
  ) {
    return false;
  }
  if (!fs.readFileSync(livePath).equals(fs.readFileSync(nextPath)))
    return false;
  fs.utimesSync(nextPath, next.atime, liveSeconds);
  return true;
}

/**
 * Keeps the validators of every file this build did not change. Nginx derives
 * ETag and Last-Modified from the modification time and the size, and a build
 * rewrites every file, so each deploy made revalidating clients download files
 * that were still byte-identical, and broke their resumed downloads. The post
 * build steps cannot do this: they see only the files they process, and the live
 * build is out of their reach.
 *
 * Best effort. A file it cannot read or stamp only costs that file's validators,
 * which is no reason to refuse a build that is otherwise ready to go live.
 * @param {string} liveDir Absolute path of the build being replaced.
 * @param {string} nextDir Absolute path of the build about to go live.
 * @returns {void}
 */
function keepUnchangedValidators(liveDir, nextDir) {
  let kept = 0;
  let failed = 0;
  for (const entry of fs.readdirSync(nextDir, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const nextPath = path.join(entry.parentPath, entry.name);
    try {
      const livePath = path.join(liveDir, path.relative(nextDir, nextPath));
      if (keepLiveMtime(livePath, nextPath)) kept += 1;
    } catch {
      failed += 1;
    }
  }
  console.log(`deploy-swap: kept the validators of ${kept} unchanged files`);
  if (failed > 0) {
    console.warn(`deploy-swap: could not compare or stamp ${failed} files`);
  }
}

/**
 * Atomically retargets the `dist` symlink to the freshly built directory, after
 * giving the files that did not change the modification time of the live build.
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
  const liveDir = target === "legacy-dir" ? DIST : target;
  if (liveDir && liveDir !== outDir) keepUnchangedValidators(liveDir, outDir);
  if (target === "legacy-dir") {
    // First run: migrate real dist/ out of the way, keep it as fallback color
    const active = COLORS.find((c) => path.join(BUILDS, c) !== outDir);
    const legacyDest = path.join(BUILDS, active);
    fs.rmSync(legacyDest, { recursive: true, force: true });
    fs.renameSync(DIST, legacyDest);
  }
  // Atomic retarget: create temp symlink, rename over dist. fs.renameSync
  // wraps rename(2) directly, with the same atomic, non-dereferencing semantics
  // as `mv -T` for a symlink-to-symlink swap, without spawning a subprocess.
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
