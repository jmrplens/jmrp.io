/**
 * The `@id` of a project's software entity: the ONE rule every emitter uses.
 *
 * It is a shared identifier, not a link. jmrp.io and each project's own
 * documentation site describe the same software, and they only describe ONE
 * node if both spell its `@id` the same way. Four places need it and they
 * cannot share TypeScript: `buildProjectSchema` and the series hubs (Astro,
 * through `@utils/projects`), `scripts/ci/build-identity.mjs` (the `owns`
 * list of the canonical `#person`) and `scripts/ci/check-software-drift.mjs`
 * (plain Node). A `.mjs` module is the one form all of them can import, so
 * the rule is written here once instead of four times.
 *
 * ── The rule ─────────────────────────────────────────────────────────────
 * - A project with a public repository: `https://github.com/jmrplens/<id>#software`.
 *   Unchanged since the first project shipped, and the form every published
 *   docs site already uses for its own node.
 * - A project without one (`status: upcoming`, its repository still private):
 *   its documentation URL plus `#software`, e.g.
 *   `https://docs.jmrp.io/kleidos/#software`. The documentation is the only
 *   public home such a project has, and it is the `@id` that documentation
 *   site publishes for itself. A GitHub URL would name a repository nobody
 *   can open, and would assert an identifier no other document uses.
 *
 * When an upcoming project publishes its repository and gains a `repo`, this
 * rule moves its `@id` to the GitHub form. Its documentation site has to move
 * its own node in the same release, or the two documents stop describing one
 * entity; check-software-drift.mjs reports that as a missing node.
 *
 * @module
 */

/** Account that owns every repository the projects list links. */
const GITHUB_OWNER_URL = "https://github.com/jmrplens/";

/** The fragment every software `@id` ends in. */
const FRAGMENT = "#software";

/**
 * The fields of a `projects.yaml` entry the rule reads.
 *
 * @typedef {object} SoftwareIdSource
 * @property {string} id - Repository name (also the project's key).
 * @property {string} [repo] - Public repository URL; absent while private.
 * @property {string} docs - Documentation entry point.
 */

/**
 * The canonical software `@id` of a project.
 *
 * @param {SoftwareIdSource | string} project - The project, or a bare
 *   repository name (always the GitHub form: a name alone says nothing about
 *   documentation).
 * @returns {string} The `#software` @id.
 */
export function softwareId(project) {
  if (typeof project === "string")
    return `${GITHUB_OWNER_URL}${project}${FRAGMENT}`;
  if (project.repo) return `${GITHUB_OWNER_URL}${project.id}${FRAGMENT}`;
  // `new URL` resolves the fragment against the docs URL, replacing any
  // fragment the URL already had, so a README-anchor style `docs` value still
  // yields exactly one `#software`.
  return new URL(FRAGMENT, project.docs).href;
}
