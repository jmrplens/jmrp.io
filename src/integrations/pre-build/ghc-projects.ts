import type { AstroIntegrationLogger } from "astro";

import {
  buildDataset,
  ensureDataset,
} from "../../../scripts/ghc/build-data.mjs";
import {
  loadReadOnlyEnv,
  READ_ONLY_ENV_PATH,
} from "../../../scripts/ghc/influx.mjs";
import { writeProjectsSummary } from "../../../scripts/ghc/write-summary.mjs";

/**
 * Pre-build wiring for the /projects live-data pipeline
 * (`plan/projects-ghchronicle/PLAN.md` section 7.6), mirroring
 * `pre-build/downloads.ts`'s two-function shape: a cheap, network-free
 * `ensure*` that guarantees the statically-imported dataset exists for EVERY
 * command (`astro check`, `astro dev`, a worktree with no LAN route), and a
 * `setup*` that does the real network work, run only for `command ===
 * "build"`.
 *
 * @module
 */

/**
 * Guarantees `src/data/ghc/projects-contributions.json` exists by copying
 * the committed `fixture.json` when it does not — same reasoning as
 * `ensureDownloadsData`: `ContributionsPage.astro` and `ProjectsPage.astro`
 * import the file statically, so `astro check`/`astro dev` need it to exist
 * even though only a production `build` refreshes it from InfluxDB.
 *
 * @param logger - The Astro logger instance.
 */
export function ensureGhcProjectsData(logger: AstroIntegrationLogger): void {
  const copied = ensureDataset(process.cwd());
  if (copied) {
    logger.info(
      "  ✓ No projects-contributions.json yet — copied the committed fixture.",
    );
  }
}

/**
 * Refreshes the build-time contributions dataset
 * (`src/data/ghc/projects-contributions.json`) from InfluxDB, falling back
 * to the committed fixture on failure (`buildDataset` never throws — see its
 * doc comment). Run only for `command === "build"`, exactly like
 * `setupDownloads`.
 *
 * @param logger - The Astro logger instance.
 */
export async function setupGhcProjectsData(
  logger: AstroIntegrationLogger,
): Promise<void> {
  logger.info("Building the /projects contributions dataset...");
  if (loadReadOnlyEnv()) {
    logger.info(
      `  ✓ Read the read-only credentials from ${READ_ONLY_ENV_PATH}.`,
    );
  }
  const { fromFixture } = await buildDataset({
    root: process.cwd(),
    log: (line) => logger.info(line),
    warn: (line) => logger.warn(line),
  });
  if (fromFixture) {
    logger.warn(
      "  Using the committed fixture (the dataset could not be collected): deploy-live records this build as NOT live, and the scheduled rebuild replaces it once a collection succeeds.",
    );
  }
}

/**
 * Dev-only, best-effort refresh of the LIVE summary
 * (`.cache/ghc/projects-summary.json`) so `astro dev`'s `PRJ_*` substitution
 * plugin (`vite-plugin-dev-prj-tokens.ts`) has real numbers to show instead
 * of every token falling back to an em dash. Unlike {@link setupGhcProjectsData}
 * this is NOT part of the production build (nginx / a systemd timer owns
 * this file in production — see `write-summary.mjs`'s doc comment); it exists
 * purely so the owner sees live figures while iterating locally. Never
 * throws: `writeProjectsSummary` already keeps the last-good file or writes a
 * fully-null one on failure, and a dev server must never crash over a LAN
 * probe.
 *
 * @param logger - The Astro logger instance.
 */
export async function refreshDevProjectsSummary(
  logger: AstroIntegrationLogger,
): Promise<void> {
  loadReadOnlyEnv();
  try {
    const { refreshed } = await writeProjectsSummary({
      root: process.cwd(),
      log: (line) => logger.info(line),
      warn: (line) => logger.warn(line),
    });
    if (!refreshed) {
      logger.warn(
        "  Dev PRJ_* tokens: InfluxDB unreachable, reusing the last cached summary (or a null one).",
      );
    }
  } catch (error) {
    // Belt and braces: writeProjectsSummary is documented not to throw, but a
    // dev convenience must never take the whole server down over it.
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`  Dev PRJ_* tokens: could not refresh (${message}).`);
  }
}
