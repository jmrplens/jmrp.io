import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

import {
  fetchAllDownloads,
  MANUAL_COUNTS_VERIFIED_ON,
  type ProjectDownloads,
} from "../../../scripts/download-sources.mjs";
import { safeStringify } from "../shared.js";

/**
 * Cumulative, all-time download totals for the owner's public projects,
 * refreshed at pre-build. The grand total feeds the homepage hero terminal
 * (`downloads.total`); the per-project breakdown feeds the project cards on
 * /projects/, which show a figure only once it clears
 * `DOWNLOADS_DISPLAY_MIN`.
 *
 * Which channels are counted — and which are left out, with the reason for
 * each — lives in `scripts/download-sources.mjs`, shared with the CV
 * generators so the same project cannot be reported two different ways.
 *
 * Checksum and signature assets are excluded from every figure (see
 * `isVerificationAsset`): a release ships them next to the binary and every
 * install fetches both, so counting them would report the same install twice.
 * They are still reported, under `excluded`, so the exclusion is auditable.
 */
const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "downloads.json";

/** Path to the generated downloads data file, relative to the project root. */
export const DOWNLOADS_DATA_PATH = `${OUTPUT_DIR}/${OUTPUT_FILE}`;

/** Persisted shape of {@link DOWNLOADS_DATA_PATH}. */
interface DownloadsData {
  /** Grand total across every configured source. */
  total: number;
  /** ISO timestamp of the last successful refresh. */
  generatedAt: string;
  /** Aggregate breakdown per kind of source — a strict partition of `total`. */
  sources: {
    githubReleases: number;
    dockerHub: number;
    /** Hand-read counts (MathWorks blocks scripted requests). */
    manual: number;
  };
  /**
   * Counted and published, but deliberately NOT part of `total`: checksum and
   * signature fetches happen alongside a download, not instead of one.
   */
  excluded: {
    githubVerification: number;
  };
  /** Date the hand-read counts were last verified. */
  manualVerifiedOn: string;
  /** Per-project breakdown, keyed by GitHub repository name. */
  projects: Record<string, ProjectDownloads>;
}

/** Absolute path of the generated file and of the directory holding it. */
const outputDirAbs = path.resolve(process.cwd(), OUTPUT_DIR);
const outputPath = path.join(outputDirAbs, OUTPUT_FILE);

/**
 * Writes a zeroed {@link DOWNLOADS_DATA_PATH}, creating its directory.
 *
 * Zero is a value the pages can show, not a broken one: `HomePage` shows "—" for
 * a total of 0 and `ProjectsPage` shows no figure for a project below its
 * display floor. So an empty roster degrades to "no numbers", where a missing
 * file is a hard failure — both pages import it statically.
 */
function writeZeroed(): void {
  const empty: DownloadsData = {
    total: 0,
    generatedAt: new Date().toISOString(),
    sources: { githubReleases: 0, dockerHub: 0, manual: 0 },
    excluded: { githubVerification: 0 },
    manualVerifiedOn: MANUAL_COUNTS_VERIFIED_ON,
    projects: {},
  };
  if (!fs.existsSync(outputDirAbs)) {
    fs.mkdirSync(outputDirAbs, { recursive: true });
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(empty, null, 2)}\n`);
}

/**
 * Guarantees {@link DOWNLOADS_DATA_PATH} exists, without touching the network.
 *
 * The refresh below only runs for `astro build`, but the file is imported
 * statically by two pages, so EVERY command that resolves modules needs it to
 * exist — `astro check` and `astro dev` included. While the file was tracked
 * that was free; now that it is generated, a fresh clone has none until
 * something writes one, and `astro check` would fail to resolve the import
 * before any build had a chance to run.
 *
 * Cheap on purpose: an existing file is left exactly as it is, so this never
 * overwrites a real refresh or the host's last-known-good cache.
 *
 * @param logger - The Astro logger instance.
 */
export function ensureDownloadsData(logger: AstroIntegrationLogger): void {
  if (fs.existsSync(outputPath)) return;
  writeZeroed();
  logger.info(`  ✓ No ${OUTPUT_FILE} yet — wrote a zeroed one.`);
}

/**
 * Refreshes {@link DOWNLOADS_DATA_PATH} with the latest cumulative download
 * totals. Never throws, and always leaves a readable file behind: the pages
 * import it statically, so its absence is a build failure rather than a
 * missing figure.
 *
 * The file is generated, not tracked. On a failed refresh an existing copy is
 * kept — the build host accumulates its own last-known-good across builds — and
 * a host that has none gets a zeroed file, which both consumers already render
 * as a dash instead of a number.
 *
 * @param logger - The Astro logger instance.
 * @param token - Optional GitHub token (from env) to lift the API rate limit.
 */
export async function setupDownloads(
  logger: AstroIntegrationLogger,
  token?: string,
): Promise<void> {
  logger.info("Fetching cumulative download totals...");

  try {
    const { total, sources, excluded, manualVerifiedOn, projects } =
      await fetchAllDownloads(token);
    const data: DownloadsData = {
      total,
      generatedAt: new Date().toISOString(),
      sources,
      excluded,
      manualVerifiedOn,
      projects,
    };

    if (!fs.existsSync(outputDirAbs)) {
      fs.mkdirSync(outputDirAbs, { recursive: true });
    }
    const tmpPath = `${outputPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmpPath, outputPath);

    logger.info(
      `  ✓ Downloads total: ${data.total.toLocaleString("en-US")} ` +
        `(releases ${sources.githubReleases}, docker ${sources.dockerHub}, ` +
        `manual ${sources.manual}, ` +
        `${Object.keys(projects).length} projects; ` +
        `${data.excluded.githubVerification} checksum/signature fetches excluded)`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : safeStringify(error);
    if (fs.existsSync(outputPath)) {
      logger.warn(
        `Could not refresh download totals (${message}). Keeping existing ${OUTPUT_FILE}.`,
      );
    } else {
      // Unreachable in practice — `ensureDownloadsData` runs first on every
      // command — but a warning here is cheaper than a mystery if it ever is.
      writeZeroed();
      logger.warn(
        `Could not fetch download totals (${message}) and no cached file ` +
          `exists. Wrote a zeroed ${OUTPUT_FILE} so the build still renders.`,
      );
    }
  }
}
