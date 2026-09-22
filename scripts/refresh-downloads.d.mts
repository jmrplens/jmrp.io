import type { ProjectDownloads } from "./download-sources.mjs";

/** Persisted shape of `src/data/downloads.json`. */
export interface DownloadsData {
  total: number;
  generatedAt: string;
  sources: {
    githubReleases: number;
    dockerHub: number;
    nuget: number;
    manual: number;
  };
  excluded: { githubVerification: number };
  manualVerifiedOn: string;
  projects: Record<string, ProjectDownloads>;
}

export const DOWNLOADS_DATA_PATH: string;
export const DEFAULT_MAX_AGE_MS: number;

export function readDownloadsData(root: string): DownloadsData | undefined;

export function snapshotAgeMs(data: DownloadsData | undefined): number;

export function refreshDownloadsFile(options: {
  root: string;
  token?: string;
  maxAgeMs?: number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): Promise<{ data: DownloadsData; refreshed: boolean }>;
