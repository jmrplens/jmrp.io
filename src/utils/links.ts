/**
 * Shared helpers for hand-written anchors.
 *
 * Markdown links get `target`/`rel` from `rehype-external-links`
 * (see astro.config.mjs), but anchors written directly in `.astro` templates —
 * and raw HTML `<a>` in MDX, which reaches the tree as JSX — are outside that
 * plugin's reach and have to set the attributes themselves. Every component
 * that emits external links did so with its own literal, and `/about/` simply
 * forgot: five bare external anchors shipped from there (2026-08-23).
 */

/**
 * Whether a href points off-site and should therefore open in a new tab.
 *
 * Tested as "is an absolute http(s) URL" rather than "does not start with /",
 * the shape UsesPage used locally: the looser test also classifies `#anchor`
 * and `mailto:` as external, and neither wants `target="_blank"`.
 *
 * @param href - The link target, absolute or site-relative.
 * @returns True for `http://` and `https://` URLs.
 */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/**
 * `target`/`rel` for an external link, or nothing for an internal one —
 * ready to spread into an anchor: `<a href={h} {...externalLinkProps(h)}>`.
 *
 * The `rel` value matches the one `rehype-external-links` is configured with,
 * so a hand-written anchor and a markdown link render identically.
 *
 * @param href - The link target.
 * @returns The attribute object, empty when the link is internal.
 */
export function externalLinkProps(href: string): Record<string, string> {
  return isExternalHref(href)
    ? { target: "_blank", rel: "external noopener noreferrer" }
    : {};
}
