/**
 * The homepage's own figures, rendered for its markdown twin.
 *
 * A leaf on purpose: it imports one type and nothing else, so the exact lines
 * it produces can be checked by loading the module directly and feeding it
 * the values scraped out of the built page. The twin itself only exists after
 * a full build, and on this host a build is a deploy.
 *
 * Every localized label arrives as a parameter, so all Spanish copy stays in
 * `@utils/llms`, which is the path cspell's `es,en` override names.
 */
import type { FeaturedProjectCard } from "@utils/featured-projects";

/**
 * The hero's `~/whoami` terminal, as header lines.
 *
 * `Focus`/`Base` are header keys and are localized, following
 * `Status:`/`Role:`. The two figures keep dotted metric identifiers, the name
 * of the figure rather than a word about it, published as they are in both
 * locales: `downloads.total` (the exact integer; the page rounds it to fit a
 * tile, and the compact form is derivable from the integer, not the
 * reverse) and `repos.own` (public repositories that are not forks, the
 * figure /about/ also states).
 *
 * A figure that resolves to nothing is omitted rather than printed: the page
 * renders an em dash there, so in a machine surface the honest form is no
 * line at all.
 *
 * @param facts - Already-resolved values plus the two localized labels.
 * @returns Header lines, in the card's own order.
 */
export function whoamiFactLines(facts: {
  focusLabel: string;
  focus?: string;
  baseLabel: string;
  base?: string;
  downloadsTotal: number;
  ownRepos: string;
}): string[] {
  return [
    ...(facts.focus ? [`${facts.focusLabel}: ${facts.focus}`] : []),
    ...(facts.base ? [`${facts.baseLabel}: ${facts.base}`] : []),
    ...(facts.downloadsTotal > 0
      ? [`downloads.total: ${facts.downloadsTotal}`]
      : []),
    ...(/^\d+$/.test(facts.ownRepos) ? [`repos.own: ${facts.ownRepos}`] : []),
  ];
}

/**
 * The featured projects, with the facts the page shows on each card.
 *
 * The `Language` label arrives localized, like `Focus` and `Base` above: the
 * Spanish twin used to print `Language: Go` under Spanish summaries (twin
 * audit 2026-09-27, W8), while the CV twin already localized its field
 * labels. Only `documentHeader`'s own keys stay fixed across locales.
 *
 * The cards arrive already resolved by `@utils/featured-projects`, the one
 * accessor the page itself renders, so the twin cannot print a summary the
 * page beside it does not show. The summary is the curated, localized copy
 * from `projects.yaml` (the Spanish twin is Spanish).
 *
 * @param cards - The resolved cards, in `featured_projects` order.
 * @param languageLabel - The localized "Language" label.
 * @returns Markdown list lines.
 */
export function featuredProjectLines(
  cards: readonly FeaturedProjectCard[],
  languageLabel: string,
): string[] {
  return cards.flatMap((card) => {
    const facts = [
      card.language ? `${languageLabel}: ${card.language}` : undefined,
    ].filter((fact): fact is string => fact !== undefined);
    return [
      `- ${card.name}: ${card.url}`,
      ...(facts.length > 0 ? [`  ${facts.join(" · ")}`] : []),
      ...(card.summary ? [`  ${card.summary}`] : []),
    ];
  });
}
