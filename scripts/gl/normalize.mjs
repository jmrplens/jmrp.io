/**
 * Pure shaping of GitLab.com API rows into the SAME `LedgerItem` shape the
 * GitHub side produces (`scripts/ghc/queries.mjs`'s `getFullLedger`), plus
 * the small summaries the live `PRJ_*` figures and the build-time dataset
 * need. No network here, so every rule is unit-tested with canned rows.
 *
 * Mapping (GitLab → ledger):
 * - a merge request is `kind: "pull_request"`, an issue `kind: "issue"`;
 * - `state` `opened` → `open`, `merged` → `merged`, `closed`/`locked` →
 *   `closed`;
 * - `fullName` is the project's full path (`gitlab-org/api/client-go`,
 *   which can hold more than one slash), `number` is the `iid`;
 * - `hoursToMerge` comes from `created_at` → `merged_at`;
 * - every item carries `platform: "gitlab"`.
 *
 * @module
 */

import { foldProjectName } from "../ghc/contributions-yaml.mjs";

/** GitLab.com's web origin, the only host a project URL may point at. */
const GITLAB_WEB_ORIGIN = "https://gitlab.com";

/**
 * The project's full path from an MR/issue `web_url`
 * (`https://gitlab.com/gitlab-org/gitlab/-/merge_requests/1` →
 * `gitlab-org/gitlab`).
 *
 * @param {string} webUrl - The item's `web_url`.
 * @returns {string | null} The full path, or null for any other host/shape.
 */
export function projectPathFromWebUrl(webUrl) {
  let url;
  try {
    url = new URL(webUrl);
  } catch {
    return null;
  }
  if (url.origin !== GITLAB_WEB_ORIGIN) return null;
  const [projectPart] = url.pathname.split("/-/", 1);
  const fullPath = projectPart.replace(/^\/+/, "").replace(/\/+$/, "");
  return /^[\w.-]+(\/[\w.-]+)+$/.test(fullPath) ? fullPath : null;
}

/**
 * Whether a project lives in one of the owner's own namespaces (his GitLab
 * repositories are mirrors of GitHub ones, so they are not contributions to
 * someone else's project).
 *
 * @param {string} fullPath - Project full path.
 * @param {readonly string[]} excludeNamespaces - Top-level namespaces.
 * @returns {boolean} True when the project must be left out.
 */
export function isOwnNamespace(fullPath, excludeNamespaces) {
  const top = fullPath.split("/", 1)[0].toLowerCase();
  return excludeNamespaces.some((ns) => ns.toLowerCase() === top);
}

/**
 * GitLab state → ledger state.
 *
 * @param {unknown} state - `opened | merged | closed | locked`.
 * @returns {'merged'|'open'|'closed'} The ledger state.
 */
function ledgerState(state) {
  if (state === "merged") return "merged";
  if (state === "opened") return "open";
  return "closed";
}

/**
 * @typedef {object} GitlabLedgerItem
 * @property {'gitlab'} platform
 * @property {'pull_request'|'issue'} kind
 * @property {'merged'|'open'|'closed'} state
 * @property {string} fullName - Project full path.
 * @property {number} number - The `iid`.
 * @property {number} projectId - GitLab's numeric project id (used to check
 *   the project's visibility; dropped before the dataset is written).
 * @property {string} createdAt
 * @property {number | null} hoursToMerge
 * @property {number} comments
 * @property {string} title
 */

/**
 * One merge request or issue row → a ledger item, or null when the row has
 * no usable project path or is confidential.
 *
 * @param {Record<string, unknown>} row - REST row.
 * @param {'pull_request'|'issue'} kind - Which endpoint it came from.
 * @returns {GitlabLedgerItem | null} The item.
 */
export function normalizeItem(row, kind) {
  if (row.confidential === true) return null;
  const fullName = projectPathFromWebUrl(String(row.web_url ?? ""));
  const createdAt = Date.parse(String(row.created_at ?? ""));
  if (!fullName || Number.isNaN(createdAt)) return null;
  const state = ledgerState(row.state);
  const mergedAt = Date.parse(String(row.merged_at ?? ""));
  return {
    platform: "gitlab",
    kind,
    state,
    fullName,
    number: Number(row.iid),
    projectId: Number(row.project_id),
    createdAt: new Date(createdAt).toISOString(),
    hoursToMerge:
      kind === "pull_request" && state === "merged" && !Number.isNaN(mergedAt)
        ? (mergedAt - createdAt) / 3_600_000
        : null,
    comments: Number(row.user_notes_count ?? 0),
    title: typeof row.title === "string" ? row.title : "",
  };
}

/**
 * A GitLab achievement node → the dataset's achievement row. The slug is
 * derived from the name (`Level 3 Contributor` →
 * `gitlab-level-3-contributor`), which is also the committed badge's file
 * name.
 *
 * @param {{createdAt?: string, achievement?: {name?: string,
 *   description?: string | null, avatarUrl?: string | null,
 *   namespace?: {fullPath?: string} | null}}} node - GraphQL node.
 * @returns {GitlabAchievement | null} The row, or null without a name.
 */
export function normalizeAchievement(node) {
  const name = node.achievement?.name?.trim();
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  const avatar = node.achievement?.avatarUrl ?? null;
  return {
    platform: "gitlab",
    achievement: `gitlab-${slug}`,
    name,
    description: node.achievement?.description ?? null,
    namespace: node.achievement?.namespace?.fullPath ?? null,
    awardedAt: node.createdAt ?? null,
    image: avatar ? new URL(avatar, GITLAB_WEB_ORIGIN).href : null,
  };
}

/**
 * @typedef {object} GitlabAchievement
 * @property {'gitlab'} platform
 * @property {string} achievement - Stable slug, `gitlab-<name>`.
 * @property {string} name
 * @property {string | null} description
 * @property {string | null} namespace - Awarding group's full path.
 * @property {string | null} awardedAt
 * @property {string | null} image - Avatar URL; only the badge downloader
 *   reads it, and it is dropped before the dataset is written.
 */

/**
 * The live-summary view of the GitLab merge requests: code/docs counts
 * (GitLab has no listing repositories) and the folded project names with at
 * least one merged MR, for the `PRJ_CODE_UPSTREAMS` union.
 *
 * @param {readonly {kind: string, state: string, fullName: string}[]} items - Ledger items.
 * @param {Record<string, string>} displayName - `contributions.yaml` folding.
 * @returns {{merged: number, open: number, closed: number, projects: string[]}}
 *   The summary.
 */
export function summarizeGitlab(items, displayName) {
  const summary = { merged: 0, open: 0, closed: 0 };
  const projects = new Set();
  for (const item of items) {
    if (item.kind !== "pull_request") continue;
    summary[item.state] += 1;
    if (item.state === "merged") {
      projects.add(foldProjectName(item.fullName, displayName));
    }
  }
  return {
    ...summary,
    projects: [...projects].toSorted((a, b) => a.localeCompare(b)),
  };
}
