import type { AstroIntegration } from "astro";
import { loadEnv } from "vite";
import fs from "node:fs";
import { setupGithubAvatar } from "./pre-build/avatar.js";
import { setupCfBeacon } from "./pre-build/beacon.js";

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

        // We run this on both 'dev' and 'build' to ensure assets exist locally
        logger.info(`Initialising environment (${command})...`);

        try {
          const avatarPath = "src/assets/github-avatar.png";
          const shouldRunGithubAvatar =
            command === "build" ||
            env.PREBUILD_RUN_ON_DEV === "true" ||
            !fs.existsSync(avatarPath);

          if (shouldRunGithubAvatar) {
            await setupGithubAvatar();
          } else {
            logger.info("Skipping GitHub avatar fetch (already exists).");
          }

          // Only fetch beacon if we are building for production
          if (command === "build") {
            await setupCfBeacon(env.PUBLIC_CF_BEACON_TOKEN);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          logger.error(`Fatal error: ${message}`);

          // In dev mode, we don't want to crash the whole process for pre-build failures
          if (command === "dev") {
            logger.warn("Continuing in dev mode despite errors...");
            return;
          } else {
            throw error instanceof Error ? error : new Error(message);
          }
        }

        logger.info("Completed successfully.");
      },
    },
  };
}
