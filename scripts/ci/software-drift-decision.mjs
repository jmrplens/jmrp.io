/**
 * The pass/fail decision of `check-software-drift.mjs`, kept apart from the
 * network code so it is tested without fetching anything.
 *
 * @module
 */

/**
 * Divergences the author decided to keep, matched by project id and property
 * (never by text, so rewording the summary cannot silently lift or hide the
 * exception). An accepted divergence is still printed, as "accepted".
 *
 * gitlab-mcp-server: the action count in `summary.en` and the tool count on
 * its docs site measure different GitLab tiers, so both are true (author
 * decision, 2026-09-03; see `src/content/profile/projects.yaml`).
 *
 * @type {Readonly<Record<string, {properties: readonly string[], reason: string, decided: string}>>}
 */
export const ACCEPTED_DIVERGENCES = Object.freeze({
  "gitlab-mcp-server": Object.freeze({
    properties: Object.freeze(["description"]),
    reason:
      "the action count and the tool count measure different GitLab tiers",
    decided: "2026-09-03",
  }),
});

/**
 * Splits a project's divergent properties into contradictions and accepted
 * ones. Pure.
 *
 * @param {string} projectId - Project id from projects.yaml.
 * @param {readonly string[]} properties - Properties whose values differ.
 * @param {typeof ACCEPTED_DIVERGENCES} [accepted] - Exception table.
 * @returns {{contradicting: string[], accepted: string[]}} The split.
 */
export function classifyDivergences(
  projectId,
  properties,
  accepted = ACCEPTED_DIVERGENCES,
) {
  const allowed = new Set(accepted[projectId]?.properties);
  return {
    contradicting: properties.filter((p) => !allowed.has(p)),
    accepted: properties.filter((p) => allowed.has(p)),
  };
}

/**
 * Exit code for a run. Only an undeclared contradiction fails; an unreadable
 * site says nothing about drift, so an offline CI must not go red on it
 * (GEO audit #12, M1: the script used to exit 0 unconditionally, so a
 * contradiction could never stop anything).
 *
 * @param {{contradictions: number}} counts - Tallies of the run.
 * @returns {0 | 1} Process exit code.
 */
export function exitCodeFor({ contradictions }) {
  return contradictions > 0 ? 1 : 0;
}

/**
 * Why a project is left out of the comparison, or `null` when it is compared.
 * Pure.
 *
 * Two kinds are skipped:
 * - A project whose `docs` is its own repository's README anchor has no
 *   separate site to contradict anything, so it is skipped silently, as it
 *   always was (`quiet: true`).
 * - A project with no public repository (`status: upcoming`) is skipped with
 *   a line saying so. The comparison is built around the repository: `url`
 *   and `codeRepository` both are the repo in projects.yaml, and the sameAs
 *   check starts from it. A site that already publishes a node for such a
 *   project stays unchecked until its repository is public.
 *
 * @param {{ id: string, status?: string, repo?: string, docs: string }} project
 *   The project as authored in projects.yaml.
 * @returns {{ quiet: boolean, reason: string } | null} The skip, or `null`.
 */
export function driftSkip(project) {
  if (!project.repo) {
    return {
      quiet: false,
      reason: `no public repository${project.status ? ` (status: ${project.status})` : ""}, not compared`,
    };
  }
  if (project.docs.startsWith(`${project.repo}#`)) {
    return { quiet: true, reason: "documentation is the repository README" };
  }
  return null;
}
