/**
 * Rewrites root-relative markdown links as absolute URLs.
 *
 * A markdown twin is read away from the site: in a corpus, a chat context or
 * a file on disk, where `](/homelab/)` resolves nowhere. The post and tool
 * twins kept the MDX's own `[text](/blog/...)` links verbatim, 17 per locale,
 * while every URL the generators write themselves is absolute (twin audit
 * 2026-09-27, W10).
 *
 * A leaf on purpose (no imports), so `scripts/ci/absolute-links.test.mjs`
 * can load it directly.
 *
 * What it rewrites: inline links and images `](/path)`, and reference
 * definitions `[id]: /path`. What it leaves alone: protocol-relative `//host`
 * URLs, fragments and relative paths, and anything inside a fenced code block
 * or an inline code span, where `](/` is sample text, not a link.
 *
 * @module
 */

/** An inline link or image destination that starts at the site root. */
const INLINE_LINK = /\]\(\/(?!\/)/gu;

/** A reference definition whose destination starts at the site root. */
const REFERENCE_DEFINITION = /^(\s{0,3}\[[^\]]+\]:\s*<?)\/(?!\/)/u;

/** A fence opener or closer: three or more backticks or tildes. */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/u;

/**
 * Rewrites the links on one line outside inline code spans.
 *
 * @param line - One line of prose.
 * @param origin - Absolute site origin, without a trailing slash.
 * @returns The line with root-relative destinations made absolute.
 */
function absolutizeLine(line: string, origin: string): string {
  const defined = line.replace(
    REFERENCE_DEFINITION,
    (_match, lead: string) => `${lead}${origin}/`,
  );
  // Split on backtick runs: even-indexed parts are outside code spans. A run
  // of N backticks opens a span that only a run of the same length closes,
  // which is rarer in prose than the approximation below is wrong.
  const parts = defined.split(/(`+)/u);
  let inCode = false;
  let opener = "";
  return parts
    .map((part) => {
      if (/^`+$/u.test(part)) {
        if (!inCode) {
          inCode = true;
          opener = part;
        } else if (part === opener) {
          inCode = false;
        }
        return part;
      }
      return inCode ? part : part.replaceAll(INLINE_LINK, () => `](${origin}/`);
    })
    .join("");
}

/**
 * Makes every root-relative link in a markdown document absolute.
 *
 * @param markdown - The document.
 * @param siteUrl - Absolute site origin (a trailing slash is tolerated).
 * @returns The document with root-relative link destinations made absolute.
 */
export function absolutizeRootLinks(markdown: string, siteUrl: string): string {
  let origin = siteUrl;
  while (origin.endsWith("/")) origin = origin.slice(0, -1);
  let fence: string | null = null;
  return markdown
    .split("\n")
    .map((line) => {
      const marker = FENCE.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker;
        else if (marker.startsWith(fence[0]) && marker.length >= fence.length)
          fence = null;
        return line;
      }
      return fence === null ? absolutizeLine(line, origin) : line;
    })
    .join("\n");
}
