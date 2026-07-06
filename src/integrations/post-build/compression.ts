import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import zlib from "node:zlib";

import { type AstroIntegrationLogger } from "astro";
import { glob } from "glob";

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

/**
 * Directory (relative to `process.cwd()`) holding the content-addressed
 * cache of already-compressed `.gz`/`.br` blobs, keyed by the SHA-256 hash
 * of their pre-compression source content. Mirrors the pattern used by the
 * PNG re-optimization cache in `images.ts`.
 */
const CACHE_BLOBS_DIR = path.resolve(
  process.cwd(),
  ".cache",
  "postbuild-compression",
);

/** Path to the JSON manifest recording, per source-content hash, the last time it was used (ms epoch). */
const MANIFEST_PATH = path.resolve(
  process.cwd(),
  ".cache",
  "postbuild-compression.json",
);

/** Cache entries not reused by a build in this long are pruned (30 days). */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Compression parameters. Hashed into `configSignature` (see
 * {@link computeConfigSignature}) so that changing gzip/brotli settings —
 * or upgrading Node's bundled zlib — invalidates the entire on-disk cache
 * instead of silently serving blobs compressed under stale settings.
 */
const COMPRESSION_CONFIG = {
  gzipLevel: 9,
  brotliQuality: 11,
  zlibVersion: process.versions.zlib,
};

/** On-disk manifest shape: a config signature plus hash -> last-used timestamp (ms epoch). */
interface CompressionManifestFile {
  configSignature: string;
  entries: Record<string, number>;
}

/**
 * Computes a short hash identifying the current compression config
 * ({@link COMPRESSION_CONFIG}).
 *
 * @returns Hex-encoded SHA-256 of the canonicalized config.
 */
function computeConfigSignature(): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(COMPRESSION_CONFIG))
    .digest("hex");
}

/**
 * Loads the compression manifest from disk, tolerating a missing or corrupt
 * file (fresh/empty cache). If the stored `configSignature` doesn't match
 * the current config, the entire cache (manifest + blobs) is dropped.
 *
 * @param logger - The Astro logger instance, used to report cache invalidation.
 * @returns The parsed manifest entries (hash -> last-used ms epoch), or an
 *   empty object if none exists yet or the cache was invalidated.
 */
async function loadManifest(
  logger: AstroIntegrationLogger,
): Promise<Record<string, number>> {
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
      const manifestFile = parsed as CompressionManifestFile;
      if (manifestFile.configSignature === currentSignature) {
        return manifestFile.entries;
      }
      logger.info(
        "  Compression config changed since last build — invalidating compression cache.",
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
 * Persists the compression manifest to disk, tagged with the current config signature.
 *
 * @param entries - The hash -> last-used-timestamp map to persist.
 */
async function saveManifest(entries: Record<string, number>): Promise<void> {
  const manifestFile: CompressionManifestFile = {
    configSignature: computeConfigSignature(),
    entries,
  };
  await fs.promises.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });
  await fs.promises.writeFile(
    MANIFEST_PATH,
    JSON.stringify(manifestFile, null, 2),
  );
}

/**
 * Writes a cache blob atomically: writes to a uniquely-named temp file in
 * the same directory, then `rename`s it into place, so a reader can never
 * observe a partially-written blob and concurrent writers for the same hash
 * can't corrupt each other.
 *
 * @param destPath - Final absolute path for the blob.
 * @param data - Bytes to write.
 */
async function writeBlobAtomic(destPath: string, data: Buffer): Promise<void> {
  const tmpPath = `${destPath}.${crypto.randomUUID()}.tmp`;
  await fs.promises.writeFile(tmpPath, data);
  await fs.promises.rename(tmpPath, destPath);
}

/**
 * Removes manifest entries (and their cached blobs) not reused by any build
 * in the last {@link CACHE_MAX_AGE_MS}.
 *
 * @param entries - The manifest entries map, mutated in place.
 * @param logger - The Astro logger instance.
 * @returns Whether any entry was pruned (i.e. the manifest needs saving).
 */
async function pruneStaleEntries(
  entries: Record<string, number>,
  logger: AstroIntegrationLogger,
): Promise<boolean> {
  const now = Date.now();
  const staleHashes = Object.entries(entries)
    .filter(([, lastUsed]) => now - lastUsed > CACHE_MAX_AGE_MS)
    .map(([hash]) => hash);

  if (staleHashes.length === 0) return false;

  await Promise.all(
    staleHashes.flatMap((hash) => {
      delete entries[hash];
      return [
        fs.promises.rm(path.join(CACHE_BLOBS_DIR, `${hash}.gz`), {
          force: true,
        }),
        fs.promises.rm(path.join(CACHE_BLOBS_DIR, `${hash}.br`), {
          force: true,
        }),
      ];
    }),
  );

  logger.info(
    `  Pruned ${staleHashes.length} stale compression cache entries (>30 days unused).`,
  );
  return true;
}

/**
 * Compresses static assets in the distribution directory using Gzip and Brotli.
 * Target extensions: .js, .css, .svg, .json, .xml, .txt
 *
 * Note: HTML files are intentionally excluded because Nginx's sub_filter directive
 * for CSP nonce replacement requires uncompressed content. Pre-compressing HTML
 * would require Nginx to decompress it first (via gunzip), negating any benefit.
 * Nginx's on-the-fly gzip compression handles HTML efficiently after sub_filter.
 *
 * Results are cached on disk keyed by the SHA-256 hash of the source bytes
 * (see {@link CACHE_BLOBS_DIR}): a cache hit copies the previously-compressed
 * `.gz`/`.br` blobs instead of re-running gzip/brotli, which is the dominant
 * cost for large unchanged bundles (e.g. vendor chunks) across builds.
 *
 * @param distDir - Absolute path to the build output directory.
 * @param logger - The Astro logger instance.
 */
export async function compressAssets(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  logger.info("Compressing assets (Gzip & Brotli)...");

  const files = await glob("**/*.{js,css,svg,json,xml,txt}", {
    cwd: distDir,
    absolute: true,
    nodir: true,
    ignore: ["**/*.gz", "**/*.br"],
  });

  await fs.promises.mkdir(CACHE_BLOBS_DIR, { recursive: true });
  const manifest = await loadManifest(logger);
  let manifestDirty = false;

  // Concurrency limit (Batching)
  const BATCH_SIZE = 10;
  let compressedCount = 0;
  let cachedHitCount = 0;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map((file) => compressFile(file, manifest, logger)),
    );
    for (const result of results) {
      if (result.compressed) compressedCount++;
      if (result.cached) cachedHitCount++;
      if (result.dirty) manifestDirty = true;
    }
  }

  if (await pruneStaleEntries(manifest, logger)) manifestDirty = true;
  if (manifestDirty) await saveManifest(manifest);

  logger.info(
    `  ✓ Compressed ${compressedCount} assets (${cachedHitCount} from cache).`,
  );
}

/**
 * Compresses a single file, reusing cached `.gz`/`.br` blobs when the file's
 * content hash was already compressed in a previous build.
 *
 * @param file - The absolute path to the file.
 * @param manifest - The shared hash -> last-used-timestamp map (mutated in place).
 * @param logger - The Astro logger instance.
 * @returns Whether compression succeeded, was served from cache, and whether the manifest was mutated.
 */
async function compressFile(
  file: string,
  manifest: Record<string, number>,
  logger: AstroIntegrationLogger,
): Promise<{ compressed: boolean; cached: boolean; dirty: boolean }> {
  try {
    const content = await fs.promises.readFile(file);
    const hash = crypto.createHash("sha256").update(content).digest("hex");
    const cachedGzPath = path.join(CACHE_BLOBS_DIR, `${hash}.gz`);
    const cachedBrPath = path.join(CACHE_BLOBS_DIR, `${hash}.br`);

    if (Object.hasOwn(manifest, hash)) {
      try {
        const [gzipped, brotlied] = await Promise.all([
          fs.promises.readFile(cachedGzPath),
          fs.promises.readFile(cachedBrPath),
        ]);
        await Promise.all([
          fs.promises.writeFile(`${file}.gz`, gzipped),
          fs.promises.writeFile(`${file}.br`, brotlied),
        ]);
        manifest[hash] = Date.now();
        return { compressed: true, cached: true, dirty: true };
      } catch {
        // Cached blobs missing/unreadable (e.g. cache dir cleared manually):
        // fall through and recompress below.
      }
    }

    // Run both compressions in parallel
    const [gzipped, brotlied] = await Promise.all([
      gzip(content, { level: 9 }),
      brotli(content, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        },
      }),
    ]);

    // Write the build output and the cache blobs in parallel
    await Promise.all([
      fs.promises.writeFile(`${file}.gz`, gzipped),
      fs.promises.writeFile(`${file}.br`, brotlied),
      writeBlobAtomic(cachedGzPath, gzipped),
      writeBlobAtomic(cachedBrPath, brotlied),
    ]);

    manifest[hash] = Date.now();
    return { compressed: true, cached: false, dirty: true };
  } catch (error) {
    await cleanupOrphanedFiles(file, logger);
    logger.warn(
      `Failed to compress ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { compressed: false, cached: false, dirty: false };
  }
}

/**
 * Cleans up potentially orphaned compressed files after a failure.
 *
 * @param file - The original file path.
 * @param logger - The Astro logger instance.
 */
async function cleanupOrphanedFiles(
  file: string,
  logger: AstroIntegrationLogger,
) {
  const cleanup = async (path: string) => {
    try {
      await fs.promises.unlink(path);
    } catch (error) {
      // Ignore ENOENT (file not found), warn on other errors
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn(
          `Failed to cleanup orphaned file ${path}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  };

  await cleanup(`${file}.gz`);
  await cleanup(`${file}.br`);
}
