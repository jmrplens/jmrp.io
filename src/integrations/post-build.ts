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
              const sanitizedPath = path.basename(systemNginxPath);
              throw new Error(
                `Invalid Nginx configuration path: ${sanitizedPath}. Must be an absolute path ending in .conf.`,
              );
            }
          }

          if (!enableCsp) {
            logger.info(
              "Skipping CSP generation and Nginx deployment (environment variable POSTBUILD_NGINX_SNIPPETS_PATH is not set).",
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
                  `No write permission for system Nginx configuration. Build must run with appropriate permissions.`,
                );
              }

              // Safety: We will validate the configuration after deployment and revert if it fails.
              logger.info(`Deploying security headers to system Nginx...`);
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
                  logger.info(
                    "✓ Nginx security headers deployed and reloaded.",
                  );
                } catch (validationError) {
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
                      `CRITICAL: Failed to revert Nginx configuration. Manual intervention required.`,
                    );
                    logger.debug(
                      `Revert failure details: ${revertErrorMessage}`,
                    );
                    throw revertError instanceof Error
                      ? revertError
                      : new Error(revertErrorMessage);
                  }
                }
              } catch (error) {
                logger.error(
                  "⚠ Deployment failed. Check Nginx permissions or environment state.",
                );
                logger.error(
                  error instanceof Error
                    ? error.stack || error.message
                    : String(error),
                );
                throw error instanceof Error ? error : new Error(String(error));
              }
            }
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
