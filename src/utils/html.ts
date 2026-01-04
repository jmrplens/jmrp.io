import sanitizeHtml from "sanitize-html";
import he from "he";

/**
 * Strips all HTML tags from a string to produce plain text.
 * Useful for SEO descriptions, Schema.org, and meta tags.
 *
 * Uses 'sanitize-html' with no allowed tags.
 */
export function stripHtml(html: string | undefined | null): string {
  if (!html) return "";
  return sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    textFilter: (text) => text, // Keep text content
  });
}

/**
 * Sanitizes HTML to allow only safe tags (basic formatting).
 * Useful if we ever need to render user content safely, though
 * for static site config we often trust the input.
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html);
}

/**
 * Escapes HTML special characters to prevent XSS.
 * Uses the 'he' library.
 */
export function escapeHtml(str: string | undefined | null): string {
  if (typeof str !== "string") return "";
  return he.encode(str);
}

/**
 * Decodes HTML entities back to their original characters.
 * Uses the 'he' library.
 */
export function decodeHtml(str: string | undefined | null): string {
  if (typeof str !== "string") return "";
  return he.decode(str);
}
