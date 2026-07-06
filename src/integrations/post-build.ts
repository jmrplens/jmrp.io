/**
 * Post-Build Integration
 *
 * This integration consolidates the post-build logic into the Astro lifecycle.
 * It runs after the build is complete (`astro:build:done` hook), and only
 * TRANSFORMS the content of the (not-yet-live) `builds/<color>` output
 * directory: HTML/CSS optimization, CSP artifact generation, image
 * optimization, compression, and permission fixups.
 *
 * PUBLISH actions (copying the generated `security_headers*.conf` to system
 * Nginx + test + reload + rollback, Cloudflare cache purge, IndexNow/Bing
 * Webmaster submission) intentionally do NOT live here — they run from
 * `scripts/deploy-live.mjs` AFTER `deploy-swap.mjs` has atomically retargeted
 * `dist/` to this directory. Running them here (pre-swap) would deploy new
 * headers/CDN state while `dist/` still pointed at the previous build.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AstroIntegration, AstroIntegrationLogger } from "astro";

import { compressAssets } from "./post-build/compression.js";
import { finalizeCspConfig } from "./post-build/csp.js";
import { extractCssDataUris } from "./post-build/css.js";
import { processHtmlFiles } from "./post-build/html.js";
import { optimizeImages } from "./post-build/images.js";
import type { CspData } from "./post-build/types.js";
import { timed } from "./timing.js";

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
 * - Permission fixup for the built directory (if system Nginx deployment is configured).
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
          await timed("extractCssDataUris", logger, () =>
            extractCssDataUris(distDir, logger),
          );

          const systemNginxPath =
            process.env.POSTBUILD_NGINX_SNIPPETS_PATH || "";

          // We always enable CSP artifact generation (nonces, hashes, .conf file)
          // during the build phase so tests can verify them, regardless of
          // whether we deploy them to a system Nginx later.
          const enableCsp = true;

          await timed("processHtmlFiles", logger, () =>
            processHtmlFiles(distDir, cspData, enableCsp, logger),
          );
          await timed("finalizeCspConfig", logger, () =>
            finalizeCspConfig(distDir, cspData, logger),
          );

          // optimizeImages (re-compresses PNGs) and compressAssets (gzip/brotli
          // over js/css/svg/json/xml/txt) touch disjoint file sets — PNG is not
          // in compressAssets' extension list — so they can run concurrently
          // instead of back-to-back.
          await Promise.all([
            timed("optimizeImages", logger, () =>
              optimizeImages(distDir, logger),
            ),
            timed("compressAssets", logger, () =>
              compressAssets(distDir, logger),
            ),
          ]);

          if (systemNginxPath) {
            // Only fix permissions when deploying to Nginx (requires sudo and www-data user).
            // The actual copy-to-Nginx + reload happens post-swap in scripts/deploy-live.mjs.
            await timed("fixPermissions", logger, () =>
              fixPermissions(distDir, logger),
            );
          } else {
            logger.info(
              "Skipping permission fix (POSTBUILD_NGINX_SNIPPETS_PATH not set).",
            );
          }
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
 * Creates secure spawn options with a sanitized PATH, to mitigate PATH
 * injection risks when invoking system commands (sudo chown/find).
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
