/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 */

import type { AstroIntegration } from "astro";
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
 * - Sitemap configuration.
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
        logger.info(`Starting optimizations in ${distDir}`);

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

          const nginxTestTimeout = parseInt(
            process.env.POSTBUILD_NGINX_TEST_TIMEOUT || "10000",
            10,
          );
          const nginxReloadTimeout = parseInt(
            process.env.POSTBUILD_NGINX_RELOAD_TIMEOUT || "30000",
            10,
          );

          if (enableCsp) {
            // Safety check for Nginx path to prevent arbitrary file overwrites
            if (
              !path.isAbsolute(systemNginxPath) ||
              !systemNginxPath.endsWith(".conf") ||
              systemNginxPath.includes("..")
            ) {
              throw new Error(
                `[PostBuild] Invalid Nginx configuration path: ${systemNginxPath}. Must be an absolute path ending in .conf.`,
              );
            }
          }

          if (!enableCsp) {
            logger.info(
              "Skipping CSP generation and Nginx deployment (POSTBUILD_NGINX_SNIPPETS_PATH is empty).",
            );
          }

          await processHtmlFiles(distDir, cspData, enableCsp);

          if (enableCsp) {
            await finalizeCspConfig(distDir, cspData);

            // Auto-deploy security headers to system Nginx if on the server
            const generatedPath = path.join(distDir, "security_headers.conf");

            if (
              fs.existsSync(systemNginxPath) &&
              fs.existsSync(generatedPath)
            ) {
              // Upfront permission check
              try {
                fs.accessSync(systemNginxPath, fs.constants.W_OK);
              } catch {
                throw new Error(
                  `[PostBuild] No write permission for system Nginx path: ${systemNginxPath}. Build must run with appropriate permissions to deploy security headers.`,
                );
              }

              // Safety: We will validate the configuration after deployment and revert if it fails.
              logger.info(`Validating Nginx configuration...`);
              try {
                // We can't easily test a snippet alone with nginx -t without a full config context,
                // so we perform an atomic-like swap and revert if the global validation fails.
                const originalContent = fs.readFileSync(systemNginxPath);
                fs.copyFileSync(generatedPath, systemNginxPath);

                try {
                  execSync("nginx -t", {
                    stdio: "inherit",
                    timeout: nginxTestTimeout,
                  });
                  execSync("nginx -s reload", {
                    stdio: "inherit",
                    timeout: nginxReloadTimeout,
                  });
                  logger.info("✓ Nginx configuration reloaded successfully.");
                } catch (validationError) {
                  const validationErrorMessage =
                    validationError instanceof Error
                      ? validationError.message
                      : String(validationError);
                  logger.error(
                    "⚠ Nginx validation/reload failed or timed out! Reverting changes.",
                  );
                  logger.error(`Nginx Error: ${validationErrorMessage}`);
                  try {
                    fs.writeFileSync(systemNginxPath, originalContent);
                    logger.info(
                      "✓ Successfully reverted to the previous Nginx configuration.",
                    );
                    // Final validation to ensure system is left in a stable state
                    execSync("nginx -t", {
                      stdio: "inherit",
                      timeout: nginxTestTimeout,
                    });
                  } catch (revertError) {
                    const revertErrorMessage =
                      revertError instanceof Error
                        ? revertError.message
                        : String(revertError);
                    logger.error(
                      `CRITICAL: Failed to revert Nginx configuration. Manual intervention required. ${revertErrorMessage}`,
                    );
                    throw revertError instanceof Error
                      ? revertError
                      : new Error(revertErrorMessage);
                  }
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                logger.error(
                  `⚠ Deployment failed. Check Nginx permissions or syntax. ${errorMessage}`,
                );
                throw error instanceof Error ? error : new Error(errorMessage);
              }
            }
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          logger.error(`Fatal error: ${errorMessage}`);
          throw e instanceof Error ? e : new Error(errorMessage);
        }

        logger.info(`Completed successfully.`);
      },
    },
  };
}
