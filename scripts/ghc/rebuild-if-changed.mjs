/**
 * Daily scheduled rebuild of the site, ONLY when the contributions data the
 * pages display has changed (or the last build is older than a week).
 *
 * /projects/contributions/, the build-time blocks of /projects and the home
 * "upstream" line are rendered at BUILD time from
 * `src/data/ghc/projects-contributions.json`, which the pre-build step
 * (`scripts/ghc/build-data.mjs`) regenerates. Production only rebuilds when
 * someone runs `pnpm build`, and every build is a deploy (blue/green swap,
 * Cloudflare purge, IndexNow/Bing submission), so rebuilding blindly every
 * day is not free. This script, run by
 * `deploy/systemd/jmrp-contributions-rebuild.timer`:
 *
 * 1. Collects a fresh dataset into memory with the same `collectDataset`
 *    the build uses (env: `GHC_INFLUX_TOKEN`, `INFLUX_URL`,
 *    `GITLAB_COM_TOKEN_READ_ONLY`). If InfluxDB or GitLab.com fails it logs
 *    and exits 0 WITHOUT building: a build from the fixture would publish
 *    older data than what is live.
 * 2. Hashes its display projection (`rebuild-state.mjs` documents exactly
 *    which fields count) and compares it with the state file written after
 *    the live build (`GHC_REBUILD_STATE`, default
 *    `/var/lib/jmrp.io/ghc/rebuild-state.json`).
 * 3. Rebuilds when the hash differs, when no state exists, or when the
 *    recorded build is older than `GHC_REBUILD_MAX_AGE_DAYS` (default 7).
 * 4. Before building: skips if any `astro build` is already running, and
 *    takes an exclusive PID lock file (`GHC_REBUILD_LOCK`, default
 *    `/var/lib/jmrp.io/ghc/rebuild.lock`; a lock whose PID is dead is stale and is
 *    replaced) so two runs never overlap. Then runs `pnpm build` in
 *    `process.cwd()` with the inherited environment and exits with its code.
 *
 * Flags:
 * - `--dry-run`: print the decision and which projection sections changed,
 *   never build, never take the lock, never write state.
 * - `--record-state`: record the dataset file on disk as the live one (what
 *   `deploy-live.mjs` does after every deploy) and exit.
 *
 * @module
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { collectDataset } from "./build-data.mjs";
import { resolveInfluxConfig } from "./influx.mjs";
import { loadGitlabPart } from "./merge-gitlab.mjs";
import {
  decideRebuild,
  hashProjection,
  readState,
  recordBuiltDataset,
  resolveMaxAgeDays,
  resolveStatePath,
} from "./rebuild-state.mjs";

/** Default exclusive lock file for scheduled rebuilds: a root-owned
 * directory rather than the world-writable `/run/lock`. It survives a reboot,
 * which the stale-PID check handles. */
export const DEFAULT_LOCK_PATH = "/var/lib/jmrp.io/ghc/rebuild.lock";

/** Matches a running Astro build: `astro build`, `astro.js build`, or the
 * `sh -c "... astro build ..."` wrapper `pnpm build` runs. */
const ASTRO_BUILD_RE = /\bastro(?:\.m?js)?\s+build\b/;

const LOG_PREFIX = "contributions-rebuild:";

/**
 * Whether a process command line (NUL-separated, as in `/proc/<pid>/cmdline`)
 * is an Astro build.
 *
 * @param {string} cmdline - Raw command line.
 * @returns {boolean} True for an Astro build.
 */
export function isAstroBuildCmdline(cmdline) {
  return ASTRO_BUILD_RE.test(cmdline.replaceAll("\0", " "));
}

/**
 * PIDs of running Astro builds, read from `/proc`. Never throws: an
 * unreadable `/proc` entry (a process that just exited) is skipped.
 *
 * @param {object} [options] - Options.
 * @param {string} [options.procDir] - Where to look (tests).
 * @param {number} [options.selfPid] - PID to ignore.
 * @returns {number[]} Matching PIDs.
 */
export function findRunningAstroBuilds({
  procDir = "/proc",
  selfPid = process.pid,
} = {}) {
  let entries;
  try {
    entries = fs.readdirSync(procDir);
  } catch {
    return [];
  }
  const pids = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === selfPid) continue;
    try {
      const cmdline = fs.readFileSync(`${procDir}/${entry}/cmdline`, "utf8");
      if (isAstroBuildCmdline(cmdline)) pids.push(pid);
    } catch {
      // The process exited between readdir and read.
    }
  }
  return pids;
}

/**
 * Whether a PID is alive (signal 0; EPERM still means it exists).
 *
 * @param {number} pid - Process id.
 * @returns {boolean} True when the process exists.
 */
export function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === "EPERM";
  }
}

/**
 * Takes an exclusive lock by creating `lockPath` with `O_EXCL` and writing
 * the PID into it. A lock whose PID is no longer alive is stale: it is
 * removed and the creation retried once.
 *
 * @param {string} lockPath - Lock file.
 * @param {object} [options] - Options.
 * @param {number} [options.pid] - PID to record.
 * @param {(pid: number) => boolean} [options.isAlive] - Liveness probe.
 * @returns {boolean} True when the lock is now held by `pid`.
 */
export function acquireLock(
  lockPath,
  { pid = process.pid, isAlive = isProcessAlive } = {},
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, `${pid}\n`, { flag: "wx" });
      return true;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST") {
        throw error;
      }
    }
    let holder = NaN;
    try {
      holder = Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10);
    } catch {
      // Removed between the create and the read: retry.
    }
    if (Number.isSafeInteger(holder) && holder > 0 && isAlive(holder)) {
      return false;
    }
    fs.rmSync(lockPath, { force: true });
  }
  return false;
}

/**
 * Releases a lock this process holds (only if it still records `pid`).
 *
 * @param {string} lockPath - Lock file.
 * @param {number} [pid] - Owner PID.
 */
export function releaseLock(lockPath, pid = process.pid) {
  try {
    if (Number.parseInt(fs.readFileSync(lockPath, "utf8"), 10) === pid) {
      fs.rmSync(lockPath, { force: true });
    }
  } catch {
    // Already gone.
  }
}

/**
 * A GitLab loader that refuses the fixture fallback: the scheduled check
 * must never compare (or build) against fixture data.
 *
 * @param {Parameters<typeof loadGitlabPart>[0]} options - Loader options.
 * @returns {ReturnType<typeof loadGitlabPart>} The live GitLab part.
 */
async function loadGitlabStrict(options) {
  const result = await loadGitlabPart(options);
  if (result.fromFixture) {
    throw new Error("GitLab.com could not be collected");
  }
  return result;
}

/**
 * Formats a decision for the journal.
 *
 * @param {import('./rebuild-state.mjs').RebuildDecision} decision - Decision.
 * @param {number} maxAgeDays - Forced-rebuild age.
 * @returns {string} One line.
 */
export function describeDecision(decision, maxAgeDays) {
  const age =
    decision.ageDays === null
      ? "unknown age"
      : `last build ${decision.ageDays.toFixed(1)} day(s) ago`;
  switch (decision.reason) {
    case "no-state": {
      return "no rebuild state recorded: rebuild.";
    }
    case "changed": {
      const which =
        decision.changedSections.length > 0
          ? decision.changedSections.join(", ")
          : "unknown sections";
      return `displayed data changed (${which}; ${age}): rebuild.`;
    }
    case "stale": {
      return `displayed data unchanged but ${age} (max ${maxAgeDays}): rebuild.`;
    }
    default: {
      return `unchanged (${age}, max ${maxAgeDays}): nothing to do.`;
    }
  }
}

/**
 * Runs `pnpm build` in `cwd`, streaming its output, and returns its exit
 * code.
 *
 * @param {string} cwd - Repository root.
 * @returns {number} Exit code (1 when it could not start or was signalled).
 */
function runBuild(cwd) {
  const result = spawnSync("pnpm", ["build"], {
    cwd,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(`${LOG_PREFIX} could not start pnpm build: ${result.error}`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * Entry point.
 *
 * @param {string[]} argv - Command-line flags.
 * @returns {Promise<number>} Process exit code.
 */
async function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const root = process.cwd();
  const statePath = resolveStatePath();
  const maxAgeDays = resolveMaxAgeDays();

  if (argv.includes("--record-state")) {
    const state = recordBuiltDataset({ root, statePath });
    console.log(
      `${LOG_PREFIX} recorded ${state.projectionHash.slice(0, 12)} at ${statePath}.`,
    );
    return 0;
  }

  const lockPath = process.env.GHC_REBUILD_LOCK || DEFAULT_LOCK_PATH;
  if (!dryRun && !acquireLock(lockPath)) {
    console.log(`${LOG_PREFIX} another run holds ${lockPath}; skipping.`);
    return 0;
  }

  try {
    let dataset;
    try {
      dataset = await collectDataset(resolveInfluxConfig(), root, {
        warn: (line) => console.warn(`${LOG_PREFIX} ${line}`),
        loadGitlab: loadGitlabStrict,
      });
    } catch (error) {
      const message = (
        error instanceof Error ? error.message : String(error)
      ).replaceAll(/[\r\n\t]+/g, " ");
      console.log(
        `${LOG_PREFIX} could not collect a fresh dataset (${message}); not rebuilding.`,
      );
      return 0;
    }

    const current = hashProjection(dataset);
    const decision = decideRebuild({
      state: readState(statePath),
      current,
      maxAgeDays,
    });
    console.log(
      `${LOG_PREFIX} projection ${current.projectionHash.slice(0, 12)}; ${describeDecision(decision, maxAgeDays)}`,
    );

    const running = findRunningAstroBuilds();
    if (dryRun) {
      console.log(
        `${LOG_PREFIX} dry run: would ${decision.rebuild ? "" : "not "}rebuild` +
          ` (reason ${decision.reason}; state ${statePath}; running astro builds: ${running.length > 0 ? running.join(", ") : "none"}).`,
      );
      return 0;
    }
    if (!decision.rebuild) return 0;
    if (running.length > 0) {
      console.log(
        `${LOG_PREFIX} an astro build is already running (pid ${running.join(", ")}); skipping.`,
      );
      return 0;
    }

    console.log(`${LOG_PREFIX} running pnpm build in ${root}...`);
    const code = runBuild(root);
    if (code !== 0) {
      console.error(`${LOG_PREFIX} pnpm build failed with exit code ${code}.`);
      return code;
    }
    // deploy-live.mjs records the same thing after the swap; doing it here
    // too keeps the state right even if that step was skipped.
    try {
      recordBuiltDataset({ root, statePath });
    } catch (error) {
      console.warn(
        `${LOG_PREFIX} build succeeded but the state could not be written: ${String(error)}`,
      );
    }
    console.log(`${LOG_PREFIX} rebuild done.`);
    return 0;
  } finally {
    if (!dryRun) releaseLock(lockPath);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main(process.argv.slice(2)));
}
