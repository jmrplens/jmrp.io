import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * writeHtml: Helper to write HTML with cleanup for boolean attributes
 */
export function writeHtml(filePath: string, html: string) {
  const cleaned = html.replace(
    / (inert|download|disabled|checked|readonly|required|multiple|async|autofocus|autoplay|controls|default|defer|formnovalidate|ismap|itemscope|loop|nomodule|novalidate|open|playsinline|reversed|scoped|selected)=""/g,
    " $1",
  );
  fs.writeFileSync(filePath, cleaned, "utf-8");
}

/**
 * getExtensionFromMime: Helper to get extension from mime type
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
 * getFileHash: Helper to generate sha512 hash
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
 * resolveFile: Helper to resolve URL to local file path
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
