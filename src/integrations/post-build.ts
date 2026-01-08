/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook).
 */

import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { setupSitemap } from "./post-build/sitemap.js";
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
      "astro:build:done": async ({ dir }) => {
        const distDir = fileURLToPath(dir);
        console.log(
          `\n[\x1b[36mPostBuild\x1b[0m] Starting optimizations in ${distDir}`,
        );

        const cspData: CspData = {
          styleHashes: new Set<string>(),
          scriptHashes: new Set<string>(),
          imageDomains: new Set<string>(),
        };

        try {
          setupSitemap(distDir);
          await extractCssDataUris(distDir);

          const systemNginxPath =
            process.env.POSTBUILD_NGINX_SNIPPETS_PATH || "";
          const enableCsp = !!systemNginxPath;

          if (!enableCsp) {
            console.log(
              "[PostBuild] Skipping CSP generation and Nginx deployment (POSTBUILD_NGINX_SNIPPETS_PATH is empty).",
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
              // Safety: We will validate the configuration after deployment and revert if it fails.
              console.log(`[PostBuild] Validating Nginx configuration...`);
              try {
                // We can't easily test a snippet alone with nginx -t without a full config context,
                // so we perform an atomic-like swap and revert if the global validation fails.
                const originalContent = fs.readFileSync(systemNginxPath);
                fs.copyFileSync(generatedPath, systemNginxPath);

                try {
                  execSync("nginx -t", { stdio: "pipe" });
                  execSync("nginx -s reload", { stdio: "inherit" });
                  console.log("  ✓ Nginx configuration reloaded successfully.");
                } catch (validationError) {
                  const validationErrorMessage =
                    validationError instanceof Error
                      ? validationError.message
                      : String(validationError);
                  console.error(
                    "  ⚠ Nginx validation/reload failed! Reverting changes.",
                  );
                  console.error(`  Nginx Error: ${validationErrorMessage}`);
                  try {
                    fs.writeFileSync(systemNginxPath, originalContent);
                    console.log(
                      "  ✓ Successfully reverted to the previous Nginx configuration.",
                    );
                    // Final validation to ensure system is left in a stable state
                    execSync("nginx -t", { stdio: "pipe" });
                  } catch (revertError) {
                    const revertErrorMessage =
                      revertError instanceof Error
                        ? revertError.message
                        : String(revertError);
                    console.error(
                      "  CRITICAL: Failed to revert Nginx configuration. Manual intervention required.",
                      revertErrorMessage,
                    );
                    process.exit(1);
                  }
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                console.error(
                  "  ⚠ Deployment failed. Check Nginx permissions or syntax.",
                  errorMessage,
                );
                process.exit(1);
              }
            }
          }
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.error(
            `[\x1b[31mPostBuild\x1b[0m] Fatal error:`,
            errorMessage,
          );
          process.exit(1);
        }

        console.log(
          `[\x1b[36mPostBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
        );
      },
    },
  };
}
