import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Writes the provided HTML content to a file, cleaning up empty boolean attributes
 * that can cause validation issues (e.g., async="" becomes async).
 *
 * @param {string} filePath - Absolute path to the destination file.
 * @param {string} html - HTML content to write.
 */
export function writeHtml(filePath: string, html: string) {
  const cleaned = html.replace(
    / (inert|download|disabled|checked|readonly|required|multiple|async|autofocus|autoplay|controls|default|defer|formnovalidate|ismap|itemscope|loop|nomodule|novalidate|open|playsinline|reversed|scoped|selected)=""/g,
    " $1",
  );
  fs.writeFileSync(filePath, cleaned, "utf-8");
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
 * Generates a SHA-512 integrity hash for the specified file.
 * Uses a cache to avoid re-reading and re-hashing identical files.
 *
 * @param {string} filePath - Path to the file to hash.
 * @param {Map<string, string>} cache - Cache map storing filePath -> hash.
 * @returns {string} The integrity hash in 'sha512-...' format.
 */
export function getFileHash(
  filePath: string,
  cache: Map<string, string>,
): string {
  if (cache.has(filePath)) return cache.get(filePath)!;
  const content = fs.readFileSync(filePath);
  const hash = `sha512-${crypto.createHash("sha512").update(content).digest("base64")}`;
  cache.set(filePath, hash);
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

  let filePath;
  if (cleanUrl.startsWith("/")) {
    filePath = path.join(distDir, cleanUrl);
  } else {
    filePath = path.resolve(baseDir, cleanUrl);
  }

  const rel = path.relative(distDir, filePath);
  if (rel.startsWith("..")) return null;

  return fs.existsSync(filePath) ? filePath : null;
}
