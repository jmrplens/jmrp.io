import type { ProjectDownloads } from "./download-sources.mjs";

/** Persisted shape of `src/data/downloads.json`. */
export interface DownloadsData {
  /** Grand total across every configured source. */
  total: number;
  /** ISO timestamp of the last successful refresh. */
  generatedAt: string;
  /** Aggregate breakdown per kind of source; a strict partition of `total`. */
  sources: {
    /** Release asset downloads on GitHub. */
    githubReleases: number;
    /** Image pulls on Docker Hub. */
    dockerHub: number;
    /** Lifetime NuGet downloads (meta packages only). */
    nuget: number;
    /** Hand-read counts (MathWorks blocks scripted requests). */
    manual: number;
  };
  /** Counted and published, but deliberately NOT part of `total`. */
  excluded: {
    /** Checksum and signature fetches beside a download. */
    githubVerification: number;
  };
  /** Date the hand-read counts were last verified. */
  manualVerifiedOn: string;
  /** Per-project breakdown, keyed by GitHub repository name. */
  projects: Record<string, ProjectDownloads>;
}

/** Path of the snapshot, relative to the repository root. */
export const DOWNLOADS_DATA_PATH: string;

/** Age under which a snapshot is reused rather than fetched again. */
export const DEFAULT_MAX_AGE_MS: number;

/**
 * Reads the snapshot, or returns undefined when there is none or it is not
 * JSON. Never throws.
 *
 * @param root - Repository root.
 * @returns The parsed snapshot.
 */
export function readDownloadsData(root: string): DownloadsData | undefined;

/**
 * Age of the snapshot in milliseconds, from its own `generatedAt`, or
 * undefined when there is no usable snapshot or no readable timestamp.
 *
 * @param data - The parsed snapshot.
 * @returns Milliseconds since it was generated.
 */
export function snapshotAgeMs(
  data: DownloadsData | undefined,
): number | undefined;

/**
 * Refreshes the snapshot unless the existing one is younger than `maxAgeMs`.
 * Throws when the fetch fails and no snapshot exists; keeps the old one
 * otherwise.
 *
 * @param options - Root, token, reuse threshold and log sinks.
 * @returns The snapshot now on disk and whether this call wrote it.
 */
export function refreshDownloadsFile(options: {
  root: string;
  token?: string;
  maxAgeMs?: number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): Promise<{ data: DownloadsData; refreshed: boolean }>;
