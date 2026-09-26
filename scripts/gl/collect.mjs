/**
 * Collects the owner's GitLab.com contributions: authored merge requests and
 * issues, the public projects they landed in (with star counts), and the
 * GitLab achievements on the profile.
 *
 * Privacy boundary, mirroring the GitHub side's roster allowlist: the token
 * belongs to the owner and can read private projects he is a member of, so
 * an item is kept only when its project answers `visibility: "public"`; a
 * confidential issue is dropped at normalization; and the owner's own
 * namespaces (`contributions.yaml` `gitlab.excludeNamespaces`, his GitHub
 * mirrors) never count as contributions to someone else's project.
 *
 * @module
 */

import { runWithConcurrency } from "../ghc/concurrency.mjs";
import {
  isOwnNamespace,
  normalizeAchievement,
  normalizeItem,
} from "./normalize.mjs";

/** How many GitLab requests may run at once. */
const CONCURRENCY = 3;

/**
 * @typedef {object} GitlabSettings
 * @property {string} username - GitLab username (`jmrp`).
 * @property {number} userId - Numeric user id, for `author_id`.
 * @property {string[]} excludeNamespaces - Own top-level namespaces.
 */

/**
 * @typedef {object} GitlabProject
 * @property {string} fullName - Full path.
 * @property {string} name - GitLab's display name.
 * @property {number | null} stars - `star_count`.
 * @property {string} webUrl
 */

/**
 * @typedef {object} GitlabPart
 * @property {string} fetchedAt - ISO timestamp of this collection.
 * @property {string} username
 * @property {Omit<import('./normalize.mjs').GitlabLedgerItem, 'projectId'>[]} items
 *   Public, non-own items, newest created first.
 * @property {GitlabProject[]} projects - Every project an item belongs to.
 * @property {Omit<import('./normalize.mjs').GitlabAchievement, 'image'>[]} achievements
 */

/**
 * Fetches the public metadata of each project id, keeping only public ones.
 *
 * @param {import('./client.mjs').GitlabClient} client - API client.
 * @param {readonly number[]} ids - Distinct project ids.
 * @returns {Promise<Map<number, GitlabProject>>} Public projects by id.
 */
async function publicProjects(client, ids) {
  const rows = await runWithConcurrency(
    ids.map((id) => () => client.get(`/projects/${id}`)),
    CONCURRENCY,
  );
  const byId = new Map();
  for (const raw of rows) {
    const row = /** @type {Record<string, unknown>} */ (raw);
    if (row.visibility !== "public") continue;
    byId.set(Number(row.id), {
      fullName: String(row.path_with_namespace),
      name: String(row.name ?? row.path_with_namespace),
      stars: typeof row.star_count === "number" ? row.star_count : null,
      webUrl: String(row.web_url),
    });
  }
  return byId;
}

/**
 * The GitLab achievements on the profile, image URL included (the badge
 * downloader needs it; the dataset writer drops it).
 *
 * @param {import('./client.mjs').GitlabClient} client - API client.
 * @param {string} username - GitLab username.
 * @returns {Promise<import('./normalize.mjs').GitlabAchievement[]>} Rows.
 */
export async function getGitlabAchievements(client, username) {
  if (!/^[\w.-]+$/.test(username)) throw new Error("bad GitLab username");
  const data = await client.graphql(
    `{user(username:"${username}"){userAchievements{nodes{createdAt achievement{name description avatarUrl namespace{fullPath}}}}}}`,
  );
  const user = /** @type {{userAchievements?: {nodes?: unknown[]}} | null} */ (
    data.user
  );
  return (user?.userAchievements?.nodes ?? [])
    .map((node) =>
      normalizeAchievement(
        /** @type {Parameters<typeof normalizeAchievement>[0]} */ (node),
      ),
    )
    .filter((row) => row !== null);
}

/**
 * Collects authored MRs (and optionally issues and achievements).
 *
 * @param {import('./client.mjs').GitlabClient} client - API client.
 * @param {GitlabSettings} settings - From `contributions.yaml`.
 * @param {{withIssues?: boolean, withAchievements?: boolean}} [what] - Which
 *   extra families to fetch; the live summary needs neither.
 * @returns {Promise<GitlabPart & {rawAchievements: import('./normalize.mjs').GitlabAchievement[]}>}
 *   The collected part; `rawAchievements` still carries image URLs.
 */
export async function collectGitlab(
  client,
  settings,
  { withIssues = true, withAchievements = true } = {},
) {
  const params = { author_id: settings.userId, scope: "all", state: "all" };
  const [mrs, issues, rawAchievements] = await runWithConcurrency(
    [
      () => client.getAll("/merge_requests", params),
      async () => (withIssues ? client.getAll("/issues", params) : []),
      async () =>
        withAchievements
          ? getGitlabAchievements(client, settings.username)
          : [],
    ],
    CONCURRENCY,
  );

  const candidates = [
    ...mrs.map((row) =>
      normalizeItem(
        /** @type {Record<string, unknown>} */ (row),
        "pull_request",
      ),
    ),
    ...issues.map((row) =>
      normalizeItem(/** @type {Record<string, unknown>} */ (row), "issue"),
    ),
  ].filter(
    (item) =>
      item !== null &&
      !isOwnNamespace(item.fullName, settings.excludeNamespaces),
  );

  const projectsById = await publicProjects(client, [
    ...new Set(candidates.map((item) => item.projectId)),
  ]);

  const items = candidates
    .filter((item) => projectsById.has(item.projectId))
    .map(({ projectId, ...item }) => ({
      ...item,
      // The path the project answers today wins over the one in the URL.
      fullName: projectsById.get(projectId)?.fullName ?? item.fullName,
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return {
    fetchedAt: new Date().toISOString(),
    username: settings.username,
    items,
    projects: [...projectsById.values()].sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    ),
    achievements: rawAchievements.map(({ image: _image, ...row }) => row),
    rawAchievements,
  };
}
