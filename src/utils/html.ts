import he from "he";
import sanitizeHtml from "sanitize-html";

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
 * Explicitly configured with a safe allowlist for better maintainability.
 */
export function sanitize(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "b",
      "i",
      "em",
      "strong",
      "a",
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "code",
      "span",
      "cite",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      span: ["class"],
    },
    // Ensure only safe protocols are used
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Automatically add security attributes to links
    transformTags: {
      a: (tagName, attribs) => {
        const isExternal =
          attribs.href &&
          (attribs.href.startsWith("http") || attribs.href.startsWith("//"));

        if (isExternal) {
          return {
            tagName,
            attribs: {
              ...attribs,
              target: "_blank",
              rel: "noopener noreferrer",
            },
          };
        }
        return { tagName, attribs };
      },
    },
  });
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

/**
 * Safely stringifies an object for use in a <script type="application/ld+json"> tag.
 * Prevents XSS by escaping the < and > characters.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`);
}
