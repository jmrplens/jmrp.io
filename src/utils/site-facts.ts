/**
 * Figures about the author's public footprint that prose on the site quotes,
 * fetched once per build so no page can carry a number another page contradicts.
 *
 * `/about/` said "44 public repositories … more than 370 stars (September
 * 2026)" while the home page of the SAME build printed `repos.public: 50` and
 * GitHub answered 51: the sentence was typed by hand and re-typed by hand at
 * the previous audit, so it was wrong again eleven days later (GEO audit #9,
 * A2). A figure that a page can derive is never typed; the text carries a
 * placeholder and the build fills it.
 *
 * Placeholders, in `about.yaml` and `page_faq/*.yaml`:
 *
 * - `{publicRepos}`: the account's public repository count, forks included,
 *   which is what GitHub's own profile shows and what "public repositories"
 *   means to a reader who clicks through.
 * - `{ownRepos}`: the public repositories that are the author's own work,
 *   forks left out (GEO audit #10: 28 of 57 were forks).
 * - `{stars}`: stargazers summed over those own repositories, forks left out.
 *
 * When the API is unreachable both render as an em dash, the same fallback the
 * home terminal uses: a sentence with a dash in it is honest, a stale number
 * is not.
 *
 * @module
 */

import { fetchGitHubProfile, fetchOwnRepoFacts } from "./github";

/** The figures the placeholders resolve to, already formatted for prose. */
export interface SiteFacts {
  /** Public repositories of the account, forks included, or a dash. */
  publicRepos: string;
  /** Public repositories that are not forks, or a dash. */
  ownRepos: string;
  /** Stargazers summed over the account's own repositories, or a dash. */
  stars: string;
}

let cached: Promise<SiteFacts> | undefined;

/**
 * Fetches (once per process) the figures that prose placeholders resolve to.
 *
 * @returns The formatted figures.
 */
export function getSiteFacts(): Promise<SiteFacts> {
  cached ??= (async () => {
    const [profile, own] = await Promise.all([
      fetchGitHubProfile(),
      fetchOwnRepoFacts(),
    ]);
    return {
      publicRepos:
        profile.public_repos > 0 ? String(profile.public_repos) : "—",
      ownRepos: own.ownRepos > 0 ? String(own.ownRepos) : "—",
      stars: own.stars > 0 ? String(own.stars) : "—",
    };
  })();
  return cached;
}

/**
 * Replaces every `{publicRepos}` / `{ownRepos}` / `{stars}` placeholder in a
 * sentence.
 *
 * @param text - The sentence, as authored.
 * @param facts - The figures from {@link getSiteFacts}.
 * @returns The sentence with numbers in it.
 */
export function fillSiteFacts(text: string, facts: SiteFacts): string {
  // Function replacements: a plain string would have `$` patterns
  // interpreted, and the figures come from an API response.
  return text
    .replaceAll("{publicRepos}", () => facts.publicRepos)
    .replaceAll("{ownRepos}", () => facts.ownRepos)
    .replaceAll("{stars}", () => facts.stars);
}
