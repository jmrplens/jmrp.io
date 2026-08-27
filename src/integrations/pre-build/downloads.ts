import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

import {
  fetchAllDownloads,
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
  /** Aggregate breakdown per kind of source. */
  sources: {
    githubReleases: number;
    dockerHub: number;
    /** Hand-read counts (MathWorks blocks scripted requests). */
    manual: number;
  };
  /** Date the hand-read counts were last verified. */
  manualVerifiedOn: string;
  /** Per-project breakdown, keyed by GitHub repository name. */
  projects: Record<string, ProjectDownloads>;
}

/**
 * Refreshes {@link DOWNLOADS_DATA_PATH} with the latest cumulative download
 * totals. Never throws: on any failure the previously committed file is kept
 * so the build always has a value to render.
 *
 * @param logger - The Astro logger instance.
 * @param token - Optional GitHub token (from env) to lift the API rate limit.
 */
export async function setupDownloads(
  logger: AstroIntegrationLogger,
  token?: string,
): Promise<void> {
  logger.info("Fetching cumulative download totals...");

  const outputDirAbs = path.resolve(process.cwd(), OUTPUT_DIR);
  const outputPath = path.join(outputDirAbs, OUTPUT_FILE);

  try {
    const { total, sources, manualVerifiedOn, projects } =
      await fetchAllDownloads(token);
    const data: DownloadsData = {
      total,
      generatedAt: new Date().toISOString(),
      sources,
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
        `${Object.keys(projects).length} projects)`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : safeStringify(error);
    if (fs.existsSync(outputPath)) {
      logger.warn(
        `Could not refresh download totals (${message}). Keeping existing ${OUTPUT_FILE}.`,
      );
    } else {
      logger.warn(
        `Could not fetch download totals (${message}) and no cached file exists.`,
      );
    }
  }
}
