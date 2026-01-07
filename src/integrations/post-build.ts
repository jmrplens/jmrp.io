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
          await processHtmlFiles(distDir, cspData);
          await finalizeCspConfig(distDir, cspData);

          // Auto-deploy security headers to system Nginx if on the server
          const systemNginxPath = "/etc/nginx/snippets/security_headers.conf";
          const generatedPath = path.join(distDir, "security_headers.conf");

          if (fs.existsSync(systemNginxPath) && fs.existsSync(generatedPath)) {
            // Safety: Validate the new configuration in a temporary file before overwriting system config
            const tempConfigPath = path.join(
              path.dirname(generatedPath),
              "test_security_headers.conf",
            );
            fs.copyFileSync(generatedPath, tempConfigPath);

            console.log(`[PostBuild] Validating Nginx configuration...`);
            try {
              // We can't easily test a snippet alone with nginx -t,
              // but we can try to see if the syntax is roughly correct or just rely on the fallback.
              // A better way is to copy, test, and revert if failed.
              const originalContent = fs.readFileSync(systemNginxPath);
              fs.copyFileSync(generatedPath, systemNginxPath);

              try {
                execSync("nginx -t", { stdio: "pipe" });
                execSync("nginx -s reload", { stdio: "inherit" });
                console.log("  ✓ Nginx configuration reloaded successfully.");
              } catch (error) {
                console.error(
                  "  ⚠ Nginx validation failed! Reverting changes.",
                  error,
                );
                fs.writeFileSync(systemNginxPath, originalContent);
              }
            } catch (error) {
              console.error(
                "  ⚠ Deployment failed. Check Nginx permissions or syntax.",
                error,
              );
            }
          }
        } catch (e) {
          console.error(`[\x1b[31mPostBuild\x1b[0m] Fatal error:`, e);
          throw e;
        }

        console.log(
          `[\x1b[36mPostBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
        );
      },
    },
  };
}
