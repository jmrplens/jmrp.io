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
