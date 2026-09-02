/**
 * Optimized-image cache integrity guard (pre-build).
 *
 * `vite-plugin-image-optimizer` keys its on-disk cache by PATH and by nothing
 * else — `node_modules/vite-plugin-image-optimizer/dist/index.js:241`:
 *
 * ```js
 * const cachedFilePath = join(options.cacheLocation ?? "", filePath);
 * if (options.cache === true && fs.existsSync(cachedFilePath)) { ... }
 * ```
 *
 * For bundled assets that is safe against a change of SOURCE BYTES: Vite
 * writes a content hash into the emitted name, so new bytes are a new key.
 * For `public/` even that does not hold. The name there is the author's, it
 * never changes, and a replaced file keeps being served from the blob derived
 * from the bytes it replaced — with no warning, for as long as the cache
 * survives.
 *
 * That is exactly what happened to `public/favicon.png`. Commit `37c0176`
 * replaced it with a 144x144 mark and declared `<width>144</width>` in both
 * RSS feeds; the build kept emitting a 32x32 blob written on 2026-01-21, so
 * production served a pre-redesign icon under a size the feed contradicted.
 * The commit changed the XML and, in practice, nothing else.
 *
 * Neither half is safe against a change of ENCODER SETTINGS, because the
 * bundle hash covers the source, not the options that encoded it. That is not
 * hypothetical here: commit `cc25c54` (2026-01-27) added `compressionLevel: 9`
 * to the png options, and 71 of the 167 bundled blobs on disk are dated
 * 2026-01-21 or earlier. They were produced under the previous settings and
 * were never invalidated.
 *
 * So this module keeps two promises, both before the Vite build runs:
 *
 * 1. Every `public/` blob whose recorded source hash no longer matches the
 *    file on disk is deleted, so the optimizer either hits a blob certified
 *    against the current bytes or misses and re-encodes.
 * 2. The cache as a whole is only ever consumed under the settings that
 *    produced it. A signature mismatch — and a missing manifest, which is the
 *    same claim with no evidence behind it — drops the entire directory
 *    rather than asserting a provenance nothing has established.
 *
 * The second promise costs one cold pass, once, on the first build after this
 * lands: 41 s measured over all 167 cached blobs. It is that cheap because
 * the cache holds only png and webp — the 84 lossless AVIF, which dominate
 * encode time, are never cached and are re-encoded on every build already.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";
import { glob } from "glob";
import sharp from "sharp";

/**
 * Name of the sidecar manifest recording, for every `public/` image, the
 * SHA-256 of the source bytes the matching cache blob was derived from.
 *
 * It lives INSIDE the cache directory on purpose: CI caches
 * `.cache/optimized-images` as a unit (`.github/workflows/ci.yml`), so a
 * manifest kept outside would be absent on every runner and the guard would
 * discard the whole cache on every CI run. The plugin never looks at it —
 * its file matcher only accepts image extensions.
 */
const MANIFEST_NAME = ".image-sources.json";

/**
 * Extensions to guard. Deliberately a superset of the plugin's default
 * `test` (`node_modules/vite-plugin-image-optimizer/dist/index.js:180`):
 * over-matching only means deleting a blob that was never going to be read,
 * while under-matching would leave a stale blob in place, which is the whole
 * bug this module exists to prevent.
 */
const IMAGE_GLOB = "**/*.{jpg,jpeg,png,gif,tiff,webp,svg,avif}";

/**
 * Glob options matching the plugin's own matcher, which is case-insensitive
 * (`dist/index.js:180`, the `/i` flag). Without `nocase` a `public/LOGO.PNG`
 * would be cached by the plugin and never certified here; `dot` covers
 * `public/.well-known/` and friends.
 */
const GLOB_OPTIONS = { nodir: true, nocase: true, dot: true } as const;

/** Shape of the on-disk manifest. */
interface ImageSourceManifest {
  /** Invalidates every blob when the optimizer's output settings change. */
  configSignature: string;
  /** `public/`-relative path -> SHA-256 of the source bytes behind its blob. */
  sources: Record<string, string>;
}

/** What `loadManifest` could establish about the cache on disk. */
interface ManifestState {
  /** Recorded source hashes; empty when nothing could be certified. */
  recorded: Record<string, string>;
  /** Whether the whole cache directory was dropped. */
  wiped: boolean;
}

/**
 * Computes a signature covering everything that decides what bytes the
 * optimizer produces: its own options, the installed plugin version, and the
 * libvips build inside `sharp` (which does the actual encoding). Mirrors
 * `computeConfigSignature()` in `src/integrations/post-build/images.ts`.
 *
 * @param options - The exact options object handed to `ViteImageOptimizer`.
 * @returns Hex-encoded SHA-256 of the canonicalized signature input.
 */
function computeConfigSignature(options: Record<string, unknown>): string {
  const require = createRequire(import.meta.url);
  const pluginPackage: unknown = JSON.parse(
    fs.readFileSync(
      require.resolve("vite-plugin-image-optimizer/package.json"),
      "utf8",
    ),
  );
  const pluginVersion =
    pluginPackage &&
    typeof pluginPackage === "object" &&
    "version" in pluginPackage
      ? String(pluginPackage.version)
      : "unknown";

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        options,
        plugin: pluginVersion,
        vips: sharp.versions.vips,
      }),
    )
    .digest("hex");
}

/**
 * Establishes what the cache on disk can be trusted for, dropping it whole
 * when it cannot be trusted at all.
 *
 * Three cases, two of which wipe:
 *
 * - The manifest parses and its `configSignature` matches: the recorded
 *   hashes are usable and the bundled blobs stay.
 * - The signature differs: the optimizer's settings changed, so every blob —
 *   bundled ones included — was produced under rules that no longer apply.
 * - There is no manifest, or it is corrupt: nothing on disk has a stated
 *   provenance. Keeping the bundled half would assert it was produced under
 *   the current settings, which is precisely the unverified assumption that
 *   left 71 blobs on this repo predating a settings change (see the module
 *   docstring). Trusting a cache entry because of its name is the original
 *   bug; it is not repeated here.
 *
 * @param manifestPath - Absolute path to the manifest file.
 * @param signature - The signature the current configuration produces.
 * @param cacheDir - Absolute path to the optimizer's cache directory.
 * @param logger - The Astro logger instance.
 * @returns The recorded source hashes and whether the cache was dropped.
 */
async function loadManifest(
  manifestPath: string,
  signature: string,
  cacheDir: string,
  logger: AstroIntegrationLogger,
): Promise<ManifestState> {
  let reason = "no manifest — the cache has no stated provenance";
  try {
    const parsed: unknown = JSON.parse(
      await fs.promises.readFile(manifestPath, "utf8"),
    );
    if (
      parsed &&
      typeof parsed === "object" &&
      "configSignature" in parsed &&
      "sources" in parsed
    ) {
      const manifest = parsed as ImageSourceManifest;
      if (manifest.configSignature === signature) {
        return { recorded: manifest.sources, wiped: false };
      }
      reason = "image optimizer settings changed since the last build";
    }
  } catch {
    // Falls through to the wipe with the default reason.
  }

  logger.info(
    `  Optimized-image cache: ${reason} — dropping every blob and re-encoding.`,
  );
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
  return { recorded: {}, wiped: true };
}

/**
 * Drops every optimized-image cache blob that cannot be proven to derive from
 * the bytes currently in `public/` under the current encoder settings, then
 * records the hashes this build is about to consume.
 *
 * Runs before the Vite build, so the optimizer either hits a blob this
 * function has certified or misses and re-encodes from the current source.
 *
 * @param args - Absolute `publicDir` and `cacheDir`, plus the exact options
 *   object passed to `ViteImageOptimizer` (hashed into the signature).
 * @param logger - The Astro logger instance.
 */
export async function pruneStaleOptimizedImageCache(
  args: {
    publicDir: string;
    cacheDir: string;
    options: Record<string, unknown>;
  },
  logger: AstroIntegrationLogger,
): Promise<void> {
  const { publicDir, cacheDir, options } = args;
  const signature = computeConfigSignature(options);
  const manifestPath = path.join(cacheDir, MANIFEST_NAME);
  const { recorded, wiped } = await loadManifest(
    manifestPath,
    signature,
    cacheDir,
    logger,
  );

  const files = await glob(IMAGE_GLOB, { cwd: publicDir, ...GLOB_OPTIONS });
  const sources: Record<string, string> = {};
  let dropped = 0;

  await Promise.all(
    files.map(async (rel) => {
      const bytes = await fs.promises.readFile(path.join(publicDir, rel));
      const hash = crypto.createHash("sha256").update(bytes).digest("hex");
      sources[rel] = hash;
      if (recorded[rel] === hash) return;

      const blob = path.join(cacheDir, rel);
      if (!fs.existsSync(blob)) return;
      await fs.promises.rm(blob, { force: true });
      dropped++;
    }),
  );

  // A deleted or renamed public file leaves its blob behind forever, and the
  // key is its path — so the day a DIFFERENT image takes that name it is
  // served the dead one. Same failure, one step removed.
  await Promise.all(
    Object.keys(recorded)
      .filter((rel) => !Object.hasOwn(sources, rel))
      .map(async (rel) => {
        const blob = path.join(cacheDir, rel);
        if (!fs.existsSync(blob)) return;
        await fs.promises.rm(blob, { force: true });
        dropped++;
      }),
  );

  const manifest: ImageSourceManifest = {
    configSignature: signature,
    sources,
  };
  await fs.promises.mkdir(cacheDir, { recursive: true });
  await fs.promises.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  if (wiped) {
    logger.info(
      `  Optimized-image cache: rebuilt from scratch; ${files.length} public assets recorded.`,
    );
  } else {
    logger.info(
      dropped === 0
        ? `  Optimized-image cache: ${files.length} public assets verified against their sources.`
        : `  Optimized-image cache: dropped ${dropped} blob(s) whose source no longer matches (${files.length} public assets verified).`,
    );
  }
}
