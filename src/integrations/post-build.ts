/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 */

import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import { fileURLToPath } from "node:url";
import { extractCssDataUris } from "./post-build/css.js";
import { processHtmlFiles } from "./post-build/html.js";
import { finalizeCspConfig } from "./post-build/csp.js";
import type { CspData } from "./post-build/types.js";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

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
        } catch (e) {
          logger.error("Fatal optimization error:");
          logger.error(e instanceof Error ? e.stack || e.message : String(e));
          throw e instanceof Error ? e : new Error(String(e));
        }

        logger.info(`Optimizations completed successfully.`);
      },
    },
  };
}

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
}

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
      const secureEnv = {
        ...process.env,
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      };
      // Explicitly typed options to satisfy execSync overload if needed, or just standard object
      const execOptions = {
        stdio: "inherit" as const,
        timeout: nginxTestTimeout,
        env: secureEnv,
      };

      execSync("nginx -t", execOptions); // NOSONAR

      const reloadOptions = {
        ...execOptions,
        timeout: nginxReloadTimeout,
      };
      execSync("nginx -s reload", reloadOptions); // NOSONAR

      logger.info("✓ Nginx security headers deployed and reloaded.");
    } catch (validationError) {
      handleNginxValidationError(
        validationError,
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
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
    };
    execSync("nginx -t", execOptions); // NOSONAR
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
