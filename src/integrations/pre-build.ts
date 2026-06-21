import { execFileSync } from "node:child_process";
import fs from "node:fs";

import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import { loadEnv } from "vite";

import { GITHUB_AVATAR_PATH, setupGithubAvatar } from "./pre-build/avatar.js";
import { setupCfBeacon } from "./pre-build/beacon.js";

/**
 * Updates the "Last updated" date in llms.txt files to the current build date.
 *
 * @param logger - The Astro logger instance.
 */
function updateLlmsDate(logger: AstroIntegrationLogger): void {
  const buildDate = new Date().toISOString().split("T", 1)[0];
  for (const file of ["public/llms.txt", "public/llms-full.txt"]) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, "utf-8");
      const updated = content.replace(
        /^> Last updated: \d{4}-\d{2}-\d{2}/m,
        `> Last updated: ${buildDate}`,
      );
      if (updated !== content) {
        fs.writeFileSync(file, updated, "utf-8");
        logger.info(`Updated build date in ${file}`);
      }
    }
  }
}

/**
 * Downloads any reference favicons not already cached in `src/assets/icons/`.
 *
 * Wraps `scripts/optimize-favicons.mjs` (idempotent: only new domains hit the
 * network). Failures are non-fatal — the References component falls back to a
 * globe icon — so this never breaks the build.
 *
 * @param logger - The Astro logger instance.
 */
function setupReferenceFavicons(logger: AstroIntegrationLogger): void {
  try {
    // Run as a child process: importing the script here conflicts with Vite's
    // module runner during astro:config:setup. The script is idempotent.
    execFileSync(process.execPath, ["scripts/optimize-favicons.mjs"], {
      cwd: process.cwd(),
      stdio: "inherit",
      timeout: 120_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(
      `Reference favicons skipped (${message}). The globe fallback will be used.`,
    );
  }
}

/**
 * Creates the jmrp-pre-build Astro integration.
 *
 * This integration ensures that external assets required for the build
 * (like GitHub avatars and Cloudflare beacons) are downloaded and ready.
 */
export default function preBuildIntegration(): AstroIntegration {
  return {
    name: "jmrp-pre-build",
    hooks: {
      "astro:config:setup": async ({ command, logger }) => {
        // Load environment variables using Vite's helper
        const env = loadEnv(
          command === "dev" ? "development" : "production",
          process.cwd(),
          "",
        );

        logger.info(`Environment initialization: [${command}]`);

        try {
          const shouldRunGithubAvatar =
            command === "build" ||
            env.PREBUILD_RUN_ON_DEV === "true" ||
            !fs.existsSync(GITHUB_AVATAR_PATH);

          if (shouldRunGithubAvatar) {
            await setupGithubAvatar(logger);
          } else {
            logger.info("GitHub avatar exists locally. Skipping fetch.");
          }

          // Only fetch beacon if we are building for production
          if (command === "build") {
            await setupCfBeacon(env.PUBLIC_CF_BEACON_TOKEN, logger);
            updateLlmsDate(logger);
            setupReferenceFavicons(logger);
          }

          // Always setup icons detection to ensure UnoCSS finds them
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(`Initialization failure: ${message}`);

          // In dev mode, we don't want to crash the whole process for pre-build failures
          if (command === "dev") {
            logger.warn("Continuing in development mode despite errors...");
            return;
          } else {
            throw error instanceof Error ? error : new Error(message);
          }
        }

        logger.info("Initialization completed.");
      },
    },
  };
}
