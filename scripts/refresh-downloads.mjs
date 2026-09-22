/**
 * Writes `src/data/downloads.json`, the one snapshot of cumulative download
 * totals that every figure on the site and in the CV PDFs is read from.
 *
 * ── Why a shared writer ──────────────────────────────────────────────────
 * The pre-build integration wrote this file inside `astro build`, while the
 * CV PDFs were compiled BEFORE it by `build:cv`, from live API calls of their
 * own. So the PDFs carried the previous build's world and the HTML the current
 * one, and `/cv/` promised that "every version is generated from the same
 * source as this page, so they never disagree" while showing ~108k next to
 * PDFs that said ~105k (GEO audit #9, A1). Now `build:cv` refreshes the
 * snapshot first, hashes it into its cache key and compiles from it, and the
 * integration reuses a snapshot younger than {@link DEFAULT_MAX_AGE_MS}
 * instead of fetching a second, slightly different one minutes later.
 *
 * Plain Node (`.mjs` with a sibling `.d.mts`) for the same reason as
 * `download-sources.mjs`: the LaTeX generators cannot import TypeScript.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { fetchAllDownloads } from "./download-sources.mjs";

/** Path of the snapshot, relative to the repository root. */
export const DOWNLOADS_DATA_PATH = "src/data/downloads.json";

/**
 * Age under which a snapshot is reused rather than fetched again. Long enough to
 * span `build:cv` plus the Astro build that follows it in `pnpm build`, short
 * enough that a build started hours later gets fresh numbers.
 */
export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Reads the snapshot, or returns undefined when there is none or it is not
 * JSON. Never throws: a missing snapshot is a state every caller handles.
 *
 * @param {string} root - Repository root.
 * @returns {Record<string, unknown> | undefined} The parsed snapshot.
 */
export function readDownloadsData(root) {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(root, DOWNLOADS_DATA_PATH), "utf8"),
    );
  } catch {
    return;
  }
}

/**
 * Age of the snapshot in milliseconds, from its own `generatedAt`, or
 * Infinity when there is no usable snapshot.
 *
 * @param {Record<string, unknown> | undefined} data - The parsed snapshot.
 * @returns {number} Milliseconds since it was generated.
 */
export function snapshotAgeMs(data) {
  const generatedAt =
    data && typeof data.generatedAt === "string"
      ? Date.parse(data.generatedAt)
      : NaN;
  return Number.isNaN(generatedAt) ? Infinity : Date.now() - generatedAt;
}

/**
 * Refreshes the snapshot unless the existing one is younger than `maxAgeMs`.
 *
 * Throws when the fetch fails and no snapshot exists; when one exists the
 * failure is reported through `warn` and the old snapshot is kept, which is
 * the build host's last-known-good.
 *
 * @param {object} options - Options.
 * @param {string} options.root - Repository root.
 * @param {string} [options.token] - GitHub token, to lift the API rate limit.
 * @param {number} [options.maxAgeMs] - Reuse threshold; 0 always refreshes.
 * @param {(line: string) => void} [options.log] - Progress sink.
 * @param {(line: string) => void} [options.warn] - Warning sink.
 * @returns {Promise<{data: Record<string, unknown>, refreshed: boolean}>} The
 *   snapshot now on disk and whether this call wrote it.
 */
export async function refreshDownloadsFile({
  root,
  token,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  log = () => {},
  warn = console.warn,
}) {
  const existing = readDownloadsData(root);
  const age = snapshotAgeMs(existing);
  if (existing && age < maxAgeMs) {
    log(
      `  ✓ Reusing ${DOWNLOADS_DATA_PATH} written ${Math.round(age / 60_000)} min ago.`,
    );
    return { data: existing, refreshed: false };
  }

  try {
    const { total, sources, excluded, manualVerifiedOn, projects } =
      await fetchAllDownloads(token);
    const data = {
      total,
      generatedAt: new Date().toISOString(),
      sources,
      excluded,
      manualVerifiedOn,
      projects,
    };
    const outputPath = path.join(root, DOWNLOADS_DATA_PATH);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const tmpPath = `${outputPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmpPath, outputPath);
    log(
      `  ✓ Downloads total: ${total.toLocaleString("en-US")} ` +
        `(releases ${sources.githubReleases}, docker ${sources.dockerHub}, ` +
        `nuget ${sources.nuget}, manual ${sources.manual}, ` +
        `${Object.keys(projects).length} projects; ` +
        `${excluded.githubVerification} checksum/signature fetches excluded)`,
    );
    return { data, refreshed: true };
  } catch (error) {
    if (!existing) throw error;
    const message = error instanceof Error ? error.message : String(error);
    warn(
      `Could not refresh download totals (${message}). Keeping the existing ${DOWNLOADS_DATA_PATH}.`,
    );
    return { data: existing, refreshed: false };
  }
}
