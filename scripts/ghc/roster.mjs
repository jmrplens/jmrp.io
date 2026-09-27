/**
 * Repository roster and shared SQL/token helpers for the /projects live-data
 * pipeline (ghchronicle → InfluxDB 3 → this repo).
 *
 * Every query in `queries.mjs` that touches a per-project table filters on an
 * explicit allowlist built from these constants — NEVER a deny-list and NEVER
 * an open `GROUP BY owner`. `gh_repo`, `gh_commit` and friends mix in private
 * repositories (kleidos, phonometry-archive, a11y-diagrams, ...); the only
 * safe query shape is "give me rows for these named public repos".
 *
 * The lists mirror `src/content/profile/projects.yaml` (`status: active` /
 * `status: archived`). They are duplicated here, not read from the YAML,
 * because `scripts/ghc/*.mjs` must run standalone (no Astro content loader)
 * and because a roster change is a two-file review on purpose: the person
 * adding a GitHub repo to the public site also decides whether ghchronicle
 * should query it.
 *
 * @module
 */

/**
 * Active projects, in the order `projects.yaml` lists them. These get LIVE
 * per-card tokens (stars, release, downloads) and count toward every
 * "active roster" aggregate (stars gained, releases shipped).
 */
export const ACTIVE_REPOS = /** @type {const} */ ([
  "gitlab-mcp-server",
  "phonometry",
  "cs-routeros-bouncer",
  "mikroscope",
  "Cloudflare-DNS-Updater",
  "libgen-mcp",
  "ghchronicle",
  "TFG-TFM_EPS",
  "portainer-mcp",
]);

/**
 * Archived projects. They get no per-card tokens, only a share of the
 * roster-wide star and fork totals, read from `gh_repo_total`, which
 * ghchronicle writes for archived repositories on every `totals` sweep since
 * 2.5.2 (jmrplens/ghchronicle#78; before that their `gh_repo` rows froze at
 * the last backfill).
 */
export const ARCHIVED_REPOS = /** @type {const} */ ([
  "A-Lab",
  "mastodon_official_profiles",
  "SetFigPaper",
  "LoVE-BASS",
  "FDTDexamples",
  "CATT2Matlab",
  "FFT2octave",
  "getANSIfrequencies",
  "dBFA2Matlab",
  "MATLAB_Instruments",
  "picoScopeMATLAB",
]);

/** Every roster repo, active first. Used only where a query needs both. */
export const ALL_ROSTER_REPOS = /** @type {const} */ ([
  ...ACTIVE_REPOS,
  ...ARCHIVED_REPOS,
]);

/**
 * Active software projects that get an engineering/maintenance row ("How I
 * maintain projects"): CI matrix, CodeQL, Dependabot, repo hygiene. Excludes
 * TFG-TFM_EPS, a LaTeX thesis template, not software with CI in that sense —
 * PLAN.md section 5: "No sale en las tarjetas MATLAB ni académicas".
 */
export const MAINTENANCE_REPOS = ACTIVE_REPOS.filter(
  (repo) => repo !== "TFG-TFM_EPS",
);

/** GitHub account every roster repo belongs to. */
export const OWNER = "jmrplens";

/**
 * Validates a repo name is one of the shapes this module hard-codes (letters,
 * digits, dot, dash, underscore — GitHub's own repo-name alphabet), and
 * returns it quoted for a SQL `IN (...)` list.
 *
 * Defense in depth, not the actual privacy boundary: the real boundary is
 * that every caller passes one of the constants above, never a value derived
 * from user input or from an unfiltered query result. This only stops a typo
 * or an unescaped interpolation from becoming a SQL-injection vector.
 *
 * @param {string} repo - A bare repo name (no owner prefix).
 * @returns {string} The name, single-quoted for SQL.
 */
function quoteRepo(repo) {
  if (!/^[\w.-]+$/.test(repo)) {
    throw new Error(`roster.mjs: refusing to quote unsafe repo name: ${repo}`);
  }
  return `'${repo}'`;
}

/**
 * Builds a SQL `IN (...)` list from repo names, validating each one first.
 *
 * @param {readonly string[]} repos - Repo names (no owner prefix).
 * @returns {string} `'repo-a','repo-b'`, ready to interpolate inside `IN (...)`.
 */
export function sqlRepoList(repos) {
  if (repos.length === 0) {
    throw new Error("roster.mjs: sqlRepoList() called with an empty list");
  }
  return repos.map(quoteRepo).join(",");
}

/**
 * Validates and quotes a `full_name` (owner/repo) for a SQL `IN (...)` list.
 *
 * @param {string} fullName - `owner/repo`.
 * @returns {string} The full name, single-quoted for SQL.
 */
function quoteFullName(fullName) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
    throw new Error(
      `roster.mjs: refusing to quote unsafe full_name: ${fullName}`,
    );
  }
  return `'${fullName}'`;
}

/**
 * Builds a SQL `IN (...)` list from `owner/repo` full names.
 *
 * @param {readonly string[]} fullNames - `owner/repo` strings.
 * @returns {string} Ready to interpolate inside `IN (...)`.
 */
export function sqlFullNameList(fullNames) {
  if (fullNames.length === 0) {
    throw new Error("roster.mjs: sqlFullNameList() called with an empty list");
  }
  return fullNames.map(quoteFullName).join(",");
}

/**
 * Derives a project's `PRJ_<ID>_*` token segment from its repo id, the same
 * way for both the writer (`write-summary.mjs`) and the registry
 * (`src/components/projects/ssr-tokens.ts`), so the two can never drift on a
 * naming rule alone (a roster change can still desync them; that is what
 * `check-projects-ssr.mjs`, a later task, is for).
 *
 * `"Cloudflare-DNS-Updater"` → `"CLOUDFLARE_DNS_UPDATER"`,
 * `"TFG-TFM_EPS"` → `"TFG_TFM_EPS"`.
 *
 * @param {string} repoId - Bare repo name (an `ACTIVE_REPOS` entry).
 * @returns {string} Uppercase, `[A-Z0-9_]+` token segment.
 */
export function projectTokenId(repoId) {
  return repoId.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
}

/**
 * The only 4 badges the owner decided to show (task brief, and
 * `datos.md`'s "Nunca publicar" for `profile-achievements`): Pull Shark,
 * Pair Extraordinaire, Galaxy Brain, Starstruck. Arctic Code Vault
 * Contributor, Public Sponsor, Quickdraw and YOLO are dropped entirely —
 * the last two read as trivia or a negative to a recruiter, and the first
 * two carry no progress.
 */
export const SHOWN_ACHIEVEMENTS = new Set([
  "pull-shark",
  "pair-extraordinaire",
  "galaxy-brain",
  "starstruck",
]);
