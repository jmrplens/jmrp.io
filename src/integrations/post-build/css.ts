import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { type AstroIntegrationLogger } from "astro";
import * as cheerio from "cheerio";
import { glob } from "glob";
import { type Config, optimize, type PluginConfig } from "svgo";

import { ASSET_FILENAME_HASH_LENGTH, ASSETS_DIR } from "./constants.js";
import { writeHtml } from "./utils.js";

/**
 * Gets the file extension from a MIME type with sanitization.
 * Maps known complex types and ensures safe output.
 */
function getExtensionFromMime(mime: string): string {
  const mimeMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "font/woff": "woff",
    "font/woff2": "woff2",
    "application/font-woff": "woff",
    "application/font-woff2": "woff2",
  };

  const normalizedMime = mime.toLowerCase().trim();
  if (mimeMap[normalizedMime]) {
    return mimeMap[normalizedMime];
  }

  // Extract subtype and sanitize
  const subtype = normalizedMime.split("/", 2)[1] || "";
  // Remove +suffix (e.g., svg+xml -> svg)
  const basetype = subtype.split("+", 1)[0];
  // Strip non-alphanumeric and limit length
  const sanitized = basetype.replaceAll(/[^a-z0-9]/gi, "").slice(0, 10);
  return sanitized || "bin";
}

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

/**
 * Extracts embedded Data URIs from CSS and HTML files into standalone physical assets.
 *
 * This optimization:
 * 1. Reduces the size of CSS and HTML files by offloading large binary data (images, fonts).
 * 2. Enables better caching of assets.
 * 3. Supports strict CSP by removing inline data: URIs where they might be problematic.
 * 4. Automatically optimizes extracted SVG assets using SVGO.
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

  // Regex that correctly handles optional quotes and prevents over-capturing unquoted URIs
  // Optimized to avoid ReDoS and unnecessary escapes
  const DATA_URI_REGEX =
    /url\(\s*(?:(['"])(data:[^"']+)\1|(data:[^'")\s]+))\s*\)/gi;

  let extracted = 0;

  /**
   * Helper to optimize (if SVG) and save an asset to disk.
   */
  const saveAsset = (
    filePath: string,
    buffer: Buffer,
    ext: string,
    filename: string,
  ) => {
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
          fs.writeFileSync(filePath, buffer);
        } else {
          fs.writeFileSync(filePath, optimized.data);
        }
      } catch (svgoError) {
        const svgoErrorMsg =
          svgoError instanceof Error ? svgoError.message : String(svgoError);
        logger.warn(
          `SVGO optimization failed for extracted asset ${filename}: ${svgoErrorMsg}`,
        );
        fs.writeFileSync(filePath, buffer);
      }
    } else {
      fs.writeFileSync(filePath, buffer);
    }
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

  logger.info(`  ✓ Extracted ${extracted} assets from CSS/HTML.`);
}
