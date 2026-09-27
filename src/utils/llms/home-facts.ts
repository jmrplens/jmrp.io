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
 * The hero's `~/whoami` card, as header lines.
 *
 * The three dotted keys are copied verbatim: they are metric IDENTIFIERS, the
 * name of the figure rather than a word about it, so they are published as
 * they are in both locales. `Focus`/`Base` are header keys and are localized,
 * following `Status:`/`Role:` — which the twin has always localized in the
 * Spanish document, even though the page renders `role` as a lowercase
 * `<dt>`, exactly as it renders `focus` and `base`. The twin's header keys
 * are its own schema, not a transcription of the card's typography.
 *
 * `downloads.total` carries the exact integer rather than the page's rounded
 * form: the rounding exists to fit a terminal widget, the compact form is
 * derivable from the integer and not the reverse, and taking the raw value
 * avoids duplicating `formatCompact`, which lives unexported in
 * `HomePage.astro`.
 *
 * A figure that resolves to nothing is omitted rather than printed. Both
 * surfaces treat `0` as unknown: `fetchGitHubProfile`'s offline fallback
 * reports `public_repos: 0` and the page renders an em dash there, so in a
 * machine surface the honest form is no line at all.
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
  publicRepos: number;
  lastPostDate?: string;
}): string[] {
  return [
    ...(facts.focus ? [`${facts.focusLabel}: ${facts.focus}`] : []),
    ...(facts.base ? [`${facts.baseLabel}: ${facts.base}`] : []),
    ...(facts.downloadsTotal > 0
      ? [`downloads.total: ${facts.downloadsTotal}`]
      : []),
    ...(facts.publicRepos > 0 ? [`repos.public: ${facts.publicRepos}`] : []),
    ...(facts.lastPostDate ? [`last.post: ${facts.lastPostDate}`] : []),
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
      `- ${card.id}: ${card.url}`,
      ...(facts.length > 0 ? [`  ${facts.join(" · ")}`] : []),
      ...(card.summary ? [`  ${card.summary}`] : []),
    ];
  });
}
