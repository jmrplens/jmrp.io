#!/usr/bin/env node
/**
 * Publish-after-swap deploy actions.
 *
 * Runs as a plain Node script, invoked by `pnpm build` AFTER
 * `deploy-swap.mjs swap` has retargeted the `dist` symlink to the freshly
 * built `builds/<color>` directory. Everything here is a **publish** action —
 * it makes the already-live content visible/known to the outside world:
 *
 * 1. Delivers the Nginx artifacts the build staged in
 *    `/var/lib/jmrp.io/nginx-staged/` — outside the repo and outside `dist/`
 *    (generated during the Astro `astro:build:done` hook, see
 *    `src/integrations/post-build.ts`): the two security-header snippets and
 *    the four http-level redirect/alternate maps. They are MOVED — not
 *    copied — into `$POSTBUILD_NGINX_SNIPPETS_DIR`, map snippets this build
 *    did not produce are pruned, then the config is tested, Nginx reloaded
 *    and its cache cleared — rolling the whole delivery back on any failure.
 * 2. Purges the Cloudflare cache for the zone.
 * 3. Submits the sitemap URLs to IndexNow and to the Bing Webmaster API.
 *
 * Why a move and not a copy: generated configuration used to be written into
 * the repository working tree (the four maps) and into the served build
 * output (the two header snippets), which meant the same content existed in
 * three places that could disagree — and `nginx` read two of them straight
 * out of a git checkout, so a `git checkout` could change the live config.
 * Now the build produces each artifact exactly once, in a staging directory
 * that is neither tracked nor served, and this script relocates it. A
 * successful deploy therefore leaves the staging directory empty, which is
 * the observable proof that nothing was left behind.
 *
 * This logic used to run *inside* the Astro build hook, before the swap —
 * meaning the new headers/CDN purge/reindex signals could go out while the
 * live `dist/` symlink still pointed at the OLD content. Moving it here,
 * after the swap, closes that window.
 *
 * Production-root guard:
 * - This repo is checked out in multiple worktrees (e.g. the production
 *   tree at `/var/www/jmrp.io` and any staging worktree) that share the
 *   same Nginx snippets path and Cloudflare zone. Every action below is a
 *   PRODUCTION side effect, so the entire script exits immediately (before
 *   any work, including sitemap collection) unless `process.cwd()` matches
 *   `PRODUCTION_ROOT` (default `/var/www/jmrp.io`, overridable via
 *   `DEPLOY_LIVE_PRODUCTION_ROOT`) or `DEPLOY_LIVE_FORCE=1` is set.
 *
 * Gating (identical to the previous in-hook behavior). Every variable below is
 * read from `process.env` AFTER the project's `.env` has been merged into it
 * (see the `loadEnvFile` call at the top) — an exported value, empty string
 * included, still wins over `.env`:
 * - Nginx delivery: skipped unless `POSTBUILD_NGINX_SNIPPETS_DIR` is set.
 *   (`POSTBUILD_NGINX_SNIPPETS_PATH`, the retired single-file variable, is
 *   ignored — see {@link runNginxDeployment} for why it is not removed.)
 * - Cloudflare purge: skipped unless `PRIVATE_CF_ZONE_ID` and
 *   `PRIVATE_CF_API_TOKEN` are set.
 * - IndexNow: skipped unless `POSTBUILD_INDEXNOW` is set.
 * - Bing Webmaster: skipped unless `BING_WEBMASTER_API_KEY` is set.
 *
 * Failure semantics:
 * - A missing delivery manifest, a failed move, a failed Nginx config test,
 *   or a failed reload whose rollback ALSO fails, is fatal — this script
 *   exits with code 1 and the build fails. It does NOT fail silently: the
 *   only case that prints "skipping" is an unset gating variable.
 * - Cloudflare/IndexNow/Bing failures (network blips, API errors) are
 *   logged as warnings and never fail the build — a broken CDN purge or
 *   search-engine ping is not worth blocking a deploy over.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

import { stagingCandidates } from "./nginx-staging.mjs";

/**
 * Load the project's `.env` into `process.env`.
 *
 * Unlike the post-build hook, this script is a SEPARATE Node process spawned
 * by `pnpm build` after `astro build` has exited, so it never inherited the
 * `.env` that Astro/Vite loads for the build. The result was silent: from the
 * 2026-07-05 refactor that moved publish actions out of the build hook until
 * 2026-08-21, every deploy logged "skipping Nginx deployment
 * (POSTBUILD_NGINX_SNIPPETS_PATH not set)" even though `.env` defined it —
 * so the freshly generated `security_headers*.conf` were never copied to
 * Nginx. The Cloudflare purge kept working only by luck, because those
 * variables happen to be exported in the shell profile too.
 *
 * `loadEnvFile` does NOT overwrite variables already present in the
 * environment, which is exactly the precedence we want: `.env` supplies the
 * defaults, and exporting a variable (including as an EMPTY string) still
 * overrides it — that is how a worktree opts out of touching Nginx.
 *
 * Resolved relative to this file, not `cwd`, so the script behaves the same
 * however it is invoked. A missing `.env` is normal (CI, fresh clone) and
 * must not be fatal: every action below is independently gated on its own
 * variable being set.
 */
try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch (error) {
  // A MISSING .env is normal (CI, a fresh clone) and every action below is
  // gated on its own variable anyway, so that case stays silent. Anything else
  // — unreadable file, malformed syntax — must not be: it would strip the
  // variables just as effectively as not loading them at all, sending us back
  // to the exact silent failure this call exists to fix.
  if (error?.code !== "ENOENT") {
    console.warn(
      `deploy-live: could not read .env (${error?.message ?? String(error)}); ` +
        "continuing with the ambient environment only — publish actions whose " +
        "variables live only in .env will be skipped.",
    );
  }
}

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, "dist");

/**
 * Directory the build stages its generated Nginx artifacts in, resolved
 * exactly as `src/integrations/post-build.ts` resolves it.
 *
 * It sits OUTSIDE `dist/` for two reasons: generated config must never be
 * part of the served tree, and `fixPermissions()` runs `chown -R www-data`
 * over `dist/` — `rename(2)` carries the SOURCE inode's owner, so a staged
 * file caught by that would land in `/etc/nginx/` owned by `www-data`. It must also share a filesystem with the destination, which is
 * what makes the delivery a true move rather than a copy.
 */
const STAGING_DIR =
  stagingCandidates().find((dir) => fs.existsSync(dir)) ??
  stagingCandidates()[0];

/** Delivery contract written LAST by the post-build hook. */
const MANIFEST_BASENAME = "manifest.json";

/** Subdirectory holding the http-level maps, included by wildcard. */
const MAPS_SUBDIR = "maps";

/**
 * Banner prefix each generator writes into the file it produces. The value
 * after it is one stamp per build, which is how `nginx -T` can be asked which
 * build the RUNNING configuration was loaded from.
 */
const BUILD_STAMP_PREFIX = "# Build-Stamp: ";

/**
 * Shape a manifest entry must have: `<name>.conf`, or one `maps/` level deep.
 * The manifest is a file this script reads and then acts on inside `/etc`, so
 * its paths are treated as untrusted input — no absolute paths, no traversal,
 * no other extension.
 */
const ARTIFACT_RELATIVE_PATTERN = /^(?:maps\/)?[\w.-]+\.conf$/;

/**
 * Filesystem root of the production checkout that is allowed to run publish
 * actions (Nginx snippet deploy + reload, Cloudflare purge, IndexNow, Bing).
 * Overridable via `DEPLOY_LIVE_PRODUCTION_ROOT` for exceptional cases (e.g.
 * relocating the production checkout) — normally left at its default.
 */
const PRODUCTION_ROOT =
  process.env.DEPLOY_LIVE_PRODUCTION_ROOT || "/var/www/jmrp.io";

/**
 * Guards against running publish actions (Nginx deploy/reload, Cloudflare
 * purge, IndexNow, Bing) from a non-production checkout. This repo lives in
 * multiple worktrees (e.g. a staging worktree serving a preview domain)
 * that share the same Nginx snippets and Cloudflare zone as production — a
 * `pnpm build` run from a worktree must never purge production's CDN cache
 * or reload production's Nginx config. Set `DEPLOY_LIVE_FORCE=1` to bypass
 * (e.g. for intentional production-root maintenance from a script/CI runner
 * that legitimately runs outside `PRODUCTION_ROOT`).
 *
 * @returns {boolean} `true` if publish actions should proceed, `false` if
 *   the caller must skip everything and exit cleanly.
 */
function isProductionDeployAllowed() {
  if (process.env.DEPLOY_LIVE_FORCE === "1") return true;
  return ROOT === PRODUCTION_ROOT;
}

/**
 * Default secure PATH for executing system commands (Sonar S4036: a spawned
 * command's PATH must resolve only through directories that are not
 * writable by non-root users).
 *
 * Deliberately narrowed to `/usr/bin:/bin` — every command this script
 * resolves itself (`stat`, `sudo`) lives there. `nginx`, `find`, `install`,
 * `chown`, `chmod`, `mv`, and `rm` are all invoked as *arguments to* `sudo`, so their
 * lookup is governed by `sudoers`' own `secure_path`
 * (`/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin` here),
 * not by this env var — this PATH never needs to include `/usr/sbin` or the
 * `/usr/local/*` directories for those to keep working.
 */
const DEFAULT_SECURE_PATH = "/usr/bin:/bin";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** IndexNow verification key — must match the filename of `public/<key>.txt`. */
const INDEXNOW_KEY = "e0f36bbff68da9f8d629749b848ed7c8";
const INDEXNOW_MAX_URLS = 10_000; // IndexNow per-request limit.

const BING_ENDPOINT =
  "https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch";

/**
 * Formats an elapsed duration (in milliseconds) for log output.
 *
 * @param {number} startedAt - `performance.now()` timestamp taken before the work started.
 * @returns {string} Human-readable duration, e.g. "142ms".
 */
function elapsed(startedAt) {
  return `${Math.round(performance.now() - startedAt)}ms`;
}

/**
 * Safely serializes an unknown value to a string.
 * Handles strings directly, uses JSON.stringify with a try/catch fallback
 * to prevent crashes on circular references, BigInt, or throwing toJSON.
 *
 * @param {unknown} value - The value to stringify.
 * @returns {string} A best-effort string representation.
 */
function safeStringify(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// ---------------------------------------------------------------------------
// Nginx artifact delivery (staged → moved → tested → reloaded, with rollback)
// ---------------------------------------------------------------------------

/**
 * Validates the Nginx snippet path to prevent arbitrary writes.
 *
 * @param {string} systemNginxPath - The absolute path to validate.
 * @returns {void}
 */
function validateNginxPath(systemNginxPath) {
  // Normalize path to handle ".." segments
  const normalizedPath = path.normalize(systemNginxPath);

  // Safety check for Nginx path to prevent arbitrary file overwrites
  if (
    !path.isAbsolute(normalizedPath) ||
    !normalizedPath.endsWith(".conf") ||
    normalizedPath.includes("..")
  ) {
    const sanitizedPath = path.basename(normalizedPath);
    throw new Error(
      `Invalid Nginx configuration path: ${sanitizedPath}. Must be an absolute path ending in .conf.`,
    );
  }

  // Reject symlinks to avoid redirection risks
  if (
    fs.existsSync(normalizedPath) &&
    fs.lstatSync(normalizedPath).isSymbolicLink()
  ) {
    throw new Error(
      `Nginx configuration path cannot be a symbolic link: ${path.basename(normalizedPath)}`,
    );
  }
}

/**
 * Validates the DIRECTORY the generated artifacts are delivered into.
 *
 * {@link validateNginxPath} cannot be reused for it: that one requires the
 * path to end in `.conf`, so it rejects a directory outright. The properties
 * that matter are the same — absolute, no `..` traversal, never a symlink
 * (which would silently redirect the whole delivery elsewhere) — plus "if it
 * exists at all, it is a directory".
 *
 * @param {string} dirPath - The absolute directory path to validate.
 * @returns {string} The normalized directory path.
 */
function validateNginxDir(dirPath) {
  const normalized = path.normalize(dirPath);
  if (!path.isAbsolute(normalized) || normalized.includes("..")) {
    throw new Error(
      `Invalid Nginx snippets directory: ${normalized}. Must be an absolute path with no ".." segments.`,
    );
  }
  if (fs.existsSync(normalized)) {
    const stats = fs.lstatSync(normalized);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Nginx snippets directory cannot be a symbolic link: ${normalized}`,
      );
    }
    if (!stats.isDirectory()) {
      throw new Error(
        `Nginx snippets path exists but is not a directory: ${normalized}`,
      );
    }
  }
  return normalized;
}

/**
 * Reads a positive-integer timeout from the environment.
 *
 * @param {string} name - Environment variable to read.
 * @param {number} fallbackMs - Value used when unset or unusable.
 * @returns {number} The timeout in milliseconds.
 */
function readTimeout(name, fallbackMs) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

/**
 * Creates secure execution options with a sanitized PATH.
 *
 * @param {number} timeout - Execution timeout in milliseconds.
 * @returns {{stdio: "inherit", timeout: number, env: NodeJS.ProcessEnv}} Safe spawn options.
 */
function createSecureExecOptions(timeout) {
  // Use a sanitized environment to avoid PATH injection: we replace PATH
  // with a secure default, ignoring whatever the caller's shell exported.
  // prettier-ignore
  const secureEnv = {
    ...process.env,
    PATH: DEFAULT_SECURE_PATH, // NOSONAR
  };

  return {
    stdio: "inherit",
    timeout,
    env: secureEnv,
  };
}

/**
 * Creates secure spawn options without a timeout, for simple operations.
 * Uses sanitized PATH to mitigate PATH injection risks.
 *
 * @returns {{stdio: "inherit", env: NodeJS.ProcessEnv}} Safe spawn options.
 */
function createSecureSpawnOptions() {
  return {
    stdio: "inherit",
    env: {
      ...process.env,
      PATH: DEFAULT_SECURE_PATH,
    },
  };
}

/**
 * Runs one privileged filesystem operation through `sudo`, throwing a message
 * that names what was being attempted.
 *
 * Every privileged operation in this script goes through `sudo` rather than
 * bare `fs` calls, deliberately: `fs.chownSync` throws `EPERM` for a
 * non-root invoker, which is not the `EACCES` a permission fallback would
 * catch. Builds run as root today, so this only matters if the deploy user
 * ever changes — but the property is cheap to keep.
 *
 * @param {string[]} args - Arguments passed to `sudo` (the command first).
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @param {string} description - What the command is doing, for the error message.
 * @returns {void}
 */
function runPrivileged(args, secureOpts, description) {
  const result = spawnSync("sudo", args, secureOpts); // NOSONAR
  if (result.error || result.status !== 0) {
    const detail = result.error?.message || `exit code ${result.status}`;
    throw new Error(`Failed to ${description}: ${detail}`);
  }
}

/**
 * Returns the owning username of a filesystem path via `stat`, or `null` if
 * it cannot be determined (missing path, unsupported platform, etc.).
 *
 * @param {string} targetPath - Path to inspect.
 * @returns {string | null} The owning username, or `null` on failure.
 */
function getOwnerUsername(targetPath) {
  const result = spawnSync(
    "stat", // NOSONAR
    ["-c", "%U", targetPath],
    { encoding: "utf8", env: { ...process.env, PATH: DEFAULT_SECURE_PATH } },
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Removes a file, swallowing any error.
 *
 * Used for best-effort cleanup — an orphaned rollback temp file, and the
 * consumed manifest — where failing to delete must never become the reason a
 * deploy reports failure.
 *
 * @param {string} filePath - Path to remove.
 * @returns {void}
 */
function removeFileQuietly(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup - swallow errors
  }
}

/**
 * Picks a scratch directory on the SAME filesystem as `targetDir`.
 *
 * `mv` is `rename(2)` — atomic, and a true move — only within one filesystem.
 * Across devices it degrades to copy+unlink, which leaves a window where the
 * destination is truncated. `/var/tmp` shares a device with `/etc` on this
 * host while `/tmp` is a separate filesystem, so the check is made rather than
 * assumed: a wrong guess would silently cost atomicity on the rollback path,
 * which is the one path that must not make things worse.
 *
 * @param {string} targetDir - Directory the temp file will be moved into.
 * @returns {string} A writable scratch directory.
 */
function pickTempDirFor(targetDir) {
  try {
    if (fs.statSync("/var/tmp").dev === fs.statSync(targetDir).dev) {
      return "/var/tmp";
    }
  } catch {
    // Fall through to the OS default below.
  }
  return os.tmpdir();
}

/**
 * Safely clears the Nginx cache directory by removing its contents.
 * Only `chown`s the cache directory when it is not already owned by
 * `www-data`, avoiding a redundant recursive chown on every deploy.
 *
 * @param {string} systemNginxCachePath - The path to the Nginx cache directory.
 * @returns {void}
 */
function clearNginxCache(systemNginxCachePath) {
  // Validate path to prevent accidental deletion of important directories
  if (
    !path.isAbsolute(systemNginxCachePath) ||
    systemNginxCachePath === path.parse(systemNginxCachePath).root
  ) {
    console.warn(
      `deploy-live: refusing to clear unsafe cache path: ${systemNginxCachePath}`,
    );
    return;
  }
  if (!fs.existsSync(systemNginxCachePath)) return;

  // Security: Prevent TOCTOU race conditions with symbolic links
  if (fs.lstatSync(systemNginxCachePath).isSymbolicLink()) {
    console.warn(
      `deploy-live: refusing to clear cache path as it is a symbolic link: ${systemNginxCachePath}`,
    );
    return;
  }

  // Optimize: Only clear the 'jmrp_cache' dedicated to jmrp.io
  // instead of wiping the entire nginx cache.
  const targetCachePath = path.join(systemNginxCachePath, "jmrp_cache");

  if (fs.existsSync(targetCachePath)) {
    // Security: Prevent TOCTOU race by checking if targetCachePath is a symlink
    if (fs.lstatSync(targetCachePath).isSymbolicLink()) {
      console.warn(
        `deploy-live: refusing to clear cache path as it is a symbolic link: ${targetCachePath}`,
      );
      return;
    }
    console.log(
      `deploy-live: clearing specific Nginx cache: [${targetCachePath}]...`,
    );

    const secureOpts = createSecureSpawnOptions();

    // We use -mindepth 1 to delete everything INSIDE jmrp_cache, but keep the folder itself
    const clearResult = spawnSync(
      "sudo", // NOSONAR
      ["find", targetCachePath, "-mindepth", "1", "-delete"],
      secureOpts,
    );

    if (clearResult.error || clearResult.status !== 0) {
      const errorMsg =
        clearResult.error?.message || `exit code ${clearResult.status}`;
      console.warn(
        `deploy-live: failed to clear Nginx cache at ${targetCachePath}: ${errorMsg}`,
      );
    }
  } else {
    console.log(
      `deploy-live: cache folder ${targetCachePath} not found, skipping clear.`,
    );
  }

  // Only force ownership when it isn't already www-data — avoids an O(n)
  // recursive chown of the whole cache directory on every single build.
  const owner = getOwnerUsername(systemNginxCachePath);
  if (owner === "www-data") {
    return;
  }

  console.log(
    `deploy-live: ensuring ownership of cache path: ${systemNginxCachePath}`,
  );
  const chownResult = spawnSync(
    "sudo", // NOSONAR
    ["chown", "-R", "www-data:www-data", systemNginxCachePath],
    createSecureSpawnOptions(),
  );
  if (chownResult.error || chownResult.status !== 0) {
    const errorMsg =
      chownResult.error?.message || `exit code ${chownResult.status}`;
    console.warn(
      `deploy-live: failed to set ownership on cache path: ${errorMsg}`,
    );
  }
}

/**
 * Verifies that Nginx is in a stable state after a rollback.
 * Uses the same `sudo nginx -t` invocation as the pre-deploy test, so a
 * post-rollback check can never fail merely because it lacked the
 * privileges the rest of the flow relies on.
 *
 * @param {{stdio: "inherit", timeout: number, env: NodeJS.ProcessEnv}} execOptions - Secure spawn options.
 * @returns {void}
 */
function verifyRollbackState(execOptions) {
  const nginxConfigPath = process.env.POSTBUILD_NGINX_CONFIG_PATH;
  const finalTestArgs = nginxConfigPath
    ? ["-t", "-c", nginxConfigPath]
    : ["-t"];

  const finalTestResult = spawnSync(
    "sudo", // NOSONAR suppressed: external command usage is intentional
    ["nginx", ...finalTestArgs],
    execOptions,
  );
  if (finalTestResult.error) {
    throw finalTestResult.error;
  }
  if (finalTestResult.status !== 0) {
    throw new Error("Nginx final validation test failed.");
  }
}

/**
 * Executes the Nginx test and reload commands safely.
 *
 * @param {number} testTimeout - Timeout for the configuration test command.
 * @param {number} reloadTimeout - Timeout for the reload command.
 * @param {string} systemNginxCachePath - Path to the Nginx cache directory to clear.
 * @returns {void}
 */
function executeNginxReload(testTimeout, reloadTimeout, systemNginxCachePath) {
  const execOptions = createSecureExecOptions(testTimeout);

  // Allow optional custom nginx config path via environment variable
  const nginxConfigPath = process.env.POSTBUILD_NGINX_CONFIG_PATH;
  if (nginxConfigPath) {
    validateNginxPath(nginxConfigPath);
  }
  const testArgs = nginxConfigPath ? ["-t", "-c", nginxConfigPath] : ["-t"];

  const testResult = spawnSync("sudo", ["nginx", ...testArgs], execOptions); // NOSONAR suppressed: external command usage is intentional
  if (testResult.error) {
    throw testResult.error;
  }
  if (testResult.status !== 0) {
    throw new Error("Nginx configuration test failed.");
  }

  // prettier-ignore
  const reloadResult = spawnSync("sudo", ["nginx", "-s", "reload"], { // NOSONAR suppressed: external command usage is intentional
    ...execOptions,
    timeout: reloadTimeout,
  });
  if (reloadResult.error) {
    throw reloadResult.error;
  }
  if (reloadResult.status !== 0) {
    throw new Error("Nginx reload command failed.");
  }

  // Clear Nginx cache only AFTER a successful reload to prevent race conditions
  clearNginxCache(systemNginxCachePath);
}

/**
 * Reads and validates the delivery manifest the post-build hook writes LAST,
 * after every generator has run.
 *
 * The manifest — not a glob — is the delivery contract. Globbing the staging
 * directory would happily pick up a `*.conf.tmp-<rand>` orphan from a killed
 * build and install it as live config; and a build that dies partway leaves
 * no manifest at all, which is exactly the state this function must refuse to
 * deploy from.
 *
 * Shape, as written by `writeNginxManifest()` in
 * `src/integrations/post-build.ts`:
 * `{ "stamp": "<id>", "generatedAt": "<ISO 8601>", "files": ["security_headers.conf", "maps/…", …] }`.
 * `generatedAt` is informational. `buildStamp` is accepted as an alias for
 * `stamp` so renaming it on the generator side cannot silently cost the stamp
 * check; `files` has no alias — a manifest without it is refused, with the
 * keys it did have named in the error. There is no alias for the file list:
 * `artifacts` is NOT read, so a generator that renamed it would fail loudly
 * here rather than deliver a partial set.
 *
 * @param {string} stagingDir - The staging directory the build wrote into.
 * @returns {{stamp: string, files: string[], manifestPath: string}} The parsed manifest.
 */
function readDeliveryManifest(stagingDir) {
  const manifestPath = path.join(stagingDir, MANIFEST_BASENAME);
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `No delivery manifest at ${manifestPath}. The post-build hook writes it last, ` +
          "so its absence means this build produced no Nginx artifacts — or a previous " +
          "deploy already consumed them. Run a build before deploying.",
      );
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Delivery manifest ${manifestPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const files = parsed?.files;
  const stamp = parsed?.buildStamp ?? parsed?.stamp;
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(
      `Delivery manifest ${manifestPath} lists no files (keys: ${Object.keys(parsed ?? {}).join(", ") || "none"}).`,
    );
  }
  if (typeof stamp !== "string" || stamp.length === 0) {
    console.warn(
      `deploy-live: ⚠ delivery manifest ${manifestPath} carries no build stamp; ` +
        "the `nginx -T` stamp check cannot confirm which build the live config came from.",
    );
  }

  return { stamp: typeof stamp === "string" ? stamp : "", files, manifestPath };
}

/**
 * Turns the manifest's relative paths into validated source/destination
 * pairs, failing before ANY file moves if a single one is unusable.
 *
 * Every entry is checked against {@link ARTIFACT_RELATIVE_PATTERN} — a
 * manifest is a file this script reads and then writes into `/etc`, so a path
 * in it is treated as untrusted input: at most one `maps/` level, no
 * traversal, `.conf` only. Each destination additionally goes through
 * {@link validateNginxPath}.
 *
 * @param {string} stagingDir - Directory the build staged artifacts in.
 * @param {string} snippetsDir - Directory the artifacts are delivered to.
 * @param {string[]} files - Relative paths from the manifest.
 * @returns {{relative: string, src: string, dst: string}[]} The delivery plan.
 */
function planDelivery(stagingDir, snippetsDir, files) {
  /** @type {Set<string>} */
  const seen = new Set();
  return files.map((relative) => {
    if (
      typeof relative !== "string" ||
      !ARTIFACT_RELATIVE_PATTERN.test(relative)
    ) {
      throw new Error(
        `Delivery manifest lists an unusable path: ${safeStringify(relative)}. ` +
          "Expected `<name>.conf` or `maps/<name>.conf`.",
      );
    }
    if (seen.has(relative)) {
      throw new Error(`Delivery manifest lists ${relative} more than once.`);
    }
    seen.add(relative);

    const src = path.join(stagingDir, relative);
    const dst = path.join(snippetsDir, relative);
    if (!fs.existsSync(src)) {
      throw new Error(
        `Delivery manifest lists ${relative}, but ${src} does not exist. ` +
          "The build did not finish, or a previous deploy already moved it.",
      );
    }
    validateNginxPath(dst);
    return { relative, src, dst };
  });
}

/**
 * Reads every staged artifact into memory before the first move.
 *
 * The bytes are needed twice: to check the build stamp, and — if the reload
 * is rejected — to park the rejected content, which after a `rename(2)` only
 * exists at the destination we are about to overwrite again.
 *
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @returns {Map<string, Buffer>} Relative path → staged content.
 */
function readStagedContents(entries) {
  return new Map(
    entries.map((entry) => [entry.relative, fs.readFileSync(entry.src)]),
  );
}

/**
 * Warns when a staged artifact does not carry this build's stamp banner.
 *
 * Not fatal: a missing banner is a generator bug, not a broken config, and
 * refusing to deliver would leave the previous build's headers and redirect
 * maps live for the content that was just published. It IS worth saying
 * loudly, because the operator's post-deploy check counts those banners in
 * `nginx -T` and would otherwise just see the wrong number.
 *
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @param {Map<string, Buffer>} contents - Relative path → staged content.
 * @param {string} stamp - This build's stamp.
 * @returns {void}
 */
function warnAboutMissingStamp(entries, contents, stamp) {
  if (!stamp) return;
  const marker = `${BUILD_STAMP_PREFIX}${stamp}`;
  const missing = entries
    .filter((entry) => !contents.get(entry.relative)?.includes(marker))
    .map((entry) => entry.relative);
  if (missing.length === 0) return;
  console.warn(
    `deploy-live: ⚠ ${missing.length} staged artifact(s) carry no "${marker}" line ` +
      `(${missing.join(", ")}); they are delivered anyway, but the nginx -T stamp count ` +
      `will be ${entries.length - missing.length}, not ${entries.length}.`,
  );
}

/**
 * Creates the destination directory and any `maps/` subdirectory the manifest
 * needs, owned root:root and mode 0755.
 *
 * Done before the first move rather than assumed: the delivery must work on a
 * machine where `/etc/nginx/snippets/jmrp/` has never existed, and it runs
 * AFTER the blue/green swap, so an `ENOENT` here is a fatal deploy over
 * already-live content.
 *
 * @param {string} snippetsDir - Destination directory.
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @returns {void}
 */
function ensureSnippetDirectories(snippetsDir, entries, secureOpts) {
  const dirs = new Set([snippetsDir]);
  for (const entry of entries) dirs.add(path.dirname(entry.dst));
  // Shortest first, so a parent is always created before its child. (GNU
  // `install -d` creates missing components itself, applying the same mode
  // and owner to each, so this only keeps the log in a sensible order.)
  for (const dir of [...dirs].sort((a, b) => a.length - b.length)) {
    runPrivileged(
      ["install", "-d", "-o", "root", "-g", "root", "-m", "0755", dir],
      secureOpts,
      `create ${dir}`,
    );
  }
}

/**
 * Lists delivered `maps/*.conf` files that this build did NOT produce.
 *
 * Mandatory rather than tidy-up: the vhost includes `maps/*.conf` by
 * wildcard, so a file left behind by a generator that no longer exists — a
 * renamed artifact, a removed feature — stays loaded by Nginx forever, with
 * nothing in the repo to explain it. Only `maps/` is pruned: the two header
 * snippets at the top level are named by exact includes, so an orphan there
 * is inert, and removing unknown files from a directory an operator may have
 * populated by hand during a rollback would be the more dangerous behavior.
 *
 * @param {string} snippetsDir - Destination directory.
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @returns {string[]} Absolute paths of orphaned map snippets.
 */
function findOrphanMapArtifacts(snippetsDir, entries) {
  const mapsDir = path.join(snippetsDir, MAPS_SUBDIR);
  if (!fs.existsSync(mapsDir)) return [];
  const delivered = new Set(entries.map((entry) => path.resolve(entry.dst)));
  return fs
    .readdirSync(mapsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".conf"))
    .map((dirent) => path.join(mapsDir, dirent.name))
    .filter((candidate) => !delivered.has(path.resolve(candidate)));
}

/**
 * Reads a destination file so it can be restored if the delivery is rejected.
 *
 * @param {string} dstPath - Absolute destination path.
 * @returns {Buffer | null} Its current content, or `null` if it does not exist.
 */
function snapshotDestination(dstPath) {
  try {
    return fs.readFileSync(dstPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * Moves one staged artifact into place.
 *
 * `rename(2)` carries the SOURCE inode's owner and mode, so both are set on
 * the source immediately before the move — fixing them afterwards would leave
 * a window where the live file is wrong. `mv` within one filesystem IS
 * `rename(2)`: atomic, and a true move, so nothing is left behind in staging.
 *
 * @param {{relative: string, src: string, dst: string}} entry - One delivery-plan entry.
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @returns {void}
 */
function moveStagedArtifact(entry, secureOpts) {
  runPrivileged(
    ["chown", "root:root", entry.src],
    secureOpts,
    `set ownership on staged ${entry.relative}`,
  );
  runPrivileged(
    ["chmod", "644", entry.src],
    secureOpts,
    `set mode on staged ${entry.relative}`,
  );
  runPrivileged(
    ["mv", entry.src, entry.dst],
    secureOpts,
    `move ${entry.relative} to ${entry.dst}`,
  );
}

/**
 * Reports `mode owner:group` for a set of paths, or `null` if `stat` fails.
 *
 * @param {string[]} paths - Absolute paths to inspect.
 * @returns {string[] | null} One `644 root:root`-shaped line per path.
 */
function statOwnership(paths) {
  const result = spawnSync(
    "stat", // NOSONAR
    ["-c", "%a %U:%G", ...paths],
    { encoding: "utf8", env: { ...process.env, PATH: DEFAULT_SECURE_PATH } },
  );
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split("\n");
}

/**
 * Verifies the delivered files ended up 0644 root:root, correcting them once
 * and warning if that does not take.
 *
 * They should be right by construction (the source has its owner and mode set
 * before the move), so this is an assertion, not the mechanism. Deliberately
 * NOT fatal: for an *included* `.conf` the mode is hygiene, not uptime — only
 * the root master process parses config, and workers never re-read it — so
 * rolling a good CSP back over a wrong group bit would trade a real
 * regression for a cosmetic one.
 *
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @returns {void}
 */
function assertDeliveredOwnership(entries, secureOpts) {
  const paths = entries.map((entry) => entry.dst);
  const observed = statOwnership(paths);
  if (observed?.length !== paths.length) {
    console.warn(
      "deploy-live: ⚠ could not stat the delivered artifacts to confirm 0644 root:root.",
    );
    return;
  }

  const wrong = paths.filter((_, index) => observed[index] !== "644 root:root");
  if (wrong.length === 0) return;

  console.warn(
    `deploy-live: ⚠ ${wrong.length} delivered artifact(s) are not 0644 root:root; correcting.`,
  );
  for (const wrongPath of wrong) {
    try {
      runPrivileged(
        ["chown", "root:root", wrongPath],
        secureOpts,
        `chown ${wrongPath}`,
      );
      runPrivileged(
        ["chmod", "644", wrongPath],
        secureOpts,
        `chmod ${wrongPath}`,
      );
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }

  const recheck = statOwnership(wrong);
  const stillWrong = wrong.filter(
    (_, index) => recheck?.[index] !== "644 root:root",
  );
  if (stillWrong.length > 0) {
    console.warn(
      `deploy-live: ⚠ still not 0644 root:root after correction: ${stillWrong.join(", ")}.`,
    );
  }
}

/**
 * Copies the rejected content somewhere an operator can inspect it.
 *
 * Parked OUTSIDE the staging directory on purpose: the next build clears
 * staging, which would destroy the evidence, and the "staging is empty after
 * a deploy" check has to stay meaningful.
 *
 * @param {{relative: string, src: string, dst: string}[]} entries - The delivery plan.
 * @param {Map<string, Buffer>} contents - Relative path → rejected content.
 * @param {string} manifestPath - Manifest to park alongside it.
 * @returns {string | null} The park directory, or `null` if it could not be written.
 */
function parkRejectedDelivery(entries, contents, manifestPath) {
  const suffix = new Date().toISOString().replaceAll(/[:.]/g, "-");
  const parkDir = path.join("/var/tmp", `jmrp-nginx-rejected-${suffix}`);
  try {
    fs.mkdirSync(parkDir, { recursive: true, mode: 0o700 });
    for (const entry of entries) {
      const target = path.join(parkDir, entry.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, contents.get(entry.relative) ?? Buffer.alloc(0));
    }
    if (fs.existsSync(manifestPath)) {
      fs.copyFileSync(manifestPath, path.join(parkDir, MANIFEST_BASENAME));
    }
    console.log(`deploy-live: rejected content parked in ${parkDir}.`);
    return parkDir;
  } catch (error) {
    console.warn(
      `deploy-live: ⚠ could not park the rejected content in ${parkDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Restores one destination to its pre-delivery state.
 *
 * @param {string} dstPath - Absolute destination path.
 * @param {Buffer | null} originalContent - Its previous content, or `null` if it did not exist.
 * @param {string} tempDir - Scratch directory on the destination's filesystem.
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @returns {void}
 */
function restoreDestination(dstPath, originalContent, tempDir, secureOpts) {
  if (originalContent === null) {
    // It did not exist before this delivery, so "restoring" it means removing
    // it — leaving it would make a rolled-back deploy look successful.
    runPrivileged(
      ["rm", "-f", dstPath],
      secureOpts,
      `remove ${dstPath}, which this delivery created`,
    );
    return;
  }

  const tempPath = path.join(
    tempDir,
    `nginx-rollback-${crypto.randomUUID()}.bak`,
  );
  try {
    fs.writeFileSync(tempPath, originalContent);
  } catch (error) {
    throw new Error(
      `Rollback failed: could not write backup file ${tempPath}. Error: ${String(error)}`,
    );
  }

  try {
    runPrivileged(
      ["chown", "root:root", tempPath],
      secureOpts,
      `chown ${tempPath}`,
    );
    runPrivileged(["chmod", "644", tempPath], secureOpts, `chmod ${tempPath}`);
    runPrivileged(["mv", tempPath, dstPath], secureOpts, `restore ${dstPath}`);
  } catch (error) {
    removeFileQuietly(tempPath);
    throw error;
  }
}

/**
 * Restores every destination this delivery touched — the moved artifacts AND
 * the pruned orphans — then proves Nginx is left in a testable state.
 *
 * @param {Map<string, Buffer | null>} snapshot - Destination → pre-delivery content (`null` = absent).
 * @param {string} tempDir - Scratch directory on the destination's filesystem.
 * @param {{stdio: "inherit", env: NodeJS.ProcessEnv}} secureOpts - Spawn options.
 * @param {number} testTimeout - Timeout for the confirming `nginx -t`.
 * @returns {void}
 */
function rollbackDelivery(snapshot, tempDir, secureOpts, testTimeout) {
  for (const [dstPath, originalContent] of snapshot) {
    restoreDestination(dstPath, originalContent, tempDir, secureOpts);
  }
  console.log(
    `deploy-live: ✓ restored ${snapshot.size} file(s) to the previous stable configuration.`,
  );
  verifyRollbackState(createSecureExecOptions(testTimeout));
}

/**
 * Handles a failed delivery: parks the rejected content, restores every
 * destination, confirms Nginx still tests clean, and re-throws.
 *
 * Always throws — either the original error (the delivery was rejected but
 * the box is back on its previous configuration) or the rollback's own error
 * (the box needs a human).
 *
 * @param {unknown} deliveryError - The error that aborted the delivery.
 * @param {{snapshot: Map<string, Buffer | null>, entries: {relative: string, src: string, dst: string}[], contents: Map<string, Buffer>, manifestPath: string, tempDir: string, secureOpts: {stdio: "inherit", env: NodeJS.ProcessEnv}, testTimeout: number}} context - Everything needed to undo the delivery.
 * @returns {never}
 */
function handleDeliveryFailure(deliveryError, context) {
  console.error(
    "deploy-live: ⚠ Nginx delivery failed! Reverting to the previous configuration.",
  );
  console.error(
    deliveryError instanceof Error
      ? (deliveryError.stack ?? deliveryError.message)
      : safeStringify(deliveryError),
  );

  parkRejectedDelivery(context.entries, context.contents, context.manifestPath);
  // The manifest describes a delivery that has now been undone, and its
  // sources are gone from staging. Leaving it would make the next deploy fail
  // with "staged artifact missing" instead of the accurate "no manifest — run
  // a build"; a copy is already in the park directory.
  removeFileQuietly(context.manifestPath);

  try {
    rollbackDelivery(
      context.snapshot,
      context.tempDir,
      context.secureOpts,
      context.testTimeout,
    );
  } catch (revertError) {
    console.error(
      "deploy-live: CRITICAL: Failed to revert Nginx configuration. Manual intervention required.",
    );
    console.warn(
      `deploy-live: revert failure details: ${revertError instanceof Error ? revertError.message : String(revertError)}`,
    );
    throw revertError instanceof Error
      ? revertError
      : new Error(String(revertError));
  }

  throw deliveryError instanceof Error
    ? deliveryError
    : new Error(safeStringify(deliveryError));
}

/**
 * Empties the staging directory once the delivery has been accepted.
 *
 * `rename(2)` already took the artifacts themselves; what is left is the
 * manifest and the now-empty `maps/` directory. Removing those is what makes
 * "the staging directory is empty" a usable proof that the build MOVED its
 * output instead of copying it. Anything else still in there is reported, not deleted — it
 * is either a generator writing files no manifest claims, or a temp file from
 * a killed build, and both are worth seeing.
 *
 * @param {string} stagingDir - The staging directory.
 * @returns {void}
 */
function clearStagingAfterDelivery(stagingDir) {
  try {
    fs.rmSync(path.join(stagingDir, MANIFEST_BASENAME), { force: true });

    /** @type {string[]} */
    const leftovers = [];
    for (const dirent of fs.readdirSync(stagingDir, { withFileTypes: true })) {
      if (!dirent.isDirectory()) {
        leftovers.push(dirent.name);
        continue;
      }
      try {
        fs.rmdirSync(path.join(stagingDir, dirent.name));
      } catch {
        leftovers.push(`${dirent.name}/`);
      }
    }

    if (leftovers.length > 0) {
      console.warn(
        `deploy-live: ⚠ ${stagingDir} is not empty after the delivery: ${leftovers.join(", ")}. ` +
          "Nothing outside the manifest is ever delivered, so these were not published.",
      );
    }
  } catch (error) {
    console.warn(
      `deploy-live: ⚠ could not tidy the staging directory ${stagingDir}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Warns if generated Nginx config is still sitting in the served build output.
 *
 * Nothing includes it there any more, and the vhost 404s the path, but a
 * `.conf` under `dist/` means a generator is still writing into the served
 * tree — the defect this whole delivery path exists to remove.
 *
 * @param {string} distDir - The swapped `dist/` directory.
 * @returns {void}
 */
function warnAboutServedArtifacts(distDir) {
  const strays = [
    "security_headers.conf",
    "security_headers_assets.conf",
  ].filter((name) => fs.existsSync(path.join(distDir, name)));
  if (strays.length === 0) return;
  console.warn(
    `deploy-live: ⚠ generated Nginx config is still present in the served tree (${distDir}): ${strays.join(", ")}. ` +
      "It is not what Nginx loads, but it must not be published — check the post-build generators.",
  );
}

/**
 * Delivers this build's staged Nginx artifacts: moves each one into the
 * snippets directory, prunes map snippets the build did not produce, tests
 * the configuration, reloads Nginx and clears its cache — rolling the whole
 * delivery back if any of that fails.
 *
 * @param {string} stagingDir - Directory the build staged artifacts in.
 * @param {string} snippetsDir - Directory Nginx includes them from.
 * @returns {void}
 */
function deployNginxSnippets(stagingDir, snippetsDir) {
  const { stamp, files, manifestPath } = readDeliveryManifest(stagingDir);
  const entries = planDelivery(stagingDir, snippetsDir, files);
  const contents = readStagedContents(entries);
  warnAboutMissingStamp(entries, contents, stamp);

  const secureOpts = createSecureSpawnOptions();
  ensureSnippetDirectories(snippetsDir, entries, secureOpts);

  const orphans = findOrphanMapArtifacts(snippetsDir, entries);

  // Snapshot BEFORE anything moves, and cover every destination this delivery
  // can touch: the artifacts AND the orphans it is about to prune. Restoring
  // only some of them would leave a rolled-back box in a state that never
  // existed.
  /** @type {Map<string, Buffer | null>} */
  const snapshot = new Map();
  for (const entry of entries)
    snapshot.set(entry.dst, snapshotDestination(entry.dst));
  for (const orphan of orphans)
    snapshot.set(orphan, snapshotDestination(orphan));

  const testTimeout = readTimeout("POSTBUILD_NGINX_TEST_TIMEOUT", 10_000);
  const reloadTimeout = readTimeout("POSTBUILD_NGINX_RELOAD_TIMEOUT", 30_000);
  const tempDir = pickTempDirFor(snippetsDir);

  // Built outside the message: a nested template literal inside `${...}` is
  // unreadable at a glance and Sonar rejects it (S4624).
  const stampNote = stamp ? ` (stamp ${stamp})` : "";
  console.log(
    `deploy-live: delivering ${entries.length} Nginx artifact(s)${stampNote} to ${snippetsDir}...`,
  );

  try {
    for (const entry of entries) {
      moveStagedArtifact(entry, secureOpts);
      console.log(`deploy-live:   moved ${entry.relative}`);
    }
    for (const orphan of orphans) {
      runPrivileged(["rm", "-f", orphan], secureOpts, `prune ${orphan}`);
      console.log(
        `deploy-live:   pruned ${path.relative(snippetsDir, orphan)} (not in this build's manifest)`,
      );
    }
    assertDeliveredOwnership(entries, secureOpts);
    executeNginxReload(
      testTimeout,
      reloadTimeout,
      process.env.POSTBUILD_NGINX_CACHE_PATH || "/var/cache/nginx",
    );
  } catch (error) {
    // Always throws: either the original failure, or the rollback's own.
    handleDeliveryFailure(error, {
      snapshot,
      entries,
      contents,
      manifestPath,
      tempDir,
      secureOpts,
      testTimeout,
    });
  }

  clearStagingAfterDelivery(stagingDir);
  warnAboutServedArtifacts(DIST_DIR);
  const prunedNote = orphans.length > 0 ? `, ${orphans.length} pruned` : "";
  console.log(
    `deploy-live: ✓ ${entries.length} artifact(s) moved into ${snippetsDir}` +
      `${prunedNote}; Nginx tested and reloaded.`,
  );
}

/**
 * Delivers the generated Nginx artifacts (see {@link deployNginxSnippets}),
 * gated on `POSTBUILD_NGINX_SNIPPETS_DIR`. Any failure here is fatal — it
 * propagates to the caller.
 *
 * `POSTBUILD_NGINX_SNIPPETS_PATH` — the retired single-file variable this
 * replaced — is deliberately ignored rather than removed from `.env`: that
 * file is git-ignored, so a `git revert` of this change restores the old code
 * WITHOUT restoring its variable, and the old code's missing-variable branch
 * was silent. Keeping the key means a revert still works unattended; a
 * deployment configured with only the old key is told, loudly, that it is
 * doing nothing.
 *
 * @returns {void}
 */
function runNginxDeployment() {
  const snippetsDir = process.env.POSTBUILD_NGINX_SNIPPETS_DIR || "";
  if (!snippetsDir) {
    console.log(
      "deploy-live: skipping Nginx delivery (POSTBUILD_NGINX_SNIPPETS_DIR not set).",
    );
    if (process.env.POSTBUILD_NGINX_SNIPPETS_PATH) {
      console.warn(
        "deploy-live: ⚠ POSTBUILD_NGINX_SNIPPETS_PATH is set but retired — this build " +
          "delivered NOTHING to Nginx. Set POSTBUILD_NGINX_SNIPPETS_DIR to the snippets " +
          "directory (e.g. /etc/nginx/snippets/jmrp).",
      );
    }
    return;
  }

  deployNginxSnippets(STAGING_DIR, validateNginxDir(snippetsDir));
}

// ---------------------------------------------------------------------------
// Cloudflare cache purge
// ---------------------------------------------------------------------------

/**
 * Purges the entire cache for the configured Cloudflare zone.
 * Skipped when the required credentials are absent. Never throws — network
 * or API errors are logged and swallowed, since a failed CDN purge must not
 * fail the deploy.
 *
 * @returns {Promise<void>} Resolves when the operation is complete (success, skipped, or failed).
 */
async function purgeCloudflareCache() {
  const token = process.env.PRIVATE_CF_API_TOKEN;
  const email = process.env.PRIVATE_CF_EMAIL;
  const zoneId = process.env.PRIVATE_CF_ZONE_ID;

  // Determine authentication method:
  // - API Token: token only (no email) - recommended by Cloudflare
  // - Global API Key: token + email (legacy but still supported)
  const useApiToken = Boolean(token && !email);
  const useGlobalKey = Boolean(token && email);

  if (!zoneId || !(useApiToken || useGlobalKey)) {
    console.log(
      "deploy-live: skipping Cloudflare cache purge (missing PRIVATE_CF_ZONE_ID and/or PRIVATE_CF_API_TOKEN).",
    );
    return;
  }

  console.log(
    `deploy-live: purging Cloudflare cache (Purge Everything) using ${useGlobalKey ? "Global API Key" : "API Token"}...`,
  );

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    if (useGlobalKey && email && token) {
      headers["X-Auth-Email"] = email;
      headers["X-Auth-Key"] = token;
    } else if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Use AbortController for timeout to prevent infinite hang
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000); // 15 seconds

    let response;
    try {
      response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
        {
          method: "POST",
          headers,
          // Using purge_everything for consistency in personal portfolio updates.
          // For larger sites, consider selective purging by URL or Cache-Tag.
          body: JSON.stringify({ purge_everything: true }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Cloudflare API responded with ${response.status}: ${errorText}`,
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(
        `Cloudflare reported failure: ${JSON.stringify(data.errors)}`,
      );
    }

    console.log("deploy-live: ✓ Cloudflare cache purged successfully.");
  } catch (error) {
    console.error("deploy-live: ⚠ Failed to purge Cloudflare cache.");
    console.error(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Sitemap URL collection (shared by IndexNow + Bing Webmaster)
// ---------------------------------------------------------------------------

/**
 * Extracts `<loc>` URLs from a sitemap XML string.
 *
 * @param {string} xml - Raw sitemap XML content.
 * @returns {string[]} The extracted URLs, in document order.
 */
function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

/**
 * Collects `loc → lastmod` for every URL in the generated sitemaps.
 * Resolves the sitemap index to its child sitemaps, then de-duplicates.
 * Computed once and shared by both IndexNow and Bing Webmaster submitters.
 *
 * `lastmod` is the empty string when a URL carries none, which is a valid
 * sitemap and simply means "no change signal available" — such URLs are then
 * treated as always-changed by {@link selectChangedUrls}, which is the safe
 * direction.
 *
 * @param {string} distDir - The build output directory containing the sitemaps.
 * @returns {{entries: Map<string, string>, complete: boolean}} De-duplicated
 *   loc → lastmod, plus whether every sitemap listed in the index was read.
 */
function collectSitemapEntries(distDir) {
  /** @type {Map<string, string>} */
  const entries = new Map();
  const indexPath = path.join(distDir, "sitemap-index.xml");
  // `complete` is what makes the caller able to fail closed. A partial read is
  // worse than an empty one: it yields a positive total, so the URLs from the
  // missing child look like "unchanged" and — once the ledger is written from
  // that truncated map — they are never announced again.
  if (!fs.existsSync(indexPath)) {
    console.warn(`deploy-live: no sitemap-index.xml under ${distDir}.`);
    return { entries, complete: false };
  }

  let complete = true;
  const childSitemaps = extractLocs(fs.readFileSync(indexPath, "utf8"));
  for (const sitemapUrl of childSitemaps) {
    const fileName = path.basename(new URL(sitemapUrl).pathname);
    const childPath = path.join(distDir, fileName);
    if (!fs.existsSync(childPath)) {
      console.warn(
        `deploy-live: sitemap-index.xml lists ${fileName}, but it is missing from ${distDir}.`,
      );
      complete = false;
      continue;
    }
    const xml = fs.readFileSync(childPath, "utf8");
    for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(block[1])?.[1]?.trim();
      if (!loc) continue;
      const lastmod =
        /<lastmod>([^<]+)<\/lastmod>/.exec(block[1])?.[1]?.trim() ?? "";
      entries.set(loc, lastmod);
    }
  }
  return { entries, complete };
}

/**
 * Path of the ledger recording what was last announced to the search APIs.
 *
 * Lives in `.cache/` (git-ignored, survives builds, wiped by a cache clear —
 * at which point the next deploy re-announces everything, which is harmless).
 */
const SUBMISSION_LEDGER = path.join(
  ROOT,
  ".cache",
  "url-submission-ledger.json",
);

/**
 * Narrows a full URL list down to the ones that actually changed since the
 * previous deploy.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * Every deploy used to announce all 122 URLs to IndexNow and Bing regardless
 * of whether anything had changed. Bing's URL Submission API is quota-limited,
 * and IndexNow's documentation is explicit that repeatedly submitting URLs
 * that have not changed reduces the trust a search engine places in the
 * source. The site was spending a finite budget to say "nothing happened".
 *
 * The ledger stores the `loc → lastmod` map that was last announced. A URL is
 * resubmitted when it is new, when its `lastmod` moved, or when it has no
 * `lastmod` at all. On the very first run — no ledger — everything is
 * submitted, which is the correct bootstrap.
 *
 * @param {Map<string, string>} current - loc → lastmod from this build.
 * @returns {{changed: string[], total: number, isBootstrap: boolean}}
 */
function selectChangedUrls(current) {
  /** @type {Record<string, string>} */
  let previous = {};
  let isBootstrap = true;
  try {
    previous = JSON.parse(fs.readFileSync(SUBMISSION_LEDGER, "utf8"));
    isBootstrap = false;
  } catch {
    // No ledger yet (first deploy, or the cache was cleared): announce all.
  }

  const changed = isBootstrap
    ? [...current.keys()]
    : [...current.entries()]
        .filter(([loc, lastmod]) => !lastmod || previous[loc] !== lastmod)
        .map(([loc]) => loc);

  return { changed, total: current.size, isBootstrap };
}

/**
 * Records the announced state so the next deploy can diff against it.
 *
 * Written only after the submitters have run, and never fatal: a failed write
 * just means the next deploy re-announces, which costs quota but is correct.
 *
 * @param {Map<string, string>} current - loc → lastmod from this build.
 * @returns {void}
 */
function writeSubmissionLedger(current) {
  try {
    fs.mkdirSync(path.dirname(SUBMISSION_LEDGER), { recursive: true });
    fs.writeFileSync(
      SUBMISSION_LEDGER,
      `${JSON.stringify(Object.fromEntries(current), null, 2)}\n`,
    );
  } catch (error) {
    console.warn(
      "deploy-live: could not write the URL submission ledger; the next deploy will resubmit everything.",
    );
    console.warn(error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// IndexNow submission
// ---------------------------------------------------------------------------

/**
 * Submits the site's URLs to IndexNow (Bing, Yandex, Seznam, Naver…) so new
 * and updated pages are picked up immediately instead of waiting for a
 * crawl. Gated behind `POSTBUILD_INDEXNOW` so local/CI builds never ping
 * the API. Never throws — failures are logged as warnings.
 *
 * @param {string[]} urlList - Pre-collected sitemap URLs (see {@link collectSitemapEntries}).
 * @returns {Promise<void>}
 */
async function submitToIndexNow(urlList) {
  if (!process.env.POSTBUILD_INDEXNOW) {
    console.log(
      "deploy-live: skipping IndexNow submission (POSTBUILD_INDEXNOW not set).",
    );
    // Disabled is not failed: a skipped submitter must not block the ledger.
    return true;
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL || "https://jmrp.io").replace(
    /\/$/,
    "",
  );
  const host = new URL(siteUrl).host;
  const keyLocation = `${siteUrl}/${INDEXNOW_KEY}.txt`;

  const submittedUrls = urlList.slice(0, INDEXNOW_MAX_URLS);
  if (submittedUrls.length === 0) {
    // `urlList` is the DIFF against the ledger, not the sitemap. Empty almost
    // always means "nothing changed since the last deploy", which is the whole
    // point of the differential submission — not a missing or empty sitemap.
    // The previous wording said "no sitemap URLs found" and sent a reader off
    // debugging sitemap generation that was working fine. The line above
    // already reports the real counts ("N of M URL(s) changed").
    console.log(
      "deploy-live: IndexNow: nothing changed since the last deploy, skipping submission.",
    );
    return true;
  }

  console.log(
    `deploy-live: submitting ${submittedUrls.length} URLs to IndexNow (${host})...`,
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response;
    try {
      response = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation,
          urlList: submittedUrls,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // IndexNow returns 200 (accepted) or 202 (accepted, pending validation).
    if (response.ok || response.status === 202) {
      console.log(
        `deploy-live: ✓ IndexNow accepted ${submittedUrls.length} URLs.`,
      );
      // Truncation counts as a failure so the untransmitted tail is retried.
      return submittedUrls.length === urlList.length;
    }
    console.warn(
      `deploy-live: ⚠ IndexNow responded with ${response.status}: ${await response.text()}`,
    );
    return false;
  } catch (error) {
    // Non-fatal: IndexNow failure must never break a deploy.
    console.warn("deploy-live: ⚠ Failed to submit to IndexNow.");
    console.warn(error instanceof Error ? error.message : String(error));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bing Webmaster submission
// ---------------------------------------------------------------------------

/**
 * Submits the site's URLs to the Bing Webmaster "SubmitUrlbatch" API using a
 * Webmaster API key. Complementary to IndexNow; uses the site's own Bing
 * Webmaster quota. Gated behind `BING_WEBMASTER_API_KEY`. Never throws —
 * failures are logged as warnings.
 *
 * @param {string[]} urlList - Pre-collected sitemap URLs (see {@link collectSitemapEntries}).
 * @returns {Promise<void>}
 */
async function submitToBingWebmaster(urlList) {
  const apiKey = process.env.BING_WEBMASTER_API_KEY;
  if (!apiKey) {
    console.log(
      "deploy-live: skipping Bing Webmaster submission (BING_WEBMASTER_API_KEY not set).",
    );
    // Disabled or nothing to send is not a failure.
    return true;
  }

  const siteUrl = (process.env.PUBLIC_SITE_URL || "https://jmrp.io").replace(
    /\/$/,
    "",
  );
  if (urlList.length === 0) {
    // Same as IndexNow above: this is the ledger diff, not the sitemap.
    console.log(
      "deploy-live: Bing Webmaster: nothing changed since the last deploy, skipping submission.",
    );
    // Disabled or nothing to send is not a failure.
    return true;
  }

  console.log(
    `deploy-live: submitting ${urlList.length} URLs to Bing Webmaster...`,
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    let response;
    try {
      response = await fetch(
        `${BING_ENDPOINT}?apikey=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            Accept: "application/json",
          },
          body: JSON.stringify({ siteUrl, urlList }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.ok) {
      console.log(
        `deploy-live: ✓ Bing Webmaster accepted ${urlList.length} URLs.`,
      );
      return true;
    }
    console.warn(
      `deploy-live: ⚠ Bing Webmaster responded with ${response.status}: ${await response.text()}`,
    );
    return false;
  } catch (error) {
    // Non-fatal: a Bing submission failure must never break a deploy.
    console.warn("deploy-live: ⚠ Failed to submit to Bing Webmaster.");
    console.warn(error instanceof Error ? error.message : String(error));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/**
 * Runs a publish step, logging its duration regardless of outcome.
 * Rejections are swallowed here (each step already logs its own failure
 * internally) so a single settled entry never aborts the others.
 *
 * The step's own return value is passed through: the submitters report whether
 * they actually reached the API, and the caller needs that to decide whether
 * the submission ledger may be updated. This helper used to discard it, which
 * silently defeated that check — `undefined` is not `false`, so every failed
 * submission still looked successful.
 *
 * @template T
 * @param {string} label - Human-readable step name for logging.
 * @param {() => Promise<T>} fn - The async publish step to run.
 * @returns {Promise<T | undefined>} The step's result, or undefined if it threw.
 */
async function timed(label, fn) {
  const startedAt = performance.now();
  try {
    return await fn();
  } catch (error) {
    console.warn(`deploy-live: ${label} threw unexpectedly.`);
    console.warn(error instanceof Error ? error.message : String(error));
  } finally {
    console.log(`deploy-live: ${label} finished in ${elapsed(startedAt)}.`);
  }
}

/**
 * Purges Cloudflare and notifies IndexNow/Bing Webmaster in parallel,
 * sharing a single sitemap URL collection pass. Never throws — every step
 * (including the sitemap collection itself) is individually non-fatal, so a
 * malformed `<loc>` or a sitemap read error can never take down the whole
 * process after the swap/reload have already happened.
 *
 * @returns {Promise<void>}
 */
/**
 * Reads the built sitemaps and works out which URLs still need announcing.
 *
 * Extracted from `runPublishNotifications` so that function stays under the
 * cognitive-complexity budget: the branching here is all about *diagnosing*
 * the sitemap, which is a separate concern from orchestrating the publish
 * steps.
 *
 * @returns {{urlList: string[], sitemapEntries: Map<string, string>, sitemapComplete: boolean}}
 *   The URLs to announce, the full loc → lastmod map, and whether every
 *   sitemap listed in the index was read (only then may the ledger be written).
 */
function resolveUrlsToAnnounce() {
  const startedAt = performance.now();
  try {
    const { entries, complete } = collectSitemapEntries(DIST_DIR);
    const { changed, total, isBootstrap } = selectChangedUrls(entries);

    if (!complete) {
      // Fail closed. A partial read still produces a positive total, so
      // submitting from it would announce a truncated set — and writing the
      // ledger from it would mark the URLs we never read as "already
      // announced", leaving them unannounced on every future deploy.
      console.warn(
        "deploy-live: sitemap collection was incomplete; skipping submissions and leaving the ledger untouched.",
      );
      return { urlList: [], sitemapEntries: entries, sitemapComplete: false };
    }

    if (total === 0) {
      // An empty list normally means "nothing changed", and the submitters say
      // exactly that. It would be the wrong story if the sitemap itself came
      // back empty, so diagnose that case separately.
      console.warn(
        `deploy-live: no URLs in the sitemaps under ${DIST_DIR} — check sitemap-index.xml and its children.`,
      );
    } else if (isBootstrap) {
      console.log(
        `deploy-live: no submission ledger yet — announcing all ${total} URL(s) in ${elapsed(startedAt)}.`,
      );
    } else {
      console.log(
        `deploy-live: ${changed.length} of ${total} URL(s) changed since the last deploy (${elapsed(startedAt)}); the rest are not resubmitted.`,
      );
    }

    return { urlList: changed, sitemapEntries: entries, sitemapComplete: true };
  } catch (error) {
    console.warn(
      "deploy-live: failed to collect sitemap URLs; continuing with an empty list.",
    );
    console.warn(error instanceof Error ? error.message : String(error));
    return { urlList: [], sitemapEntries: new Map(), sitemapComplete: false };
  }
}

async function runPublishNotifications() {
  // Skip reading/logging the sitemap entirely when neither URL-list consumer
  // is configured (e.g. local/CI builds) — nothing would use it. Cloudflare
  // is deliberately excluded here: purgeCloudflareCache() always purges the
  // whole zone (purge_everything) and never reads urlList, so it has no
  // dependency on the sitemap collection below.
  const needsSitemap =
    Boolean(process.env.POSTBUILD_INDEXNOW) ||
    Boolean(process.env.BING_WEBMASTER_API_KEY);

  const { urlList, sitemapEntries, sitemapComplete } = needsSitemap
    ? resolveUrlsToAnnounce()
    : { urlList: [], sitemapEntries: new Map(), sitemapComplete: true };

  const [, indexNow, bing] = await Promise.allSettled([
    timed("Cloudflare cache purge", () => purgeCloudflareCache()),
    timed("IndexNow submission", () => submitToIndexNow(urlList)),
    timed("Bing Webmaster submission", () => submitToBingWebmaster(urlList)),
  ]);

  // The ledger records what the search APIs have been TOLD, so it must only be
  // written when they were actually told. Both submitters swallow their errors
  // to keep a deploy from failing over a search-engine ping, which means
  // allSettled reports "fulfilled" even for an HTTP 500 or a timeout — so they
  // now return an explicit outcome and it is checked here. Writing the ledger
  // regardless would mark a failed URL as announced and never retry it.
  // Strictly `=== true`: a step that threw comes back as undefined from
  // `timed()`, and treating anything-but-false as success is exactly the bug
  // this check was written to prevent. A disabled submitter returns true
  // explicitly — skipped is not failed.
  const announced = (result) =>
    result.status === "fulfilled" && result.value === true;
  const allAnnounced = announced(indexNow) && announced(bing);

  if (sitemapEntries.size === 0) return;
  if (!sitemapComplete) return;
  if (allAnnounced) {
    writeSubmissionLedger(sitemapEntries);
  } else {
    console.warn(
      "deploy-live: a submitter failed; leaving the ledger untouched so the affected URLs are retried on the next deploy.",
    );
  }
}

/**
 * Entry point: exits immediately (no publish actions run) unless the
 * current checkout is the production root (see {@link isProductionDeployAllowed}),
 * then delivers the staged Nginx artifacts (fatal on failure), then runs the
 * publish notifications (never fatal).
 *
 * @returns {Promise<void>}
 */
async function main() {
  if (!isProductionDeployAllowed()) {
    console.log(
      `deploy-live: skipping — non-production worktree detected (cwd=${ROOT}, expected ${PRODUCTION_ROOT}); set DEPLOY_LIVE_FORCE=1 to override.`,
    );
    return;
  }

  const startedAt = performance.now();
  console.log(
    `deploy-live: publishing from [${path.relative(ROOT, DIST_DIR) || "dist"}]...`,
  );

  try {
    const nginxStartedAt = performance.now();
    runNginxDeployment();
    console.log(
      `deploy-live: Nginx delivery step finished in ${elapsed(nginxStartedAt)}.`,
    );
  } catch (error) {
    console.error("deploy-live: FATAL: Nginx delivery failed.");
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  }

  await runPublishNotifications();

  console.log(`deploy-live: done in ${elapsed(startedAt)}.`);
}

await main();
