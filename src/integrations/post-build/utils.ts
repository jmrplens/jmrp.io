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
 * Gets the file extension from a MIME type with sanitization.
 * Maps known complex types (including fonts) and falls back to a sanitized
 * subtype extraction, ensuring safe output for arbitrary/unknown MIME types.
 *
 * @param {string} mime - The MIME type string to evaluate.
 * @returns {string} The appropriate file extension (e.g., 'png', 'svg', 'woff2') or 'bin' if unknown.
 */
export function getExtensionFromMime(mime: string): string {
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
  const cleanUrl = url.split("?", 1)[0].split("#", 1)[0];
  if (cleanUrl.startsWith("http") || cleanUrl.startsWith("//")) return null;

  const filePath = cleanUrl.startsWith("/")
    ? path.join(distDir, cleanUrl.slice(1))
    : path.resolve(baseDir, cleanUrl);

  const rel = path.relative(distDir, filePath);
  if (rel.startsWith("..")) return null;

  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Rejects any value that would break out of the quoted string it is about to be
 * interpolated into inside an Nginx `map` block.
 *
 * The redirect generators build their snippets by string interpolation and
 * write them straight to `nginx/*_redirects.conf`, which the vhost `include`s
 * at http level by absolute path. Neither generator goes through the Zod
 * content schema — `docs-redirects.ts` parses `projects.yaml` with `js-yaml`
 * directly — so this is the only place the values are checked. A single double
 * quote, backslash, semicolon or newline in a project id or a docs URL yields a
 * config Nginx refuses, and an `include` that fails to parse stops the whole
 * server from starting, not just this vhost.
 *
 * Failing the build is the right outcome: the alternative is a repo that looks
 * fine and a server that will not come back up after the next restart.
 *
 * @param values - The strings destined for the snippet.
 * @param context - Human-readable source name, used in the error message.
 * @throws If any value contains a character that is unsafe to interpolate.
 */
export function assertNginxSafe(values: string[], context: string): void {
  // `\\` va escapada de verdad: en `["\;…]` el `\;` es solo `;` y la barra
  // invertida NO entraba en la clase, así que el guard dejaba pasar justo el
  // carácter que escapa la comilla de cierre en una cadena de nginx.
  const unsafe = /["\\;\r\n]|\s{2,}/;
  for (const value of values) {
    if (unsafe.test(value)) {
      throw new Error(
        `${context}: refusing to generate an Nginx snippet from ${JSON.stringify(
          value,
        )} — it contains a character that would break the quoted map entry.`,
      );
    }
  }
}

/**
 * Writes an Nginx snippet atomically.
 *
 * The destination is `include`d by the live vhost, so a partial write — a build
 * killed between `open()` and the last chunk — leaves a truncated `map` block
 * that fails `nginx -t`. `deploy-live.mjs` only backs up and rolls back the
 * security-header snippets, so a broken redirect file would simply stay on
 * disk: the reload fails, Nginx keeps serving from memory, nothing looks wrong,
 * and the next `systemctl restart` (certbot, a reboot) takes down every vhost
 * on the box. Writing to a sibling temp file and `rename(2)`-ing over the
 * target makes the swap all-or-nothing.
 *
 * @param outPath - Absolute path of the snippet to write.
 * @param content - Full file content.
 * @returns Resolves once the file has been replaced.
 */
export async function writeNginxSnippet(
  outPath: string,
  content: string,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  await fs.promises.writeFile(tmpPath, content);
  await fs.promises.rename(tmpPath, outPath);
}
