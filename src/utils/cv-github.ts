/**
 * Web-side re-export of the CV GitHub-stats helpers.
 *
 * The implementation lives in `scripts/cv/github-stats.mjs` so it is shared with
 * the ATS LaTeX generator (plain Node). This wrapper exposes it to the Astro CV
 * page via the `@utils` alias.
 *
 * @module
 */

export {
  fetchRepoStats,
  formatStats,
  githubSlug,
} from "../../scripts/cv/github-stats.mjs";
