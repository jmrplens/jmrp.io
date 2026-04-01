/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 */

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration, AstroIntegrationLogger } from "astro";

import { purgeCloudflareCache } from "./post-build/cloudflare.js";
import { compressAssets } from "./post-build/compression.js";
import { finalizeCspConfig } from "./post-build/csp.js";
import { extractCssDataUris } from "./post-build/css.js";
import { processHtmlFiles } from "./post-build/html.js";
import { optimizeImages } from "./post-build/images.js";
import type { CspData } from "./post-build/types.js";

/**
 * Default secure PATH for executing system commands.
 * Prioritizes standard system directories to mitigate PATH injection risks.
 */
const DEFAULT_SECURE_PATH =
  "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin";

/**
 * Creates the jmrp-post-build Astro integration.
 *
 * This integration performs several critical optimizations and security hardening
 * tasks after the site has been built:
 * - HTML transformation (SRI, Nonces, style-to-class conversion).
 * - CSS optimization (Data URI extraction).
 * - CSP and security headers generation.
 * - Automatic deployment/reload of system Nginx configuration (if applicable).
 *
 * @returns {AstroIntegration} The configured Astro integration.
 */
export default function postBuildIntegration(): AstroIntegration {
  return {
    name: "jmrp-post-build",
    hooks: {
      "astro:build:done": async ({ dir, logger }) => {
        const distDir = fileURLToPath(dir);
        const relativeDist = path.relative(process.cwd(), distDir);
        logger.info(`Starting optimizations in [${relativeDist}]`);

        const cspData: CspData = {
          imageDomains: new Set<string>(),
        };

        try {
          await extractCssDataUris(distDir, logger);

          const systemNginxPath =
            process.env.POSTBUILD_NGINX_SNIPPETS_PATH || "";

          // We always enable CSP artifact generation (nonces, hashes, .conf file)
          // during the build phase so tests can verify them, regardless of
          // whether we deploy them to a system Nginx later.
          const enableCsp = true;

          await processHtmlFiles(distDir, cspData, enableCsp, logger);
          await finalizeCspConfig(distDir, cspData, logger);

          await optimizeImages(distDir, logger);
          await compressAssets(distDir, logger);

          if (systemNginxPath) {
            // Only fix permissions when deploying to Nginx (requires sudo and www-data user)
            fixPermissions(distDir, logger);
            validateNginxPath(systemNginxPath);
            deploySecurityHeaders(distDir, systemNginxPath, logger);
          } else {
            logger.info(
              "Skipping Nginx deployment (POSTBUILD_NGINX_SNIPPETS_PATH not set).",
            );
          }

          await purgeCloudflareCache(logger);
        } catch (error) {
          logger.error("Fatal optimization error:");
          logger.error(
            error instanceof Error
              ? error.stack || error.message
              : String(error),
          );
          throw error instanceof Error ? error : new Error(String(error));
        }

        logger.info(`Optimizations completed successfully.`);
      },
    },
  };
}

/**
 * Validates the Nginx snippet path to prevent arbitrary writes.
 *
 * @param systemNginxPath - The absolute path to validate.
 */
function validateNginxPath(systemNginxPath: string) {
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
 * Fixes permissions for the distribution directory to ensure Nginx (www-data) can read it.
 *
 * @param distDir - The distribution directory path.
 * @param logger - Astro logger instance.
 */
function fixPermissions(distDir: string, logger: AstroIntegrationLogger) {
  logger.info(`Fixing permissions for [${distDir}]...`);
  const secureOpts = createSecureSpawnOptions();
  try {
    // Set ownership to www-data:www-data
    const chownResult = spawnSync(
      "sudo",
      ["chown", "-R", "www-data:www-data", distDir],
      secureOpts,
    );
    if (chownResult.error || chownResult.status !== 0) {
      const errorMsg =
        chownResult.error?.message || `exit code ${chownResult.status}`;
      throw new Error(`chown failed: ${errorMsg}`);
    }

    // Set directory permissions to 755
    const chmodDirResult = spawnSync(
      "sudo",
      ["find", distDir, "-type", "d", "-exec", "chmod", "755", "{}", "+"],
      secureOpts,
    );
    if (chmodDirResult.error || chmodDirResult.status !== 0) {
      const errorMsg =
        chmodDirResult.error?.message || `exit code ${chmodDirResult.status}`;
      throw new Error(`chmod directories failed: ${errorMsg}`);
    }

    // Set file permissions to 644
    const chmodFileResult = spawnSync(
      "sudo",
      ["find", distDir, "-type", "f", "-exec", "chmod", "644", "{}", "+"],
      secureOpts,
    );
    if (chmodFileResult.error || chmodFileResult.status !== 0) {
      const errorMsg =
        chmodFileResult.error?.message || `exit code ${chmodFileResult.status}`;
      throw new Error(`chmod files failed: ${errorMsg}`);
    }

    logger.info("✓ Permissions fixed (www-data:www-data, 755/644).");
  } catch (error) {
    // Permission failures should fail the build, not just warn
    logger.error("Failed to fix permissions.");
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Deploys the generated security headers to the system Nginx directory.
 *
 * @param distDir - Production build output directory.
 * @param systemNginxPath - Destination path for the headers snippet.
 * @param logger - Astro logger instance.
 */
function deploySecurityHeaders(
  distDir: string,
  systemNginxPath: string,
  logger: AstroIntegrationLogger,
) {
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
    logger.info(
      `Skipping deployment: system Nginx path does not exist [${path.basename(systemNginxPath)}]`,
    );
  }
  if (!generatedExists) {
    logger.info(
      `Skipping deployment: generated security headers not found [${path.basename(generatedPath)}]`,
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
    logger,
  );
}

/**
 * Performs the actual file copy and reload operations.
 */
function performNginxDeployment(
  systemNginxPath: string,
  generatedPath: string,
  systemNginxAssetsPath: string,
  generatedAssetsPath: string,
  logger: AstroIntegrationLogger,
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
  logger.info(`Deploying security headers to system Nginx...`);
  try {
    const originalContent = fs.readFileSync(systemNginxPath);
    let originalAssetsContent: Buffer | null = null;
    let assetsCreated = false;
    const systemAssetsExists = fs.existsSync(systemNginxAssetsPath);

    if (systemAssetsExists) {
      originalAssetsContent = fs.readFileSync(systemNginxAssetsPath);
    }

    const secureOpts = createSecureSpawnOptions();

    // Use sudo to copy files since Nginx path usually requires root privileges
    const copyResult = spawnSync(
      "sudo",
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
        "sudo",
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
        logger,
      );

      logger.info("✓ Nginx security headers deployed and reloaded.");
    } catch (error) {
      handleNginxValidationError(
        error,
        systemNginxPath,
        originalContent,
        nginxTestTimeout,
        logger,
        {
          path: systemNginxAssetsPath,
          originalContent: originalAssetsContent,
          created: assetsCreated,
        },
      );
    }
  } catch (error) {
    logger.error(
      "⚠ Deployment failed. Check Nginx permissions or environment state.",
    );
    logger.error(
      error instanceof Error ? error.stack || error.message : String(error),
    );
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Creates secure execution options with a sanitized PATH.
 *
 * @param timeout - Execution timeout in milliseconds.
 */
function createSecureExecOptions(timeout: number) {
  // Use a sanitized environment for execSync to avoid PATH injection
  // We replace the PATH with a secure default to mitigate risks, ignoring the existing PATH
  // prettier-ignore
  const secureEnv = {
    ...process.env,
    PATH: DEFAULT_SECURE_PATH, // NOSONAR
  };

  return {
    stdio: "inherit" as const,
    timeout,
    env: secureEnv,
  };
}

/**
 * Creates secure spawn options without timeout for simple operations.
 * Uses sanitized PATH to mitigate PATH injection risks.
 */
function createSecureSpawnOptions() {
  return {
    stdio: "inherit" as const,
    env: {
      ...process.env,
      PATH: DEFAULT_SECURE_PATH,
    },
  };
}

/**
 * Executes the Nginx test and reload commands safely.
 *
 * @param testTimeout - Timeout for the configuration test command.
 * @param reloadTimeout - Timeout for the reload command.
 * @param systemNginxCachePath - Path to the Nginx cache directory to clear.
 * @param logger - Astro logger instance.
 */
function executeNginxReload(
  testTimeout: number,
  reloadTimeout: number,
  systemNginxCachePath: string,
  logger: AstroIntegrationLogger,
) {
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
  clearNginxCache(systemNginxCachePath, logger);
}

/**
 * Safely clears the Nginx cache directory by removing its contents.
 *
 * @param systemNginxCachePath - The path to the Nginx cache directory.
 * @param logger - Astro logger instance.
 */
function clearNginxCache(
  systemNginxCachePath: string,
  logger: AstroIntegrationLogger,
) {
  // Validate path to prevent accidental deletion of important directories
  if (
    !path.isAbsolute(systemNginxCachePath) ||
    systemNginxCachePath === path.parse(systemNginxCachePath).root
  ) {
    logger.warn(`Refusing to clear unsafe cache path: ${systemNginxCachePath}`);
    return;
  }
  if (!fs.existsSync(systemNginxCachePath)) return;

  // Security: Prevent TOCTOU race conditions with symbolic links
  if (fs.lstatSync(systemNginxCachePath).isSymbolicLink()) {
    logger.warn(
      `Refusing to clear cache path as it is a symbolic link: ${systemNginxCachePath}`,
    );
    return;
  }

  // Optimize: Only clear the 'jmrp_cache' dedicated to jmrp.io
  // instead of wiping the entire nginx cache.
  const targetCachePath = path.join(systemNginxCachePath, "jmrp_cache");

  if (fs.existsSync(targetCachePath)) {
    // Security: Prevent TOCTOU race by checking if targetCachePath is a symlink
    if (fs.lstatSync(targetCachePath).isSymbolicLink()) {
      logger.warn(
        `Refusing to clear cache path as it is a symbolic link: ${targetCachePath}`,
      );
      return;
    }
    logger.info(`Clearing specific Nginx cache: [${targetCachePath}]...`);

    const secureOpts = createSecureSpawnOptions();

    // We use -mindepth 1 to delete everything INSIDE jmrp_cache, but keep the folder itself
    const clearResult = spawnSync(
      "sudo",
      ["find", targetCachePath, "-mindepth", "1", "-delete"],
      secureOpts,
    ); // NOSONAR

    if (clearResult.error || clearResult.status !== 0) {
      const errorMsg =
        clearResult.error?.message || `exit code ${clearResult.status}`;
      logger.warn(
        `Failed to clear Nginx cache at ${targetCachePath}: ${errorMsg}`,
      );
    }
  } else {
    logger.info(`Cache folder ${targetCachePath} not found, skipping clear.`);
  }

  // FORCE permissions on the main cache directory to ensure www-data can write
  logger.info(`Ensuring ownership of cache path: ${systemNginxCachePath}`);
  const chownResult = spawnSync(
    "sudo",
    ["chown", "-R", "www-data:www-data", systemNginxCachePath],
    createSecureSpawnOptions(),
  );
  if (chownResult.error || chownResult.status !== 0) {
    const errorMsg =
      chownResult.error?.message || `exit code ${chownResult.status}`;
    logger.warn(`Failed to set ownership on cache path: ${errorMsg}`);
  }
}

/**
 * Safely serializes an unknown value to a string.
 * Handles strings directly, uses JSON.stringify with a try/catch fallback
 * to prevent crashes on circular references, BigInt, or throwing toJSON.
 */
function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Handles validation errors after deployment by reverting to the original content.
 *
 * @param validationError - The caught validation error.
 * @param systemNginxPath - Destination path for the headers snippet.
 * @param originalContent - Buffer of the original configuration content.
 * @param timeout - Execution timeout for Nginx commands.
 * @param logger - Astro logger instance.
 * @param assetsRollback - Optional asset rollback information.
 */
function handleNginxValidationError(
  validationError: unknown,
  systemNginxPath: string,
  originalContent: Buffer,
  timeout: number,
  logger: AstroIntegrationLogger,
  assetsRollback?: {
    path: string;
    originalContent: Buffer | null;
    created: boolean;
  },
) {
  logger.error(
    "⚠ Nginx validation failed! Reverting to previous configuration.",
  );
  const validationMessage =
    validationError instanceof Error
      ? (validationError.stack ?? validationError.message)
      : safeStringify(validationError);
  logger.error(validationMessage);

  try {
    performRollback(systemNginxPath, originalContent, assetsRollback);
    logger.info(
      "✓ Successfully reverted to the previous stable configuration.",
    );

    // Final validation to ensure system is left in a stable state
    const finalExecOptions = createSecureExecOptions(timeout);
    verifyRollbackState(finalExecOptions);
  } catch (revertError) {
    const revertErrorMessage =
      revertError instanceof Error ? revertError.message : String(revertError);
    logger.error(
      `CRITICAL: Failed to revert Nginx configuration. Manual intervention required.`,
    );
    logger.warn(`Revert failure details: ${revertErrorMessage}`);
    throw revertError instanceof Error
      ? revertError
      : new Error(revertErrorMessage);
  }

  // If revert was successful, re-throw the original error to inform the implementation that the new config was rejected
  throw validationError instanceof Error
    ? validationError
    : new Error(validationMessage);
}

/**
 * Safely removes a temporary file, swallowing any errors.
 */
function cleanupTempFile(filePath: string): void {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // Best-effort cleanup - swallow errors
  }
}

/**
 * Performs the file rollback for both main and assets config using sudo.
 * Uses cryptographically random temp filenames and secure spawn options.
 */
function performRollback(
  systemNginxPath: string,
  originalContent: Buffer,
  assetsRollback?: {
    path: string;
    originalContent: Buffer | null;
    created: boolean;
  },
) {
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
    "sudo",
    ["mv", tempPath, systemNginxPath],
    secureOpts,
  ); // NOSONAR
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
      "sudo",
      ["rm", "-f", assetsRollback.path],
      secureOpts,
    ); // NOSONAR
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
      "sudo",
      ["mv", tempAssetsPath, assetsRollback.path],
      secureOpts,
    ); // NOSONAR
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
 * Verifies that Nginx is in a stable state after rollback.
 */
function verifyRollbackState(execOptions: {
  stdio: "inherit";
  timeout: number;
  env: NodeJS.ProcessEnv;
}) {
  const nginxConfigPath = process.env.POSTBUILD_NGINX_CONFIG_PATH;
  const finalTestArgs = nginxConfigPath
    ? ["-t", "-c", nginxConfigPath]
    : ["-t"];

  const finalTestResult = spawnSync("nginx", finalTestArgs, execOptions); // NOSONAR suppressed: external command usage is intentional
  if (finalTestResult.error) {
    throw finalTestResult.error;
  }
  if (finalTestResult.status !== 0) {
    throw new Error("Nginx final validation test failed.");
  }
}
