import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";

import { safeStringify } from "../shared.js";

/**
 * Cumulative, all-time download totals for the owner's public projects,
 * refreshed at pre-build and consumed by the homepage hero terminal
 * (`downloads.total`). Only sources that expose a *cumulative* count are
 * summed here — PyPI/npm expose windowed stats, not lifetime totals, so they
 * are intentionally excluded (their volume is rounding noise at this scale).
 */
const OUTPUT_DIR = "src/data";
const OUTPUT_FILE = "downloads.json";

/** Path to the generated downloads data file, relative to the project root. */
export const DOWNLOADS_DATA_PATH = `${OUTPUT_DIR}/${OUTPUT_FILE}`;

const UA = "Astro-PreBuild-Integration (https://jmrp.io/)";
const OWNER = "jmrplens";

/**
 * GitHub repos whose Releases ship downloadable binary assets. Their
 * `download_count` is cumulative (all-time) and read straight from the API.
 */
const GITHUB_RELEASE_REPOS = [
  "gitlab-mcp-server",
  "cs-routeros-bouncer",
  "Cloudflare-DNS-Updater",
] as const;

/** Docker Hub `namespace/repository` slugs whose `pull_count` we sum. */
const DOCKER_HUB_IMAGES = [`${OWNER}/gitlab-mcp-server`] as const;

/** Persisted shape of {@link DOWNLOADS_DATA_PATH}. */
interface DownloadsData {
  /** Grand total across every configured source. */
  total: number;
  /** ISO timestamp of the last successful refresh. */
  generatedAt: string;
  /** Per-source breakdown (for debugging / future per-source display). */
  sources: {
    githubReleases: number;
    dockerHub: number;
  };
}

/** A single release object (only the fields we read). */
interface GitHubRelease {
  assets?: { download_count?: number }[];
}

/** A Docker Hub repository object (only the field we read). */
interface DockerHubRepo {
  pull_count?: number;
}

/**
 * Sums `download_count` across every release asset of a single repo, following
 * pagination. Throws on a non-OK response so the caller can fall back.
 *
 * @param repo - Repository name under {@link OWNER}.
 * @param token - Optional GitHub token to lift the rate limit.
 * @returns Total asset downloads for the repo.
 */
async function fetchRepoReleaseDownloads(
  repo: string,
  token: string | undefined,
): Promise<number> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "application/vnd.github+json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=100&page=${page}`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) throw new Error(`GitHub ${repo} releases: ${res.status}`);

    const releases = (await res.json()) as GitHubRelease[];
    if (!Array.isArray(releases) || releases.length === 0) break;

    for (const release of releases) {
      for (const asset of release.assets ?? []) {
        total += asset.download_count ?? 0;
      }
    }
    if (releases.length < 100) break; // last page
  }
  return total;
}

/**
 * Reads the cumulative `pull_count` of a single Docker Hub image.
 *
 * @param slug - `namespace/repository` slug.
 * @returns The image's pull count.
 */
async function fetchDockerHubPulls(slug: string): Promise<number> {
  const res = await fetch(`https://hub.docker.com/v2/repositories/${slug}/`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Docker Hub ${slug}: ${res.status}`);

  const repo = (await res.json()) as DockerHubRepo;
  return typeof repo.pull_count === "number" ? repo.pull_count : 0;
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
    const githubReleases = (
      await Promise.all(
        GITHUB_RELEASE_REPOS.map((repo) =>
          fetchRepoReleaseDownloads(repo, token),
        ),
      )
    ).reduce((sum, n) => sum + n, 0);

    const dockerHub = (
      await Promise.all(DOCKER_HUB_IMAGES.map(fetchDockerHubPulls))
    ).reduce((sum, n) => sum + n, 0);

    const data: DownloadsData = {
      total: githubReleases + dockerHub,
      generatedAt: new Date().toISOString(),
      sources: { githubReleases, dockerHub },
    };

    if (!fs.existsSync(outputDirAbs)) {
      fs.mkdirSync(outputDirAbs, { recursive: true });
    }
    const tmpPath = `${outputPath}.tmp`;
    fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(tmpPath, outputPath);

    logger.info(
      `  ✓ Downloads total: ${data.total.toLocaleString("en-US")} ` +
        `(releases ${githubReleases}, docker ${dockerHub})`,
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
