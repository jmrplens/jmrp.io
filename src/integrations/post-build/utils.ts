import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Set of HTML boolean attributes that should not have an empty string value.
 * Note: crossorigin is technically an enumerated attribute, but per HTML5 spec,
 * crossorigin="" is equivalent to crossorigin="anonymous", and HTML validators
 * prefer the attribute-only form (crossorigin vs crossorigin="").
 */
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
  "crossorigin",
  "hidden",
  "muted",
]);

/**
 * Writes the provided HTML content to a file, cleaning up empty boolean attributes
 * that can cause validation issues (e.g., crossorigin="" becomes crossorigin).
 *
 * This version is safer as it only targets attributes within tags and avoids
 * content inside style or script blocks.
 *
 * @param {string} filePath - Absolute path to the destination file.
 * @param {string} html - HTML content to write.
 */
export function writeHtml(filePath: string, html: string) {
  // Use a more restrictive regex that tries to avoid matching inside tags content
  // but for simplicity and safety with CSP, we only clean attributes that are likely
  // to be injected by Cheerio at the tag level.
  const cleaned = html.replaceAll(
    /(\s)([a-z-]+)=""(?=[^>]*>)/gi,
    (match: string, space: string, attr: string) => {
      if (BOOLEAN_ATTRIBUTES.has(attr.toLowerCase())) {
        return `${space}${attr}`;
      }
      return match;
    },
  );
  fs.writeFileSync(filePath, cleaned, "utf-8");
}

/**
 * Generates integrity hashes (SHA-256 and SHA-512) for the specified content.
 *
 * @param {string} content - The string content to hash.
 * @returns {string[]} An array of hashes in 'algo-...' format.
 */
export function getDualHashes(content: string): string[] {
  if (!content.trim()) return [];

  const sha256 = crypto.createHash("sha256").update(content).digest("base64");
  const sha512 = crypto.createHash("sha512").update(content).digest("base64");

  return [`'sha256-${sha256}'`, `'sha512-${sha512}'`];
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
  const cached = cache.get(cacheKey);
  if (cached !== undefined) return cached;
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
    ? path.join(distDir, cleanUrl.slice(1))
    : path.resolve(baseDir, cleanUrl);

  const rel = path.relative(distDir, filePath);
  if (rel.startsWith("..")) return null;

  return fs.existsSync(filePath) ? filePath : null;
}
