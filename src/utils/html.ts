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
 * Wraps build-time generated CSS in a `<style>` element, as a raw string.
 *
 * A component whose CSS is computed per instance used to render it as
 * `<style is:inline set:html={css}></style>`. Both halves of the toolchain
 * object to that element: Stylelint's postcss-html extracts the `<style>` from
 * the `.astro` source, finds nothing in it (the content arrives at render time)
 * and fails with `no-empty-source`, while giving it a placeholder child to
 * extract instead trades that for `astro(2006)`, which `astro check` raises as
 * a warning and the pipeline treats as an error. Emitting the tag as a string
 * through `<Fragment set:html={inlineStyleTag(css)} />` leaves no `<style>` in
 * any file Stylelint reads (`lint:css` globs `.astro` and `.css` only) and no
 * child for the compiler to warn about. The built HTML is unchanged, nonce
 * included: the post-build pass adds it by walking the built page, so how the
 * tag got there does not matter.
 *
 * @param css - Generated CSS. Trusted, build-time input only.
 * @returns The `<style>` element as a string.
 * @throws {Error} When the CSS could close the element early.
 */
export function inlineStyleTag(css: string): string {
  // `set:html` does not escape, so a closing tag inside the payload would end
  // the element early and put the rest of the CSS in the document as text.
  // Nothing generated today can contain one; this fails the build rather than
  // ship a broken page if that ever changes.
  if (/<\/style/i.test(css)) {
    throw new Error("inlineStyleTag: the CSS would close the style element");
  }
  return `<style>${css}</style>`;
}

/**
 * Strips HTML tags AND decodes entities to produce clean plain text.
 *
 * `stripHtml` (sanitize-html) HTML-encodes ampersands in its output
 * (`R&D` → `R&amp;D`). When that string is later embedded in JSON-LD, the
 * value ends up as the literal entity (`R&amp;D`) instead of `R&D`, which AI
 * parsers and screen readers read verbatim. Decoding after stripping yields
 * the intended plain text for Schema.org string values.
 */
export function stripToText(html: string | undefined | null): string {
  return he.decode(stripHtml(html));
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
      a: [
        "href",
        "name",
        // `class` is allowed for the same reason it already is on `span`: the
        // prose external-link marker is a class, and stripping it silently
        // dropped the ↗ from links written inside translated copy.
        "class",
        "target",
        "rel",
        "title",
        "aria-label",
        "aria-hidden",
        "aria-labelledby",
      ],
      span: ["class", "title", "aria-label"],
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
  if (!json) {
    return "null";
  }
  return json
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`)
    .replaceAll("\u{2028}", String.raw`\u2028`)
    .replaceAll("\u{2029}", String.raw`\u2029`);
}
