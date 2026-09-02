import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";
import { glob } from "glob";
import sharp from "sharp";

/**
 * Directory (relative to the project root / `process.cwd()`) holding the
 * content-addressed cache of already-optimized PNG bytes, keyed by the
 * SHA-256 hash of their pre-optimization source content.
 */
const CACHE_BLOBS_DIR = path.resolve(process.cwd(), ".cache", "postbuild-png");

/**
 * Path to the small JSON manifest recording, for every source-content hash
 * seen so far, how many bytes the optimization pass saved (0 if none).
 */
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  ".cache",
  "postbuild-png.json",
);

/**
 * Per-hash manifest entry: how many bytes optimization saved (0 = tried and
 * found not to help this content, no blob stored) and the last time a build
 * reused or created this entry — drives {@link pruneStaleEntries}.
 */
interface PngManifestEntry {
  savedBytes: number;
  lastUsed: number;
}

/** Shape of the on-disk manifest: source-content hash -> entry. */
type PngManifest = Record<string, PngManifestEntry>;

/** Threshold (bytes) below which a PNG is treated as a "small icon" for palette quantization. */
const SMALL_ICON_BYTE_THRESHOLD = 51_200;

/** Cache entries not reused by a build in this long are pruned (30 days). Mirrors `compression.ts`. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Sharp/pngquant options used for the palette re-optimization pass, plus the
 * small-icon size threshold and the installed libvips + libimagequant
 * versions. Hashed into `configSignature` (see {@link computeConfigSignature})
 * so that changing any of these — or upgrading `sharp`, which bundles its own
 * libvips/libimagequant build — invalidates the entire on-disk cache instead
 * of silently serving blobs produced under a stale configuration forever.
 *
 * `imagequant` (not `vips`) is the library that actually performs the
 * palette quantization requested via `png({ palette: true })`, so it is the
 * more direct dependency to pin here; `vips` is kept too since it still
 * governs the (lossless) `compressionLevel` encoding path.
 */
const PNG_OPTIMIZE_CONFIG = {
  compressionLevel: 9,
  quality: 80,
  iconThreshold: SMALL_ICON_BYTE_THRESHOLD,
  vips: sharp.versions.vips,
  imagequant: sharp.versions.imagequant ?? "unknown",
};

/**
 * Computes a short hash identifying the current optimization config
 * ({@link PNG_OPTIMIZE_CONFIG}). Stored alongside the manifest so a config
 * (or `sharp`/libvips) change can be detected and the stale cache dropped,
 * rather than serving blobs generated under different quality/compression
 * settings forever.
 *
 * @returns Hex-encoded SHA-256 of the canonicalized config.
 */
function computeConfigSignature(): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(PNG_OPTIMIZE_CONFIG))
    .digest("hex");
}

/** On-disk manifest shape: a config signature plus the hash -> bytes-saved map. */
interface PngManifestFile {
  configSignature: string;
  entries: PngManifest;
}

/**
 * Loads the PNG re-optimization manifest from disk, tolerating a missing or
 * corrupt file (fresh/empty cache). If the stored `configSignature` doesn't
 * match the current optimization config (quality/compressionLevel/icon
 * threshold/libvips version), the entire cache (manifest + blobs) is
 * considered stale and dropped — otherwise a config change would silently
 * keep serving blobs optimized under the old settings indefinitely, since
 * `.cache/` persists across builds on the server.
 *
 * @param logger - The Astro logger instance, used to report cache invalidation.
 * @returns The parsed manifest entries, or an empty object if none exists
 *   yet or the cache was invalidated.
 */
async function loadManifest(
  logger: AstroIntegrationLogger,
): Promise<PngManifest> {
  const currentSignature = computeConfigSignature();
  try {
    const raw = await fs.promises.readFile(MANIFEST_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "configSignature" in parsed &&
      "entries" in parsed
    ) {
      const manifestFile = parsed as PngManifestFile;
      if (manifestFile.configSignature === currentSignature) {
        return manifestFile.entries;
      }
      logger.info(
        "  Optimization config changed since last build — invalidating PNG cache.",
      );
      await fs.promises.rm(CACHE_BLOBS_DIR, { recursive: true, force: true });
      await fs.promises.mkdir(CACHE_BLOBS_DIR, { recursive: true });
    }
  } catch {
    // Missing or invalid manifest: start fresh.
  }
  return {};
}

/**
 * Persists the PNG re-optimization manifest to disk, tagged with the current
 * config signature (see {@link loadManifest}).
 *
 * @param manifest - The manifest entries to persist.
 */
async function saveManifest(manifest: PngManifest): Promise<void> {
  const manifestFile: PngManifestFile = {
    configSignature: computeConfigSignature(),
    entries: manifest,
  };
  await fs.promises.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.promises.writeFile(
    MANIFEST_PATH,
    JSON.stringify(manifestFile, null, 2),
  );
}

/**
 * Writes a cache blob atomically: writes to a uniquely-named temp file in the
 * same directory, then `rename`s it into place. Renames within the same
 * filesystem are atomic, so a reader can never observe a partially-written
 * blob, and concurrent writers for the same hash (e.g. two files with
 * duplicate content processed in the same batch) can't corrupt each other.
 *
 * @param destPath - Final absolute path for the blob (e.g.
 *   `.cache/postbuild-png/<hash>.png`).
 * @param data - Bytes to write.
 */
async function writeBlobAtomic(destPath: string, data: Buffer): Promise<void> {
  const tmpPath = `${destPath}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(tmpPath, data);
  await fs.promises.rename(tmpPath, destPath);
}

/**
 * Removes manifest entries (and their cached `.png` blobs, if any) not
 * reused by any build in the last {@link CACHE_MAX_AGE_MS}. Mirrors
 * `pruneStaleEntries` in `compression.ts`; the PNG cache has no other
 * eviction mechanism, so without this it grows without bound as the site's
 * image set changes over time.
 *
 * @param manifest - The manifest entries map, mutated in place.
 * @param logger - The Astro logger instance.
 * @returns Whether any entry was pruned (i.e. the manifest needs saving).
 */
async function pruneStaleEntries(
  manifest: PngManifest,
  logger: AstroIntegrationLogger,
): Promise<boolean> {
  const now = Date.now();
  const staleHashes = Object.entries(manifest)
    .filter(([, entry]) => now - entry.lastUsed > CACHE_MAX_AGE_MS)
    .map(([hash]) => hash);

  if (staleHashes.length === 0) return false;

  await Promise.all(
    staleHashes.map((hash) => {
      delete manifest[hash];
      // Entries with savedBytes === 0 never had a blob written; `force`
      // makes the removal a no-op in that case instead of throwing.
      return fs.promises.rm(path.join(CACHE_BLOBS_DIR, `${hash}.png`), {
        force: true,
      });
    }),
  );

  logger.info(
    `  Pruned ${staleHashes.length} stale PNG cache entries (>30 days unused).`,
  );
  return true;
}

/**
 * Optimizes images in the distribution directory.
 *
 * `ViteImageOptimizer` (see `astro.config.mjs`) already runs Sharp over every
 * PNG during the Vite build, over bundled assets and `public/` alike. Its
 * cache is keyed by PATH, not by content, and its key says nothing about the
 * encoder settings either — `src/integrations/pre-build/image-cache.ts`
 * certifies both before each build; the cache below is the one keyed by
 * content hash. This second pass exists because that config never enables
 * Sharp's
 * `palette` (pngquant-style) quantization, so it re-encodes small/icon-like
 * PNGs with palette quantization to recover real additional savings Vite's
 * pass leaves on the table. To avoid redoing that CPU-bound work on every
 * build for PNGs whose content hasn't changed, results are cached on disk
 * keyed by the SHA-256 hash of the source bytes: a cache hit either copies
 * the previously-optimized bytes (fast) or is known to yield no savings
 * (skipped entirely).
 *
 * @param distDir - Absolute path to the build output directory.
 * @param logger - The Astro logger instance.
 */
export async function optimizeImages(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  logger.info("Optimizing built images...");

  const pngFiles = await glob("**/*.png", {
    cwd: distDir,
    absolute: true,
    nodir: true,
  });

  const manifest = await loadManifest(logger);
  await fs.promises.mkdir(CACHE_BLOBS_DIR, { recursive: true });

  let optimizedCount = 0;
  let cachedHitCount = 0;
  let totalSaved = 0;
  let manifestDirty = false;

  const CONCURRENCY = 4;

  const processFile = async (file: string) => {
    try {
      const stats = await fs.promises.stat(file);
      const originalSize = stats.size;

      // Skip very small files or files already optimized
      if (originalSize < 1024) return { optimized: false, saved: 0 };

      const buffer = await fs.promises.readFile(file);
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");

      if (Object.hasOwn(manifest, hash)) {
        // We've already tried optimizing this exact byte content before.
        const cachedEntry = manifest[hash];
        if (cachedEntry.savedBytes === 0) {
          // Known outcome: optimization does not help this content. Skip,
          // but refresh lastUsed so this entry survives pruning.
          manifest[hash] = { ...cachedEntry, lastUsed: Date.now() };
          manifestDirty = true;
          return { optimized: false, saved: 0, cached: true };
        }

        const cachedBlobPath = path.join(CACHE_BLOBS_DIR, `${hash}.png`);
        try {
          const cachedBuffer = await fs.promises.readFile(cachedBlobPath);
          await fs.promises.writeFile(file, cachedBuffer);
          manifest[hash] = { ...cachedEntry, lastUsed: Date.now() };
          manifestDirty = true;
          return {
            optimized: true,
            saved: cachedEntry.savedBytes,
            cached: true,
          };
        } catch {
          // Cached blob missing/unreadable (e.g. cache dir cleared
          // manually): fall through and re-run Sharp below.
        }
      }

      const isSmallIcon =
        originalSize < SMALL_ICON_BYTE_THRESHOLD ||
        file.toLowerCase().includes("icon");

      const optimizedBuffer = await sharp(buffer)
        .png({
          palette: isSmallIcon,
          compressionLevel: PNG_OPTIMIZE_CONFIG.compressionLevel,
          quality: PNG_OPTIMIZE_CONFIG.quality,
        })
        .toBuffer();

      if (optimizedBuffer.length < originalSize) {
        await fs.promises.writeFile(file, optimizedBuffer);
        await writeBlobAtomic(
          path.join(CACHE_BLOBS_DIR, `${hash}.png`),
          optimizedBuffer,
        );
        manifest[hash] = {
          savedBytes: originalSize - optimizedBuffer.length,
          lastUsed: Date.now(),
        };
        manifestDirty = true;
        return {
          optimized: true,
          saved: originalSize - optimizedBuffer.length,
          cached: false,
        };
      }

      manifest[hash] = { savedBytes: 0, lastUsed: Date.now() };
      manifestDirty = true;
    } catch (error) {
      logger.warn(
        `Failed to optimize image ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return { optimized: false, saved: 0, cached: false };
  };

  for (let i = 0; i < pngFiles.length; i += CONCURRENCY) {
    const batch = pngFiles.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((f) => processFile(f)));

    for (const res of results) {
      if (res.cached) cachedHitCount++;
      if (!res.optimized) {
        continue;
      }

      optimizedCount++;
      totalSaved += res.saved;
    }
  }

  if (await pruneStaleEntries(manifest, logger)) manifestDirty = true;
  if (manifestDirty) {
    await saveManifest(manifest);
  }

  if (optimizedCount > 0) {
    logger.info(
      `  ✓ Optimized ${optimizedCount} PNGs (${cachedHitCount} from cache), saved ${(totalSaved / 1024).toFixed(2)} KB.`,
    );
  } else {
    logger.info("  No further PNG optimization needed.");
  }
}
