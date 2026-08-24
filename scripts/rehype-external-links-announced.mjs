import { visit } from "unist-util-visit";

/**
 * Announces "opens in new tab" on the external links of MDX prose, and marks
 * them so CSS can add the ↗ glyph.
 *
 * ── Why a plugin of our own ───────────────────────────────────────────────
 * `rehype-external-links` can already inject content, but two of its shapes do
 * not fit here:
 *
 *   * Its `properties` option is `(element) => Properties` — it never sees the
 *     file. This site is bilingual and ONE markdown pipeline renders both
 *     locales, so a literal notice would ship English text into the Spanish
 *     posts. A rehype transform receives `(tree, file)`, and Astro builds that
 *     vfile with the source path (`@astrojs/markdown-remark/dist/index.js:86`,
 *     `new VFile({ path: renderOpts?.fileURL })`), which is what tells the two
 *     locales apart.
 *   * Its `content` option inserts a real `<span>` INSIDE the anchor. That text
 *     travels with a copy-paste of the paragraph, which is precisely what the
 *     `aria-label` approach exists to avoid. The glyph is left to CSS, whose
 *     generated content is not copied.
 *
 * ── Order matters ─────────────────────────────────────────────────────────
 * This must run AFTER `rehype-external-links` (which sets target/rel, and is
 * how a link is recognized as external here) and AFTER
 * `rehypeLinkDisambiguator`. The disambiguator only labels links whose text is
 * ambiguous, and it guards with `!node.properties.ariaLabel`: if this plugin
 * ran first, every external link would already carry a label and the
 * disambiguation would never happen again.
 *
 * ── What it does NOT reach ────────────────────────────────────────────────
 * Raw `<a>` written as HTML inside MDX never becomes part of this tree — it
 * reaches the compiler as JSX. Those anchors are announced by hand in the MDX.
 */

/** Locale of a source file, read from the `posts/<locale>/` path segment. */
function localeFromPath(path) {
  return typeof path === "string" &&
    /[\\/](?:posts|tools)[\\/]es[\\/]/.test(path)
    ? "es"
    : "en";
}

/** The notice appended to the visible text, per locale. */
const NOTICE = {
  en: "(opens in new tab)",
  es: "(se abre en nueva pestaña)",
};

/**
 * Visible text of a link, as a screen reader would read it.
 *
 * Recurses so `[`code`](url)` and `**[bold](url)**` keep their words, takes the
 * `alt` of an image so a badge link is not left nameless, and skips subtrees
 * marked `aria-hidden` so a decorative glyph does not leak into the label.
 *
 * @param {object} node - HAST node.
 * @returns {string} Concatenated visible text.
 */
function visibleText(node) {
  if (node.type === "text") return node.value;
  if (node.properties?.ariaHidden === "true") return "";
  if (node.tagName === "img") return node.properties?.alt ?? "";
  if (node.children) return node.children.map(visibleText).join("");
  return "";
}

/**
 * Rehype transform. See the module docblock for why this exists.
 *
 * @returns {(tree: object, file: object) => void} The transform.
 */
export const rehypeExternalLinksAnnounced = () => (tree, file) => {
  const notice = NOTICE[localeFromPath(file?.path ?? file?.history?.at(-1))];

  visit(tree, "element", (node) => {
    if (node.tagName !== "a") return;
    const props = node.properties;
    if (!props || props.target !== "_blank") return;

    // Whatever the accessible name is right now — the visible text, or the
    // disambiguated label a previous plugin already set — the notice is
    // APPENDED to it. `aria-label` replaces the accessible name instead of
    // extending it, so dropping the existing value would break WCAG 2.5.3
    // Label in Name (level A) while chasing 3.2.5 (AAA): a worse trade.
    const current =
      typeof props.ariaLabel === "string" && props.ariaLabel.trim()
        ? props.ariaLabel.trim()
        : visibleText(node).trim();

    // A link with no readable text at all (a bare icon in prose) is left for a
    // human: inventing a name here would hide the problem rather than fix it.
    if (!current) return;

    props.ariaLabel = `${current} ${notice}`;

    // Marks the anchor so `.external-link::after` can add the ↗. A class, not
    // an injected node, keeps the glyph out of the copy-paste.
    const className = props.className ?? [];
    props.className = [
      ...(Array.isArray(className) ? className : [className]),
      "external-link",
    ];
  });
};
