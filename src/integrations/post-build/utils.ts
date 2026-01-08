import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Writes the provided HTML content to a file, cleaning up empty boolean attributes
 * that can cause validation issues (e.g., async="" becomes async).
 *
 * @param {string} filePath - Absolute path to the destination file.
 * @param {string} html - HTML content to write.
 */
export function writeHtml(filePath: string, html: string) {
  const BOOLEAN_ATTRIBUTES = new Set([
    "inert",
    "download",
    "disabled",
    "checked",
    "readonly",
    "required",
    "multiple",
    "async",
    "autofocus",
    "autoplay",
    "controls",
    "default",
    "defer",
    "formnovalidate",
    "ismap",
    "itemscope",
    "loop",
    "nomodule",
    "novalidate",
    "open",
    "playsinline",
    "reversed",
    "scoped",
    "selected",
  ]);

  // Use a simpler regex and check the set in the callback
  const cleaned = html.replaceAll(
    / ([a-z]+)=""/g,
    (match: string, attr: string) => {
      if (BOOLEAN_ATTRIBUTES.has(attr)) {
        return ` ${attr}`;
      }
      return match;
    },
  );
  fs.writeFileSync(filePath, cleaned, "utf8");
}

/**
 * Resolves a MIME type to a corresponding file extension.
 *
 * @param {string} mimeType - The MIME type string to evaluate.
 * @returns {string} The appropriate file extension (e.g., 'png', 'svg') or 'bin' if unknown.
 */
export function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes("svg")) return "svg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("webp")) return "webp";
  return "bin";
}

/**
 * Generates an integrity hash for the specified file.
 * Uses a cache to avoid re-reading and re-hashing identical files.
 *
 * @param {string} filePath - Path to the file to hash.
 * @param {Map<string, string>} cache - Cache map storing filePath -> hash.
 * @param {"sha384" | "sha512"} algorithm - The hashing algorithm to use (default: sha512).
 * @returns {string} The integrity hash in 'algo-...' format.
 */
export function getFileHash(
  filePath: string,
  cache: Map<string, string>,
  algorithm: "sha384" | "sha512" = "sha512",
): string {
  const cacheKey = `${filePath}:${algorithm}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;
  const content = fs.readFileSync(filePath);
  const hash = `${algorithm}-${crypto.createHash(algorithm).update(content).digest("base64")}`;
  cache.set(cacheKey, hash);
  return hash;
}

/**
 * Resolves a URL or relative path to an absolute path within the distribution directory.
 * Filters out external URLs (http/https).
 *
 * @param {string} url - The URL or path to resolve.
 * @param {string} baseDir - The directory containing the file that references the URL.
 * @param {string} distDir - The project's distribution (output) directory.
 * @returns {string | null} The absolute local file path, or null if it's external or doesn't exist.
 */
export function resolveFile(
  url: string,
  baseDir: string,
  distDir: string,
): string | null {
  const cleanUrl = url.split("?")[0].split("#")[0];
  if (cleanUrl.startsWith("http") || cleanUrl.startsWith("//")) return null;

  const filePath = cleanUrl.startsWith("/")
    ? path.join(distDir, cleanUrl)
    : path.resolve(baseDir, cleanUrl);

  const rel = path.relative(distDir, filePath);
  if (rel.startsWith("..")) return null;

  return fs.existsSync(filePath) ? filePath : null;
}
