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
      "astro:config:setup": async ({ command }) => {
        // Load environment variables using Vite's helper
        const env = loadEnv(
          command === "dev" ? "development" : "production",
          process.cwd(),
          "",
        );

        // We run this on both 'dev' and 'build' to ensure assets exist locally
        console.log(
          `\n[\x1b[36mPreBuild\x1b[0m] Initialising environment (${command})...`,
        );

        try {
          const avatarPath = "src/assets/github-avatar.png";
          const shouldRunGithubAvatar =
            command === "build" ||
            env.PREBUILD_RUN_ON_DEV === "true" ||
            !fs.existsSync(avatarPath);

          if (shouldRunGithubAvatar) {
            await setupGithubAvatar();
          } else {
            console.log("  ✓ Skipping GitHub avatar fetch (already exists).");
          }

          // Only fetch beacon if we are building for production
          if (command === "build") {
            await setupCfBeacon(env.PUBLIC_CF_BEACON_TOKEN);
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.error(`[\x1b[31mPreBuild\x1b[0m] Fatal error:`, message);

          // In dev mode, we don't want to crash the whole process for pre-build failures
          if (command === "dev") {
            console.warn(
              "[\x1b[33mPreBuild\x1b[0m] Continuing in dev mode despite errors...",
            );
          } else {
            throw error instanceof Error ? error : new Error(message);
          }
        }

        console.log(
          `[\x1b[36mPreBuild\x1b[0m] \x1b[32mCompleted successfully.\x1b[0m\n`,
        );
      },
    },
  };
}
