import type { AstroIntegration } from "astro";
import { loadEnv } from "vite";

import { setupCfBeacon } from "./pre-build/beacon.js";
import { ensureDownloadsData, setupDownloads } from "./pre-build/downloads.js";
import { timed } from "./timing.js";

/**
 * Creates the jmrp-pre-build Astro integration.
 *
 * This integration ensures that external assets required for the build
 * (like the Cloudflare beacon and download totals) are downloaded and ready.
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
          // The download totals are generated, not tracked, and two pages
          // import the file statically — so it has to exist for EVERY command
          // that resolves modules, `astro check` and `astro dev` included, not
          // just for the build that refreshes it. This writes a zeroed file
          // only when there is none at all, and never touches the network.
          ensureDownloadsData(logger);

          // Only fetch the beacon + the real download totals when building for
          // production. The beacon keeps its committed baseline on failure;
          // the totals keep whatever copy the host already had.
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
