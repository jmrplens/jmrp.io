/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration, AstroIntegrationLogger } from "astro";

import { purgeCloudflareCache } from "./post-build/cloudflare.js";
import { compressAssets } from "./post-build/compression.js";
import { finalizeCspConfig } from "./post-build/csp.js";
import { extractCssDataUris } from "./post-build/css.js";
import { processHtmlFiles } from "./post-build/html.js";
import { patchClientPrerenderNonce } from "./post-build/patch-prerender.js";
import type { CspData } from "./post-build/types.js";

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
          styleHashes: new Set<string>(),
          scriptHashes: new Set<string>(),
          imageDomains: new Set<string>(),
        };

        try {
          await extractCssDataUris(distDir);

          // Patch Astro's client-prerender code BEFORE processing HTML
          // This ensures SRI hashes are calculated on the patched JS files
          await patchClientPrerenderNonce(distDir);

          const systemNginxPath =
            process.env.POSTBUILD_NGINX_SNIPPETS_PATH || "";
          const enableCsp = !!systemNginxPath;

          if (enableCsp) {
            validateNginxPath(systemNginxPath);
          } else {
            logger.info(
              "Skipping CSP generation and Nginx deployment (environment variable POSTBUILD_NGINX_SNIPPETS_PATH is not set).",
            );
          }

          await processHtmlFiles(distDir, cspData, enableCsp);

          if (enableCsp) {
            await finalizeCspConfig(distDir, cspData);
            deploySecurityHeaders(distDir, systemNginxPath, logger);
          }

          await compressAssets(distDir);
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
  // Safety check for Nginx path to prevent arbitrary file overwrites
  if (
    !path.isAbsolute(systemNginxPath) ||
    !systemNginxPath.endsWith(".conf") ||
    systemNginxPath.includes("..")
  ) {
    const sanitizedPath = path.basename(systemNginxPath);
    throw new Error(
      `Invalid Nginx configuration path: ${sanitizedPath}. Must be an absolute path ending in .conf.`,
    );
  }

  // Reject symlinks to avoid redirection risks
  if (
    fs.existsSync(systemNginxPath) &&
    fs.lstatSync(systemNginxPath).isSymbolicLink()
  ) {
    throw new Error(
      `Nginx configuration path cannot be a symbolic link: ${systemNginxPath}`,
    );
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

  if (!fs.existsSync(systemNginxPath) || !fs.existsSync(generatedPath)) {
    return;
  }

  // Upfront permission check
  try {
    fs.accessSync(systemNginxPath, fs.constants.W_OK);
  } catch {
    throw new Error(
      `No write permission for system Nginx configuration. Build must run with appropriate permissions.`,
    );
  }

  const nginxTestTimeout = Number.parseInt(
    process.env.POSTBUILD_NGINX_TEST_TIMEOUT || "10000",
    10,
  );
  const nginxReloadTimeout = Number.parseInt(
    process.env.POSTBUILD_NGINX_RELOAD_TIMEOUT || "30000",
    10,
  );

  // Safety: We will validate the configuration after deployment and revert if it fails.
  logger.info(`Deploying security headers to system Nginx...`);
  try {
    const originalContent = fs.readFileSync(systemNginxPath);
    fs.copyFileSync(generatedPath, systemNginxPath);

    try {
      const systemNginxCachePath =
        process.env.POSTBUILD_NGINX_CACHE_PATH || "/var/cache/nginx";

      // Use a sanitized environment for execSync to avoid PATH injection
      // We prepend secure paths to the existing PATH to maintain compatibility
      const secureEnv = {
        ...process.env,
        PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin${path.delimiter}${process.env.PATH || ""}`,
      };

      // Explicitly typed options to satisfy execSync overload if needed, or just standard object
      const execOptions = {
        stdio: "inherit" as const,
        timeout: nginxTestTimeout,
        env: secureEnv,
      };

      // prettier-ignore
      const testResult = spawnSync("nginx", ["-t"], execOptions); // NOSONAR
      if (testResult.error) {
        throw testResult.error;
      }
      if (testResult.status !== 0) {
        throw new Error("Nginx configuration test failed.");
      }

      // prettier-ignore
      const reloadResult = spawnSync("nginx", ["-s", "reload"], { ...execOptions, timeout: nginxReloadTimeout }); // NOSONAR
      if (reloadResult.error) {
        throw reloadResult.error;
      }
      if (reloadResult.status !== 0) {
        throw new Error("Nginx reload command failed.");
      }

      // Clear Nginx cache only AFTER a successful reload to prevent race conditions
      clearNginxCache(systemNginxCachePath, logger);

      logger.info("✓ Nginx security headers deployed and reloaded.");
    } catch (error) {
      handleNginxValidationError(
        error,
        systemNginxPath,
        originalContent,
        nginxTestTimeout,
        logger,
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

  logger.info(`Clearing Nginx cache in [${systemNginxCachePath}]...`);
  try {
    const files = fs.readdirSync(systemNginxCachePath);
    for (const file of files) {
      fs.rmSync(path.join(systemNginxCachePath, file), {
        recursive: true,
        force: true,
      });
    }
  } catch (error) {
    logger.warn(
      `Could not clear Nginx cache: ${error instanceof Error ? error.message : String(error)}`,
    );
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
 */
function handleNginxValidationError(
  validationError: unknown,
  systemNginxPath: string,
  originalContent: Buffer,
  timeout: number,
  logger: AstroIntegrationLogger,
) {
  logger.error(
    "⚠ Nginx validation failed! Reverting to previous configuration.",
  );
  logger.error(
    validationError instanceof Error
      ? validationError.stack || validationError.message
      : String(validationError),
  );
  try {
    fs.writeFileSync(systemNginxPath, originalContent);
    logger.info(
      "✓ Successfully reverted to the previous stable configuration.",
    );
    // Final validation to ensure system is left in a stable state
    const execOptions = {
      stdio: "inherit" as const,
      timeout: timeout,
      env: {
        ...process.env,
        PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin${path.delimiter}${process.env.PATH || ""}`,
      },
    };
    // prettier-ignore
    const finalTestResult = spawnSync("nginx", ["-t"], execOptions); // NOSONAR
    if (finalTestResult.status !== 0) {
      throw new Error("Nginx final validation test failed.");
    }
  } catch (revertError) {
    const revertErrorMessage =
      revertError instanceof Error ? revertError.message : String(revertError);
    logger.error(
      `CRITICAL: Failed to revert Nginx configuration. Manual intervention required.`,
    );
    logger.debug(`Revert failure details: ${revertErrorMessage}`);
    throw revertError instanceof Error
      ? revertError
      : new Error(revertErrorMessage);
  }
}
