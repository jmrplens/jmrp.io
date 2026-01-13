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
 * Handles null/undefined inputs gracefully.
 */
export function sanitize(html: string | undefined | null): string {
  if (!html) return "";
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
      "sub",
      "sup",
      "small",
    ],
    allowedAttributes: {
      a: ["href", "name", "target", "rel", "title"],
      span: ["class", "title"],
      cite: ["title"],
    },
    // Ensure only safe protocols are used
    allowedSchemes: ["http", "https", "mailto", "tel"],
    // Enable protocol-relative URLs (//example.com)
    allowProtocolRelative: true,
    // Automatically add security attributes to links
    transformTags: {
      a: (tagName, attribs) => {
        // Check for external links including protocol-relative URLs
        const isExternal =
          (attribs.href &&
            (attribs.href.startsWith("http") ||
              attribs.href.startsWith("//"))) ||
          attribs.target === "_blank";

        if (isExternal) {
          // Merge rel tokens instead of overwriting
          const existingRel = attribs.rel || "";
          const relTokens = new Set(
            existingRel.split(/\s+/).filter((t) => t.length > 0),
          );
          relTokens.add("noopener");
          relTokens.add("noreferrer");
          const mergedRel = [...relTokens].join(" ");

          return {
            tagName,
            attribs: {
              ...attribs,
              target: "_blank",
              rel: mergedRel,
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
 * @throws {TypeError} If data contains circular references
 */
export function safeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) {
    return "null";
  }
  return json
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`);
}
