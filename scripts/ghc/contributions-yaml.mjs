/**
 * Reads `src/content/profile/contributions.yaml` outside of Astro's content
 * loader — the same reason `scripts/ci/build-projects.mjs` reads
 * `projects.yaml` directly with `js-yaml`: these are plain `.mjs` scripts,
 * run from a pre-build hook or a systemd timer, neither of which can import
 * `astro:content`.
 *
 * The shape returned here must stay in lockstep with `contributionsSchema`
 * in `src/content.config.ts` — that file is the schema Astro itself
 * validates against at build time; this loader only reads the same bytes for
 * scripts that cannot go through Astro. `astro check` is what catches a
 * malformed YAML file; this module trusts the file once `astro check` has.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import { load as parseYaml } from "js-yaml";

/** Path of the source YAML, relative to the repository root. */
export const CONTRIBUTIONS_YAML_PATH = "src/content/profile/contributions.yaml";

/**
 * @typedef {object} FeaturedContribution
 * @property {string} repo - `owner/repo` full name (a GitLab project's full
 *   path, which may hold more than one slash).
 * @property {number} number - PR/issue number, or a GitLab MR's `iid`.
 * @property {'pull_request'|'issue'} kind - A GitLab merge request is
 *   `pull_request`.
 * @property {'github'|'gitlab'} platform - Where it lives; defaults to
 *   `github`.
 * @property {{en: string, es: string}} why
 */

/**
 * @typedef {object} GitlabContributionsSettings
 * @property {string} username - GitLab.com username.
 * @property {number} userId - GitLab.com numeric user id.
 * @property {string[]} excludeNamespaces - The owner's own top-level
 *   namespaces (mirrors of GitHub repositories), never counted.
 */

/**
 * @typedef {object} ContributionsConfig
 * @property {string[]} listingRepos - `owner/repo` full names classified as
 *   packaging/listing rather than code/docs.
 * @property {string[]} exclude - `owner/repo#number` identifiers hidden from
 *   the detailed build-time ledger.
 * @property {Record<string, string>} displayName - `owner/repo` → display
 *   name, for folding sibling repos into one project.
 * @property {FeaturedContribution[]} featured - Curated highlights, ordered.
 * @property {string[]} securityTitleAllow - Regex source strings allow-listed
 *   past the default security-title filter.
 * @property {Record<string, string>} listingAliases - Lowercase, alternate
 *   spelling of an own (`roster.mjs` `ACTIVE_REPOS`) project id → that id,
 *   for matching a listing PR's title when the PR predates a project rename
 *   (e.g. `pyoctaveband` → `phonometry`).
 * @property {GitlabContributionsSettings | null} gitlab - GitLab.com
 *   account settings, or null when the file declares none.
 */

/**
 * Reads and lightly shapes the contributions YAML.
 *
 * @param {string} [root] - Repository root; defaults to `process.cwd()`.
 * @returns {ContributionsConfig} The parsed configuration, with every array
 *   field defaulted to `[]`/`{}` so callers never handle `undefined`.
 * @throws {Error} When the file is missing, not a mapping, or not
 *   `type: contributions`.
 */
export function loadContributionsConfig(root = process.cwd()) {
  const filePath = path.join(root, CONTRIBUTIONS_YAML_PATH);
  const raw = parseYaml(fs.readFileSync(filePath, "utf8"));
  if (!raw || typeof raw !== "object") {
    throw new Error(`${CONTRIBUTIONS_YAML_PATH}: not a YAML mapping`);
  }
  if (raw.type !== "contributions") {
    throw new Error(
      `${CONTRIBUTIONS_YAML_PATH}: expected "type: contributions", got ${String(raw.type)}`,
    );
  }
  if (!Array.isArray(raw.featured) || raw.featured.length === 0) {
    throw new Error(
      `${CONTRIBUTIONS_YAML_PATH}: "featured" must be a non-empty list`,
    );
  }
  return {
    listingRepos: Array.isArray(raw.listingRepos) ? raw.listingRepos : [],
    exclude: Array.isArray(raw.exclude) ? raw.exclude : [],
    displayName:
      raw.displayName && typeof raw.displayName === "object"
        ? raw.displayName
        : {},
    featured: raw.featured.map((entry) => ({
      ...entry,
      platform: entry.platform === "gitlab" ? "gitlab" : "github",
    })),
    securityTitleAllow: Array.isArray(raw.securityTitleAllow)
      ? raw.securityTitleAllow
      : [],
    listingAliases:
      raw.listingAliases && typeof raw.listingAliases === "object"
        ? raw.listingAliases
        : {},
    gitlab: shapeGitlabSettings(raw.gitlab),
  };
}

/**
 * Shapes the optional `gitlab` block.
 *
 * @param {unknown} raw - The parsed `gitlab` value.
 * @returns {GitlabContributionsSettings | null} The settings, or null.
 */
function shapeGitlabSettings(raw) {
  if (!raw || typeof raw !== "object") return null;
  const block = /** @type {Record<string, unknown>} */ (raw);
  if (typeof block.username !== "string" || typeof block.userId !== "number") {
    return null;
  }
  return {
    username: block.username,
    userId: block.userId,
    excludeNamespaces: Array.isArray(block.excludeNamespaces)
      ? block.excludeNamespaces.map(String)
      : [],
  };
}

/**
 * The identifier `exclude` entries use for one ledger item:
 * `path!iid` for a GitLab merge request (GitLab's own reference syntax),
 * `path#number` for everything else.
 *
 * @param {{fullName: string, number: number, kind: string, platform?: string}} item - A ledger item.
 * @returns {string} The key.
 */
export function itemKey(item) {
  const sigil =
    item.platform === "gitlab" && item.kind === "pull_request" ? "!" : "#";
  return `${item.fullName}${sigil}${item.number}`;
}

/**
 * Folds a repo's `owner/repo` full name into its display "project" name via
 * `displayName`, falling back to the bare repo name (the part after the
 * `/`; for a nested GitLab path, the last segment) when no override is
 * configured, never the full `owner/repo`. This is
 * the folding the owner decided on (PLAN.md 8.2 #3): a "project" is a GitHub
 * owner, with this file able to override the label per repo; the bare-repo
 * default (2026-09-26 fix) already reads right for most upstreams
 * (`acmesh-official/acme.sh` → `"acme.sh"`) — only a repo whose display name
 * needs recasing or expanding past its own repo name
 * (`renovatebot/renovate` → `"Renovate"`, `TriliumNext/Trilium` →
 * `"Trilium Notes"`) needs an explicit entry in `contributions.yaml`.
 *
 * @param {string} fullName - `owner/repo`.
 * @param {Record<string, string>} displayName - From {@link loadContributionsConfig}.
 * @returns {string} The display name.
 */
export function foldProjectName(fullName, displayName) {
  return displayName[fullName] ?? fullName.split("/").at(-1) ?? fullName;
}

/**
 * Matches a listing PR's title against every roster project id (and
 * `listingAliases`), returning the ids it mentions — a distribution PR's own
 * project is derived from its title rather than hand-mapped per
 * `owner/repo#number`, because a single PR can name more than one project
 * (`docker/mcp-registry`'s "Add libgen-mcp and gitlab-mcp-server, two remote
 * servers…" covers both) and because deriving stays correct as new listing
 * PRs land, with no `contributions.yaml` edit required for the common case.
 * Matching is case-insensitive substring search — every roster id already
 * appears verbatim in its own listing titles (`"jmrplens.gitlab-mcp-server
 * version 2.7.5"`, `"Add mikroscope to Monitoring"`); `listingAliases`
 * covers the one exception, a pre-rename spelling.
 *
 * @param {string} title - The listing PR's raw title.
 * @param {readonly string[]} activeRepos - Roster project ids
 *   (`roster.mjs`'s `ACTIVE_REPOS`).
 * @param {Record<string, string>} listingAliases - From
 *   {@link loadContributionsConfig}.
 * @returns {string[]} The matched project ids, deduplicated, in roster
 *   order. Empty when the title names none of them.
 */
export function deriveOwnProjects(title, activeRepos, listingAliases) {
  const lowerTitle = title.toLowerCase();
  const matched = new Set();
  for (const repo of activeRepos) {
    if (lowerTitle.includes(repo.toLowerCase())) matched.add(repo);
  }
  for (const [alias, repo] of Object.entries(listingAliases)) {
    if (
      lowerTitle.includes(alias.toLowerCase()) &&
      activeRepos.includes(repo)
    ) {
      matched.add(repo);
    }
  }
  return [...matched];
}
