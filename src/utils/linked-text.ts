/**
 * Links inside plain prose that is authored as data (a FAQ answer in YAML),
 * kept as a phrase plus a URL beside the text rather than as markup in it:
 * the FAQPage node and every check that reads the answer still see plain
 * text, and only the HTML page and the markdown twin render the link.
 *
 * Pure and import-free, so `scripts/ci/linked-text.test.mjs` runs it under
 * `node --test`.
 *
 * @module
 */

/** A phrase of the text and where it links. */
export interface TextLink {
  /** The words to link, exactly as the text writes them. */
  text: string;
  href: string;
}

/** One run of the text: linked when it has an `href`. */
export interface TextSegment {
  text: string;
  href?: string;
}

/**
 * Splits text at the first occurrence of each link's phrase.
 *
 * @param text - The prose.
 * @param links - The phrases to link; none returns the text whole.
 * @returns The runs, in order; joined, their `text` is the input.
 * @throws When a phrase is not in the text (a typo would silently drop the
 *   link) or two phrases overlap.
 */
export function linkSegments(
  text: string,
  links: readonly TextLink[] = [],
): TextSegment[] {
  const found = links
    .map((link) => {
      const start = text.indexOf(link.text);
      if (link.text === "" || start === -1)
        throw new Error(`Link phrase "${link.text}" is not in: ${text}`);
      return { ...link, start, end: start + link.text.length };
    })
    .sort((a, b) => a.start - b.start);

  const segments: TextSegment[] = [];
  let at = 0;
  for (const link of found) {
    if (link.start < at)
      throw new Error(
        `Link phrase "${link.text}" overlaps another in: ${text}`,
      );
    if (link.start > at) segments.push({ text: text.slice(at, link.start) });
    segments.push({ text: link.text, href: link.href });
    at = link.end;
  }
  if (at < text.length || segments.length === 0)
    segments.push({ text: text.slice(at) });
  return segments;
}

/**
 * The same text as markdown, each linked phrase written `[phrase](href)`.
 *
 * @param text - The prose.
 * @param links - The phrases to link.
 * @returns The markdown line.
 */
export function linkedMarkdown(
  text: string,
  links: readonly TextLink[] = [],
): string {
  return linkSegments(text, links)
    .map((segment) =>
      segment.href ? `[${segment.text}](${segment.href})` : segment.text,
    )
    .join("");
}
