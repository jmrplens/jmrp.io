import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";
import * as cheerio from "cheerio";
import { glob } from "glob";
import { type Config, optimize, type PluginConfig } from "svgo";

import { ASSET_FILENAME_HASH_LENGTH, ASSETS_DIR } from "./constants.js";
import { getExtensionFromMime, writeHtml } from "./utils.js";

// Kept in sync with the SVGO overrides in `astro.config.mjs`'s
// `ViteImageOptimizer` config: `cleanupIDs`/`removeUselessDefs` stay disabled
// here too, and `id`/`class` are no longer stripped, because a data-URI SVG
// extracted here can be a Mermaid diagram whose arrow markers are referenced
// via `id`/`url(#...)` — stripping them would silently break the arrowheads.
const svgoConfig: Config = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupNumericValues: {
            floatPrecision: 1,
          },
          removeViewBox: false,
          removeTitle: true,
          removeDesc: true,
          removeUselessDefs: false, // KEEP definitions (markers for arrows)
          collapseGroups: true,
          cleanupIDs: false, // KEEP IDs (crucial for marker references)
          removeEmptyContainers: true,
          removeEmptyAttrs: true,
          cleanupAttrs: true,
          removeStyleElement: true,
          removeDimensions: true,
          removeRasterImages: true,
        },
      },
    },
    "sortAttrs",
    {
      name: "removeAttrs",
      params: {
        attrs: "(data-name)", // Only remove data-name, KEEP class and id
      },
    },
    {
      name: "addAttributesToSVGElement",
      params: {
        attributes: [{ xmlns: "http://www.w3.org/2000/svg" }],
      },
    },
  ] as PluginConfig[],
};

/** Cache entries not reused by a build in this long are pruned (30 days). Mirrors `compression.ts`/`images.ts`. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Persistent, content-addressed cache of already-extracted asset bytes
 * (SVGO-optimized for SVG, raw otherwise), keyed by the asset's own
 * filename — itself a hash of the *decoded, pre-optimization* buffer (see
 * {@link ASSET_FILENAME_HASH_LENGTH}), so it never changes for a given
 * embedded asset regardless of SVGO settings. Survives across builds since
 * `dist` is rebuilt from scratch every time, so without this every build
 * re-decodes and re-runs SVGO over every embedded icon/diagram, even ones
 * byte-identical to a previous build.
 *
 * (A second, whole-file-content cache — keyed by each CSS/HTML file's own
 * raw bytes, to skip the regex/cheerio pass entirely — was prototyped and
 * measured, then deliberately dropped; see the "css.ts whole-file cache"
 * finding in the wave report for why.)
 */
const ASSET_CACHE_DIR = path.resolve(
  process.cwd(),
  ".cache",
  "postbuild-css-assets",
);
const ASSET_CACHE_MANIFEST_PATH = path.resolve(
  process.cwd(),
  ".cache",
  "postbuild-css-assets.json",
);

/**
 * Returns the installed `svgo` package version, or `"unknown"` if it can't
 * be read (e.g. an unusual `node_modules` layout). Folded into
 * {@link ASSET_CACHE_CONFIG} so an `svgo` upgrade — which can change
 * optimization output even with identical plugin params — invalidates the
 * cache instead of silently replaying bytes produced by the old version.
 *
 * `svgo`'s `package.json` isn't an exported subpath (its `exports` map only
 * lists `.` and `./browser`), so it can't be `import`ed directly under
 * Node's ESM resolution — read it off disk instead, same as `sharp` is
 * queried via its own `versions` API elsewhere in this pipeline.
 */
function getSvgoVersion(): string {
  try {
    const pkgPath = path.resolve(
      process.cwd(),
      "node_modules",
      "svgo",
      "package.json",
    );
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Config knobs affecting the *bytes* written for an extracted asset.
 * Hashed into a signature (see {@link computeAssetCacheConfigSignature})
 * that invalidates {@link ASSET_CACHE_DIR} on change. `version` is a manual
 * escape hatch: bump it if `saveAsset`'s logic changes in a way that isn't
 * captured by the other fields (e.g. a new non-SVG optimization step).
 */
const ASSET_CACHE_CONFIG = {
  version: 1,
  svgo: svgoConfig,
  svgoVersion: getSvgoVersion(),
};

function computeAssetCacheConfigSignature(): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(ASSET_CACHE_CONFIG))
    .digest("hex");
}

/** Per-asset-filename manifest entry: last time a build reused/created it. */
interface AssetCacheEntry {
  lastUsed: number;
}
type AssetCacheManifest = Record<string, AssetCacheEntry>;
interface AssetCacheManifestFile {
  configSignature: string;
  entries: AssetCacheManifest;
}

/**
 * Loads the asset cache manifest, tolerating a missing/corrupt file. Drops
 * the whole cache (manifest + blobs) if the config signature changed.
 */
function loadAssetCacheManifest(
  logger: AstroIntegrationLogger,
): AssetCacheManifest {
  const currentSignature = computeAssetCacheConfigSignature();
  try {
    const raw = fs.readFileSync(ASSET_CACHE_MANIFEST_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      "configSignature" in parsed &&
      "entries" in parsed
    ) {
      const manifestFile = parsed as AssetCacheManifestFile;
      if (manifestFile.configSignature === currentSignature) {
        return manifestFile.entries;
      }
      logger.info(
        "  SVGO/asset config changed since last build — invalidating CSS asset cache.",
      );
      fs.rmSync(ASSET_CACHE_DIR, { recursive: true, force: true });
      fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
    }
  } catch {
    // Missing or invalid manifest: start fresh, and drop any blobs left
    // over from it since they can no longer be trusted against the
    // (unreadable) manifest that recorded them.
    fs.rmSync(ASSET_CACHE_DIR, { recursive: true, force: true });
    fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
  }
  return {};
}

/** Persists the asset cache manifest, tagged with the current config signature. */
function saveAssetCacheManifest(manifest: AssetCacheManifest): void {
  const manifestFile: AssetCacheManifestFile = {
    configSignature: computeAssetCacheConfigSignature(),
    entries: manifest,
  };
  fs.mkdirSync(path.dirname(ASSET_CACHE_MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(
    ASSET_CACHE_MANIFEST_PATH,
    JSON.stringify(manifestFile, null, 2),
  );
}

/**
 * Removes asset cache entries (and their blobs) not reused by any build in
 * the last {@link CACHE_MAX_AGE_MS}. Mirrors `pruneStaleEntries` in
 * `compression.ts`/`images.ts`.
 */
function pruneStaleAssetCacheEntries(
  manifest: AssetCacheManifest,
  logger: AstroIntegrationLogger,
): boolean {
  const now = Date.now();
  const staleFilenames = Object.entries(manifest)
    .filter(([, entry]) => now - entry.lastUsed > CACHE_MAX_AGE_MS)
    .map(([filename]) => filename);

  if (staleFilenames.length === 0) return false;

  for (const filename of staleFilenames) {
    delete manifest[filename];
    fs.rmSync(path.join(ASSET_CACHE_DIR, filename), { force: true });
  }

  logger.info(
    `  Pruned ${staleFilenames.length} stale CSS asset cache entries (>30 days unused).`,
  );
  return true;
}

/**
 * Writes a file atomically: writes to a uniquely-named temp file in the
 * same directory, then `rename`s it into place, so a reader can never
 * observe a partially-written file. Synchronous, matching the rest of this
 * module's I/O style (the CSS/HTML transform loops are sequential, not
 * batched, so there's no concurrency to guard against here — this is about
 * crash-safety, not races).
 */
function writeFileAtomicSync(destPath: string, data: Buffer): void {
  const tmpPath = `${destPath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmpPath, data);
  fs.renameSync(tmpPath, destPath);
}

/**
 * Extracts embedded Data URIs from CSS and HTML files into standalone physical assets.
 *
 * This optimization:
 * 1. Reduces the size of CSS and HTML files by offloading large binary data (images, fonts).
 * 2. Enables better caching of assets.
 * 3. Supports strict CSP by removing inline data: URIs where they might be problematic.
 * 4. Automatically optimizes extracted SVG assets using SVGO.
 *
 * Extracted asset bytes are cached on disk (see {@link ASSET_CACHE_DIR}) so a
 * build re-encountering a byte-identical embedded asset (e.g. the same icon,
 * used again in a later build) skips the SVGO/decode work and just replays
 * the cached bytes.
 *
 * @param {string} distDir - The absolute path to the production build output.
 * @param {AstroIntegrationLogger} logger - The Astro logger instance.
 */
export async function extractCssDataUris(
  distDir: string,
  logger: AstroIntegrationLogger,
) {
  logger.info("Extracting CSS Data URIs...");
  const targetDir = path.join(distDir, ASSETS_DIR);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const cssFiles = await glob("**/*.css", { cwd: distDir, absolute: true });
  const htmlFiles = await glob("**/*.html", { cwd: distDir, absolute: true });

  fs.mkdirSync(ASSET_CACHE_DIR, { recursive: true });
  const assetManifest = loadAssetCacheManifest(logger);
  let assetManifestDirty = false;

  // Regex that correctly handles optional quotes and prevents over-capturing unquoted URIs.
  //
  // The quoted branch uses a lazy `[\s\S]*?` (not a `[^"']+` character class)
  // bounded by a backreference to the *opening* quote. UnoCSS's icon preset
  // emits data URIs wrapped in double quotes whose encoded SVG payload
  // contains *literal, unescaped single quotes* for its own attribute
  // quoting (e.g. `url("data:image/svg+xml;utf8,%3Csvg viewBox='0 0 24
  // 24' ...")`). A character class excluding both quote types stops at the
  // first embedded quote regardless of which delimiter opened the match,
  // so it never reaches the real closing `"` — the match silently fails
  // and zero data URIs get extracted. Only excluding the *matching* quote
  // (via the backreference) lets the other quote type appear freely inside.
  // Optimized to avoid ReDoS: the lazy quantifier is anchored by the
  // backreference + literal `)`, so it cannot backtrack catastrophically.
  const DATA_URI_REGEX =
    /url\(\s*(?:(['"])(data:[\s\S]*?)\1|(data:[^'")\s]+))\s*\)/gi;

  let extracted = 0;
  let assetsFromCache = 0;

  /**
   * Whether `filename` can be safely reused from {@link ASSET_CACHE_DIR}:
   * the blob must exist on disk *and* be tracked in the loaded manifest, so
   * an orphaned blob left over from a config change the manifest was reset
   * for (see {@link loadAssetCacheManifest}) is never replayed.
   */
  const isAssetCacheHit = (filename: string, cachedAssetPath: string) =>
    Object.hasOwn(assetManifest, filename) && fs.existsSync(cachedAssetPath);

  /**
   * Helper to optimize (if SVG) and save an asset to disk, reusing a
   * previously-computed result from {@link ASSET_CACHE_DIR} when available.
   */
  const saveAsset = (
    filePath: string,
    buffer: Buffer,
    ext: string,
    filename: string,
  ) => {
    const cachedAssetPath = path.join(ASSET_CACHE_DIR, filename);
    if (isAssetCacheHit(filename, cachedAssetPath)) {
      const cachedBytes = fs.readFileSync(cachedAssetPath);
      writeFileAtomicSync(filePath, cachedBytes);
      assetManifest[filename] = { lastUsed: Date.now() };
      assetManifestDirty = true;
      extracted++;
      assetsFromCache++;
      return;
    }

    let finalBytes: Buffer;
    if (ext === "svg") {
      const svgString = buffer.toString("utf-8");
      try {
        const optimized = optimize(svgString, svgoConfig);
        // Check for error field before using data
        if ("error" in optimized && optimized.error) {
          const errorMsg =
            typeof optimized.error === "string"
              ? optimized.error
              : JSON.stringify(optimized.error);
          logger.warn(
            `SVGO optimization returned error for ${filename}: ${errorMsg}`,
          );
          finalBytes = buffer;
        } else {
          finalBytes = Buffer.from(optimized.data);
        }
      } catch (svgoError) {
        const svgoErrorMsg =
          svgoError instanceof Error ? svgoError.message : String(svgoError);
        logger.warn(
          `SVGO optimization failed for extracted asset ${filename}: ${svgoErrorMsg}`,
        );
        finalBytes = buffer;
      }
    } else {
      finalBytes = buffer;
    }

    writeFileAtomicSync(filePath, finalBytes);
    writeFileAtomicSync(cachedAssetPath, finalBytes);
    assetManifest[filename] = { lastUsed: Date.now() };
    assetManifestDirty = true;
    extracted++;
  };

  /**
   * Helper to extract a single asset from a Data URI and save it to disk.
   * Returns a URL pointing to the new asset or the original match if failed.
   */
  const extractAssetFromDataUri = (
    fullMatch: string,
    quote: string | undefined,
    quotedData: string | undefined,
    unquotedData: string | undefined,
    file: string,
  ): string => {
    const rawDataUri = quotedData || unquotedData;
    if (!rawDataUri?.startsWith("data:")) return fullMatch;

    try {
      const commaIndex = rawDataUri.indexOf(",");
      if (commaIndex === -1) return fullMatch;

      const metadata = rawDataUri.substring(5, commaIndex);
      const data = rawDataUri.slice(commaIndex + 1);
      const isBase64 = metadata.includes(";base64");
      const mime = metadata.split(";", 1)[0] || "application/octet-stream";

      const buffer = isBase64
        ? Buffer.from(data.trim(), "base64")
        : Buffer.from(decodeURIComponent(data.trim()));

      const ext = getExtensionFromMime(mime);
      const hash = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex")
        .slice(0, ASSET_FILENAME_HASH_LENGTH);
      const filename = `${hash}.${ext}`;
      const filePath = path.join(targetDir, filename);

      if (!fs.existsSync(filePath)) {
        saveAsset(filePath, buffer, ext, filename);
      }

      const newUrl = `/${ASSETS_DIR}/${filename}`;
      const q = quote || '"';
      return `url(${q}${newUrl}${q})`;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Error extracting CSS data URI in file: ${file} - ${errorMessage}`,
      );
      return fullMatch;
    }
  };

  /**
   * Processes CSS content to find and replace data URIs with physical assets.
   */
  const processCssContent = (content: string, file: string): string => {
    return content.replaceAll(
      DATA_URI_REGEX,
      (fm: string, q?: string, qd?: string, uqd?: string) =>
        extractAssetFromDataUri(fm, q, qd, uqd, file),
    );
  };

  // Process standalone CSS files
  for (const file of cssFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const newContent = processCssContent(content, file);
    if (newContent !== content) {
      fs.writeFileSync(file, newContent, "utf-8");
    }
  }

  // Process HTML files using cheerio for precision
  for (const file of htmlFiles) {
    const content = fs.readFileSync(file, "utf-8");
    const $ = cheerio.load(content);
    let isModified = false;

    // Process <style> tags
    $("style").each((_, el) => {
      const $el = $(el);
      const styleContent = $el.html();
      if (styleContent) {
        const newStyleContent = processCssContent(styleContent, file);
        if (newStyleContent !== styleContent) {
          $el.html(newStyleContent);
          isModified = true;
        }
      }
    });

    // Process style attributes
    $("[style]").each((_, el) => {
      const $el = $(el);
      const styleAttr = $el.attr("style");
      if (styleAttr) {
        const newStyleAttr = processCssContent(styleAttr, file);
        if (newStyleAttr !== styleAttr) {
          $el.attr("style", newStyleAttr);
          isModified = true;
        }
      }
    });

    if (isModified) {
      writeHtml(file, $.html());
    }
  }

  if (pruneStaleAssetCacheEntries(assetManifest, logger))
    assetManifestDirty = true;
  if (assetManifestDirty) saveAssetCacheManifest(assetManifest);

  logger.info(
    `  ✓ Extracted ${extracted} assets from CSS/HTML (${assetsFromCache} from cache).`,
  );
}
