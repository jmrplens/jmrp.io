import fs from "node:fs";

import type { AstroIntegration } from "astro";
import { loadEnv } from "vite";

import { GITHUB_AVATAR_PATH, setupGithubAvatar } from "./pre-build/avatar.js";
import { setupCfBeacon } from "./pre-build/beacon.js";
import { setupDownloads } from "./pre-build/downloads.js";
import { timed } from "./timing.js";

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
            await timed("setupGithubAvatar", logger, () =>
              setupGithubAvatar(logger),
            );
          } else {
            logger.info("GitHub avatar exists locally. Skipping fetch.");
          }

          // Only fetch beacon + download totals when building for production.
          // Both keep their last committed value on failure, so the checked-in
          // baselines cover dev and offline builds.
          if (command === "build") {
            await timed("setupCfBeacon", logger, () =>
              setupCfBeacon(env.PUBLIC_CF_BEACON_TOKEN, logger),
            );
            await timed("setupDownloads", logger, () =>
              setupDownloads(logger, env.GITHUB_TOKEN),
            );
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
          }
          throw error instanceof Error ? error : new Error(message);
        }

        logger.info("Initialization completed.");
      },
    },
  };
}
