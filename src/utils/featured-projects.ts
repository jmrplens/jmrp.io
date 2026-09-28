/**
 * The homepage's featured project cards, resolved once for the page AND its
 * markdown twin.
 *
 * Two sources, each chosen so the homepage cannot contradict /projects/:
 *
 * - **Which projects**: `featured_projects` in `site.yaml`, in its order.
 * - **Words**: `projects.yaml`, the curated bilingual copy /projects/ renders
 *   (`cardSummary` when a project's `summary` is too long for a card, else
 *   `summary`). The GitHub description used before was English-only, so the
 *   Spanish homepage showed English prose.
 *
 * No star counts, by the owner's decision (2026-09-26): featured projects
 * are chosen for what they say about the work, and a star count next to a
 * young or niche project reads as a verdict. /projects/ shows them live.
 *
 * @module
 */
import { asContributionsDataset } from "@components/projects/dataset-types";
import rawContributionsData from "@data/ghc/projects-contributions.json";
import type { Locale } from "@i18n/config";
import { useTranslations } from "@i18n/utils";
import { featuredRepos } from "@utils/github-facts";
import { getProjects } from "@utils/projects";

/** One featured card, already localized. */
export interface FeaturedProjectCard {
  /** GitHub repository name, shown under the title when it differs. */
  readonly id: string;
  /** Display name from `projects.yaml` (the one /projects/ prints). */
  readonly name: string;
  /** Repository page the card links to. */
  readonly url: string;
  /** Curated language from `projects.yaml` (the one /projects/ prints). */
  readonly language: string | null;
  /** GitHub's language name for the colour dot, when it differs. */
  readonly githubLanguage: string | null;
  /** Localized one-paragraph summary. */
  readonly summary: string | null;
}

/**
 * The featured cards for one locale, in `site.yaml` order. A name missing
 * from `projects.yaml` still renders from the GitHub data alone, and one the
 * API could not reach still renders from `projects.yaml` alone.
 *
 * @param names - `featured_projects` from `site.yaml`.
 * @param locale - Which language the summaries are in.
 * @returns One card per name that either source knows.
 */
export async function featuredProjectCards(
  names: readonly string[],
  locale: Locale,
): Promise<FeaturedProjectCard[]> {
  const [projects, repos] = await Promise.all([
    getProjects(),
    featuredRepos(names),
  ]);
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const repoByName = new Map(repos.map((r) => [r.name, r]));

  return names.flatMap((id) => {
    const project = projectById.get(id);
    const repo = repoByName.get(id);
    if (!project && !repo) return [];
    const summary = project
      ? (project.cardSummary ?? project.summary)[locale]
      : repo?.description;
    return [
      {
        id,
        name: project?.name ?? id,
        url:
          repo?.html_url ??
          project?.repo ??
          `https://github.com/jmrplens/${id}`,
        language: project?.language ?? repo?.language ?? null,
        githubLanguage: repo?.language ?? null,
        summary: summary ?? null,
      },
    ];
  });
}

/**
 * "I also contribute code and documentation to other open-source projects,
 * such as A, B and C", for the homepage and its markdown twin.
 *
 * BUILD-TIME on purpose, from the same dataset /projects/contributions/
 * renders (`src/data/ghc/projects-contributions.json`): the homepage is
 * served from the edge cache, and a live `PRJ_*` token would send every
 * request back to nginx. The names are the three most-starred projects with
 * merged code or docs, the order the dataset already carries.
 *
 * @param locale - Which language to write it in.
 * @returns The sentence, or `null` when no project has merged work.
 */
export function upstreamSummary(locale: Locale): string | null {
  const t = useTranslations(locale);
  const rows = asContributionsDataset(rawContributionsData).contributedTo;
  if (rows.length === 0) return null;
  // No counts on the homepage: it is edge-cached and rebuilt rarely, so a
  // number would age in plain sight. The names are the evidence, and the
  // subpage carries the figures.
  return t("pages.home.upstreamStrip", {
    names: new Intl.ListFormat(locale, {
      style: "long",
      type: "conjunction",
    }).format(rows.slice(0, 3).map((row) => row.project)),
  });
}
