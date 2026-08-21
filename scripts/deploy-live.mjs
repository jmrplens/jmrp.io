#!/usr/bin/env node
/**
 * Publish-after-swap deploy actions.
 *
 * Runs as a plain Node script, invoked by `pnpm build` AFTER
 * `deploy-swap.mjs swap` has retargeted the `dist` symlink to the freshly
 * built `builds/<color>` directory. Everything here is a **publish** action —
 * it makes the already-live content visible/known to the outside world:
 *
 * 1. Deploys `dist/security_headers.conf` + `security_headers_assets.conf`
 *    (generated during the Astro `astro:build:done` hook, see
 *    `src/integrations/post-build.ts`) to the system Nginx snippets path,
 *    tests the config, reloads Nginx, and clears the site's Nginx cache —
 *    rolling back the config on any failure.
 * 2. Purges the Cloudflare cache for the zone.
 * 3. Submits the sitemap URLs to IndexNow and to the Bing Webmaster API.
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
 * - Nginx deploy: skipped unless `POSTBUILD_NGINX_SNIPPETS_PATH` is set.
 * - Cloudflare purge: skipped unless `PRIVATE_CF_ZONE_ID` and
 *   `PRIVATE_CF_API_TOKEN` are set.
 * - IndexNow: skipped unless `POSTBUILD_INDEXNOW` is set.
 * - Bing Webmaster: skipped unless `BING_WEBMASTER_API_KEY` is set.
 *
 * Failure semantics:
 * - A failed Nginx config test, or a failed reload whose rollback ALSO
 *   fails, is fatal — this script exits with code 1 and the build fails.
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
 * resolves itself (`stat`, `sudo`) lives there. `nginx`, `find`, `chown`,
 * `mv`, `rm`, and `cp` are all invoked as *arguments to* `sudo`, so their
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
// Nginx deployment (config copy, test, reload, cache clear, rollback)
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
 * Safely removes a temporary file, swallowing any errors.
 *
 * @param {string} filePath - Path to the temporary file to remove.
 * @returns {void}
 */
function cleanupTempFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup - swallow errors
  }
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
 * Performs the file rollback for both main and assets config using sudo.
 * Uses cryptographically random temp filenames and secure spawn options.
 *
 * @param {string} systemNginxPath - Destination path for the headers snippet.
 * @param {Buffer} originalContent - Buffer of the original configuration content.
 * @param {{path: string, originalContent: Buffer | null, created: boolean} | undefined} assetsRollback - Optional asset rollback information.
 * @returns {void}
 */
function performRollback(systemNginxPath, originalContent, assetsRollback) {
  const secureOpts = createSecureSpawnOptions();

  // Use OS temp dir with cryptographically random suffix
  const tempPath = path.join(
    os.tmpdir(),
    `nginx-rollback-${crypto.randomUUID()}.bak`,
  );
  try {
    fs.writeFileSync(tempPath, originalContent);
  } catch (error) {
    throw new Error(
      `Rollback failed: Could not write backup file ${tempPath}. Error: ${String(error)}`,
    );
  }

  const mvResult = spawnSync(
    "sudo", // NOSONAR
    ["mv", tempPath, systemNginxPath],
    secureOpts,
  );
  if (mvResult.status !== 0 || mvResult.error) {
    // Clean up orphaned temp file before throwing
    cleanupTempFile(tempPath);
    throw new Error(
      `Rollback failed: Could not restore ${systemNginxPath}. Stderr: ${mvResult.stderr?.toString()}`,
    );
  }

  if (!assetsRollback) return;

  if (assetsRollback.created) {
    const rmResult = spawnSync(
      "sudo", // NOSONAR
      ["rm", "-f", assetsRollback.path],
      secureOpts,
    );
    if (rmResult.status !== 0 || rmResult.error) {
      throw new Error(
        `Rollback failed: Could not remove created assets file ${assetsRollback.path}. Stderr: ${rmResult.stderr?.toString()}`,
      );
    }
  } else if (assetsRollback.originalContent !== null) {
    const tempAssetsPath = path.join(
      os.tmpdir(),
      `nginx-assets-rollback-${crypto.randomUUID()}.bak`,
    );
    try {
      fs.writeFileSync(tempAssetsPath, assetsRollback.originalContent);
    } catch (error) {
      throw new Error(
        `Rollback failed: Could not write assets backup file ${tempAssetsPath}. Error: ${String(error)}`,
      );
    }
    const mvAssetsResult = spawnSync(
      "sudo", // NOSONAR
      ["mv", tempAssetsPath, assetsRollback.path],
      secureOpts,
    );
    if (mvAssetsResult.status !== 0 || mvAssetsResult.error) {
      // Clean up orphaned temp file before throwing
      cleanupTempFile(tempAssetsPath);
      throw new Error(
        `Rollback failed: Could not restore assets file ${assetsRollback.path}. Stderr: ${mvAssetsResult.stderr?.toString()}`,
      );
    }
  }
}

/**
 * Handles validation errors after deployment by reverting to the original content.
 *
 * @param {unknown} validationError - The caught validation error.
 * @param {string} systemNginxPath - Destination path for the headers snippet.
 * @param {Buffer} originalContent - Buffer of the original configuration content.
 * @param {number} timeout - Execution timeout for Nginx commands.
 * @param {{path: string, originalContent: Buffer | null, created: boolean} | undefined} assetsRollback - Optional asset rollback information.
 * @returns {void}
 */
function handleNginxValidationError(
  validationError,
  systemNginxPath,
  originalContent,
  timeout,
  assetsRollback,
) {
  console.error(
    "deploy-live: ⚠ Nginx validation failed! Reverting to previous configuration.",
  );
  const validationMessage =
    validationError instanceof Error
      ? (validationError.stack ?? validationError.message)
      : safeStringify(validationError);
  console.error(validationMessage);

  try {
    performRollback(systemNginxPath, originalContent, assetsRollback);
    console.log(
      "deploy-live: ✓ Successfully reverted to the previous stable configuration.",
    );

    // Final validation to ensure system is left in a stable state
    verifyRollbackState(createSecureExecOptions(timeout));
  } catch (revertError) {
    const revertErrorMessage =
      revertError instanceof Error ? revertError.message : String(revertError);
    console.error(
      "deploy-live: CRITICAL: Failed to revert Nginx configuration. Manual intervention required.",
    );
    console.warn(`deploy-live: revert failure details: ${revertErrorMessage}`);
    throw revertError instanceof Error
      ? revertError
      : new Error(revertErrorMessage);
  }

  // If revert was successful, re-throw the original error to inform the caller
  // that the new config was rejected.
  throw validationError instanceof Error
    ? validationError
    : new Error(validationMessage);
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
 * Performs the actual file copy and reload operations, rolling back to the
 * previous configuration (and re-throwing) if the test or reload fails.
 *
 * @param {string} systemNginxPath - Destination path for the headers snippet.
 * @param {string} generatedPath - Source path of the generated headers snippet.
 * @param {string} systemNginxAssetsPath - Destination path for the assets headers snippet.
 * @param {string} generatedAssetsPath - Source path of the generated assets headers snippet.
 * @returns {void}
 */
function performNginxDeployment(
  systemNginxPath,
  generatedPath,
  systemNginxAssetsPath,
  generatedAssetsPath,
) {
  let nginxTestTimeout = Number.parseInt(
    process.env.POSTBUILD_NGINX_TEST_TIMEOUT || "10000",
    10,
  );
  if (!Number.isFinite(nginxTestTimeout) || nginxTestTimeout <= 0) {
    nginxTestTimeout = 10_000;
  }

  let nginxReloadTimeout = Number.parseInt(
    process.env.POSTBUILD_NGINX_RELOAD_TIMEOUT || "30000",
    10,
  );
  if (!Number.isFinite(nginxReloadTimeout) || nginxReloadTimeout <= 0) {
    nginxReloadTimeout = 30_000;
  }

  // Safety: We will validate the configuration after deployment and revert if it fails.
  console.log("deploy-live: deploying security headers to system Nginx...");
  try {
    const originalContent = fs.readFileSync(systemNginxPath);
    let originalAssetsContent = null;
    let assetsCreated = false;
    const systemAssetsExists = fs.existsSync(systemNginxAssetsPath);

    if (systemAssetsExists) {
      originalAssetsContent = fs.readFileSync(systemNginxAssetsPath);
    }

    const secureOpts = createSecureSpawnOptions();

    // Use sudo to copy files since Nginx path usually requires root privileges
    const copyResult = spawnSync(
      "sudo", // NOSONAR
      ["cp", generatedPath, systemNginxPath],
      secureOpts,
    );
    if (copyResult.error || copyResult.status !== 0) {
      const errorMsg =
        copyResult.error?.message || `exit code ${copyResult.status}`;
      throw new Error(
        `Failed to copy ${generatedPath} to ${systemNginxPath}: ${errorMsg}`,
      );
    }

    if (fs.existsSync(generatedAssetsPath)) {
      if (!systemAssetsExists) {
        assetsCreated = true;
      }
      const copyAssetsResult = spawnSync(
        "sudo", // NOSONAR
        ["cp", generatedAssetsPath, systemNginxAssetsPath],
        secureOpts,
      );
      if (copyAssetsResult.error || copyAssetsResult.status !== 0) {
        const errorMsg =
          copyAssetsResult.error?.message ||
          `exit code ${copyAssetsResult.status}`;
        throw new Error(
          `Failed to copy ${generatedAssetsPath} to ${systemNginxAssetsPath}: ${errorMsg}`,
        );
      }
    }

    try {
      const systemNginxCachePath =
        process.env.POSTBUILD_NGINX_CACHE_PATH || "/var/cache/nginx";

      executeNginxReload(
        nginxTestTimeout,
        nginxReloadTimeout,
        systemNginxCachePath,
      );

      console.log(
        "deploy-live: ✓ Nginx security headers deployed and reloaded.",
      );
    } catch (error) {
      handleNginxValidationError(
        error,
        systemNginxPath,
        originalContent,
        nginxTestTimeout,
        {
          path: systemNginxAssetsPath,
          originalContent: originalAssetsContent,
          created: assetsCreated,
        },
      );
    }
  } catch (error) {
    console.error(
      "deploy-live: ⚠ Deployment failed. Check Nginx permissions or environment state.",
    );
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Deploys the generated security headers to the system Nginx directory.
 *
 * @param {string} distDir - Production build output directory (the swapped `dist/`).
 * @param {string} systemNginxPath - Destination path for the headers snippet.
 * @returns {void}
 */
function deploySecurityHeaders(distDir, systemNginxPath) {
  const generatedPath = path.join(distDir, "security_headers.conf");
  const generatedAssetsPath = path.join(
    distDir,
    "security_headers_assets.conf",
  );
  const systemNginxAssetsPath = path.join(
    path.dirname(systemNginxPath),
    "security_headers_assets.conf",
  );

  const systemNginxExists = fs.existsSync(systemNginxPath);
  const generatedExists = fs.existsSync(generatedPath);

  if (!systemNginxExists) {
    console.log(
      `deploy-live: skipping deployment: system Nginx path does not exist [${path.basename(systemNginxPath)}]`,
    );
  }
  if (!generatedExists) {
    console.log(
      `deploy-live: skipping deployment: generated security headers not found [${path.basename(generatedPath)}]`,
    );
  }

  if (!systemNginxExists || !generatedExists) {
    return;
  }

  validateNginxPath(systemNginxAssetsPath);
  if (path.resolve(systemNginxPath) === path.resolve(systemNginxAssetsPath)) {
    throw new Error(
      "Main Nginx path and assets path resolve to the same file.",
    );
  }

  performNginxDeployment(
    systemNginxPath,
    generatedPath,
    systemNginxAssetsPath,
    generatedAssetsPath,
  );
}

/**
 * Deploys security headers to the system Nginx (test → reload → cache
 * clear, with rollback on failure), gated on `POSTBUILD_NGINX_SNIPPETS_PATH`.
 * Any failure here is fatal — it propagates to the caller.
 *
 * @returns {void}
 */
function runNginxDeployment() {
  const systemNginxPath = process.env.POSTBUILD_NGINX_SNIPPETS_PATH || "";
  if (!systemNginxPath) {
    console.log(
      "deploy-live: skipping Nginx deployment (POSTBUILD_NGINX_SNIPPETS_PATH not set).",
    );
    return;
  }

  validateNginxPath(systemNginxPath);
  deploySecurityHeaders(DIST_DIR, systemNginxPath);
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
 * then deploys Nginx (fatal on failure), then runs the publish
 * notifications (never fatal).
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
      `deploy-live: Nginx deployment step finished in ${elapsed(nginxStartedAt)}.`,
    );
  } catch (error) {
    console.error("deploy-live: FATAL: Nginx deployment failed.");
    console.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    process.exit(1);
  }

  await runPublishNotifications();

  console.log(`deploy-live: done in ${elapsed(startedAt)}.`);
}

await main();
