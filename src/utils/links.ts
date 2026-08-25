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
 * Pass `announcedLabel` to also emit the "opens in new tab" warning (WCAG
 * 3.2.5). Build it with `t("aria.opensNewTab", { text: visibleText })`, the key
 * Header, NavDrawer and StateNotice already use — it interpolates as
 * "{text} (opens in new tab)". Taking the finished string keeps this helper
 * free of an i18n dependency. It is opt-in because an icon-only link has no
 * visible text to preserve and needs its own descriptive label instead.
 *
 * @param href - The link target.
 * @param announcedLabel - Ready-made accessible name, visible text FIRST.
 * @returns The attribute object, empty when the link is internal.
 */
export function externalLinkProps(
  href: string,
  announcedLabel?: string,
): Record<string, string> {
  if (!isExternalHref(href)) return {};
  const base = { target: "_blank", rel: "external noopener noreferrer" };
  if (!announcedLabel) return base;
  // Putting the visible text first is load-bearing: `aria-label` replaces the
  // accessible name rather than extending it, so a label that dropped it would
  // break WCAG 2.5.3 Label in Name (level A) while chasing 3.2.5 (AAA) — a
  // worse trade. keyboard.accessibility.spec.ts already asserts that a link's
  // aria-label contains its visible text.
  return { ...base, "aria-label": announcedLabel };
}
