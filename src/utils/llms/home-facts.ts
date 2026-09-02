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
import type { GitHubRepo } from "@utils/github";

/**
 * The hero's `~/whoami` card, as header lines.
 *
 * The three dotted keys are copied verbatim: they are metric IDENTIFIERS, the
 * name of the figure rather than a word about it, and they are published as
 * they are for the same reason `/projects/index.md` publishes `Language: Go`
 * inside its Spanish twin. `Focus`/`Base` are header keys and are localized,
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
 * The featured projects, with the figures the page shows on each card.
 *
 * `Stars:` and `Language:` stay English in both locales, like every other
 * field key in the twins: `/projects/index.md` already publishes
 * `Language: Go` in its Spanish copy, and `documentHeader` states the rule —
 * the keys are the schema, the values are the language.
 *
 * The description is the REPOSITORY's own, which is the string carrying
 * "850+ GitLab actions (1,000+ Enterprise)". It stays English on the Spanish
 * twin because that is what the Spanish page shows: the GitHub API does not
 * localize it. `/projects/` is not a second copy of it — that page publishes
 * the curated description from `projects.yaml`, which is why "850+" reached
 * no generated markdown document at all.
 *
 * A repository the fetch could not reach degrades to name and URL alone, the
 * shape this list had before, rather than dropping the project.
 *
 * @param names - `featured_projects` from site.yaml, in its own order.
 * @param repos - Whatever the shared GitHub fetch returned, in any order.
 * @returns Markdown list lines.
 */
export function featuredProjectLines(
  names: readonly string[],
  repos: readonly GitHubRepo[],
): string[] {
  const byName = new Map(repos.map((repo) => [repo.name, repo]));
  return names.flatMap((name) => {
    const repo = byName.get(name);
    const facts = [
      repo ? `Stars: ${repo.stargazers_count}` : undefined,
      repo?.language ? `Language: ${repo.language}` : undefined,
    ].filter((fact): fact is string => fact !== undefined);
    // Hoisted rather than interpolated inline: a template literal nested
    // inside another is `sonarjs/no-nested-template-literals`, an error here.
    const url = repo?.html_url ?? `https://github.com/jmrplens/${name}`;
    return [
      `- ${name} — ${url}`,
      ...(facts.length > 0 ? [`  ${facts.join(" · ")}`] : []),
      ...(repo?.description ? [`  ${repo.description}`] : []),
    ];
  });
}
