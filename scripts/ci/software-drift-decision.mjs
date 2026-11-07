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
 * Properties of the shared `#software` node where a divergence is a
 * contradiction, not detail. `description@es` is the Spanish literal of
 * `description`, read apart from the English one.
 *
 * `operatingSystem` joined on 2026-11-07. /projects/ states it as a list
 * (["Linux", "macOS", "Windows"]) and the docs sites as one comma-joined
 * string ("Windows, Linux, macOS"), and nothing compared the two, so a site
 * that named other systems shipped unnoticed.
 *
 * @type {readonly string[]}
 */
export const CONTRADICTABLE = Object.freeze([
  "name",
  "description",
  "description@es",
  "license",
  "programmingLanguage",
  "applicationCategory",
  "operatingSystem",
  "codeRepository",
  "url",
]);

/**
 * What projects.yaml states for each property in {@link CONTRADICTABLE}, read
 * from one project's record. Every compared property has its source here, and
 * nothing else does: {@link divergentProperties} skips a property either side
 * leaves undefined, so a compared property without a source would pass as
 * agreement, whatever the project's site states. Pure.
 *
 * @param {{
 *   name: string,
 *   summary: { en: string, es?: string },
 *   license: string,
 *   licenseUrl?: string,
 *   language?: string,
 *   applicationCategory?: string,
 *   operatingSystem?: string,
 *   repo?: string,
 * }} project - The project as authored in projects.yaml.
 * @param {Readonly<Record<string, string>>} licenseUrls - SPDX identifier to
 *   license URL, the table the site reads (`src/data/license-urls.json`).
 * @returns {Record<string, unknown>} The values, by property.
 */
export function projectValues(project, licenseUrls) {
  return {
    name: project.name,
    description: project.summary.en,
    // The graph has stated `summary.es` too since 2026-11-01, as the Spanish
    // literal of `description`, so a bilingual site that says something else
    // in Spanish contradicts it the way a different English text would.
    "description@es": project.summary.es,
    license:
      project.licenseUrl ?? licenseUrls[project.license] ?? project.license,
    programmingLanguage: project.language,
    applicationCategory: project.applicationCategory,
    // One comma-joined string here, a list in the graph /projects/ emits and
    // usually a string on the docs site: compared as the set of systems
    // either way (see LIST_PROPERTIES).
    operatingSystem: project.operatingSystem,
    codeRepository: project.repo,
    url: project.repo,
  };
}

/**
 * Properties whose text can name several items in one comma-joined string.
 * schema.org's own examples write `operatingSystem` as "Windows 7, OS X 10.6,
 * Android 1.6" and `applicationCategory` as "Game, Multimedia"; a project in
 * two languages can write `programmingLanguage` the same way. jmrp.io splits
 * `operatingSystem` into a list (`operatingSystems()` in
 * `src/utils/projects.ts`) and the docs sites keep the string, so the same
 * systems arrive in two shapes and have to be compared as items.
 *
 * @type {readonly string[]}
 */
export const LIST_PROPERTIES = Object.freeze([
  "operatingSystem",
  "applicationCategory",
  "programmingLanguage",
]);

/**
 * Orders two strings by UTF-16 code unit, the one order that never calls two
 * different strings equal (`localeCompare` does, for two spellings of the
 * same accented letter). Pure.
 *
 * @param {string} a - One string.
 * @param {string} b - The other.
 * @returns {number} Negative, zero or positive, as `sort` expects.
 */
const byCodeUnit = (a, b) => Number(a > b) - Number(a < b);

/**
 * One JSON-LD value as canonical text: object keys sorted, every array read
 * as the unordered set JSON-LD makes it, and a one-element array the same as
 * its element. Pure.
 *
 * @param {unknown} value - A parsed JSON-LD value.
 * @returns {string} Text that is equal for two values exactly when they state
 *   the same thing, whatever the order of their arrays and keys.
 */
export function canonicalJson(value) {
  if (Array.isArray(value)) {
    const items = [...new Set(value.map((entry) => canonicalJson(entry)))].sort(
      byCodeUnit,
    );
    return items.length === 1 ? items[0] : `[${items.join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort(byCodeUnit)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * The names one item of a list property stands for: a string split at its
 * commas, a language-tagged literal the same way, and a node by its `name`
 * (a `ComputerLanguage` named "Go" is "Go"). Pure.
 *
 * @param {unknown} item - One value of the property.
 * @returns {string[] | null} The names, or `null` for an item that names
 *   nothing this way and is compared whole.
 */
function listNames(item) {
  const text = typeof item === "string" ? item : item?.["@value"];
  if (typeof text === "string") {
    return text
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "");
  }
  return typeof item?.name === "string" ? [item.name.trim()] : null;
}

/**
 * The values a property states, each as canonical text. A missing value
 * states none; an array states each of its items. Pure.
 *
 * @param {unknown} value - The property's value as published.
 * @param {{ list?: boolean }} [options] - `list` reads each item as
 *   {@link listNames} does, for the properties in {@link LIST_PROPERTIES}.
 * @returns {Set<string>} The stated values.
 */
export function statedValues(value, { list = false } = {}) {
  const stated = new Set();
  for (const item of [value ?? []].flat()) {
    const names = list ? listNames(item) : null;
    if (names === null) stated.add(canonicalJson(item));
    else for (const name of names) stated.add(JSON.stringify(name));
  }
  return stated;
}

/**
 * Whether two values of one property state the same set of things. Pure.
 *
 * @param {unknown} theirs - The value on the project's own site.
 * @param {unknown} ours - The value jmrp.io states.
 * @param {{ list?: boolean }} [options] - See {@link statedValues}.
 * @returns {boolean} True when neither side states a value the other lacks.
 */
export function sameValues(theirs, ours, options = {}) {
  const a = statedValues(theirs, options);
  const b = statedValues(ours, options);
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/**
 * What each side of a divergent property states that the other does not,
 * for the report. Pure.
 *
 * @param {string} property - The property compared.
 * @param {unknown} theirs - The value on the project's own site.
 * @param {unknown} ours - The value from projects.yaml.
 * @returns {{ onlyTheirs: string[], onlyOurs: string[] }} The values each
 *   side alone states, each as JSON text (so a name prints quoted and a value
 *   with commas in it stays one value), sorted.
 */
export function valueDifference(property, theirs, ours) {
  const options = { list: LIST_PROPERTIES.includes(property) };
  const a = statedValues(theirs, options);
  const b = statedValues(ours, options);
  return {
    onlyTheirs: [...a.difference(b)].sort(byCodeUnit),
    onlyOurs: [...b.difference(a)].sort(byCodeUnit),
  };
}

/**
 * The properties whose values the two sides state differently. A property
 * only one side states is not compared: a site that leaves it out says
 * nothing against it. Pure.
 *
 * @param {Record<string, unknown>} theirs - The project site's values, by
 *   property.
 * @param {Record<string, unknown>} ours - The values from projects.yaml.
 * @param {readonly string[]} [properties] - What to compare.
 * @returns {string[]} The divergent properties, in the order given.
 */
export function divergentProperties(theirs, ours, properties = CONTRADICTABLE) {
  return properties.filter(
    (p) =>
      theirs[p] !== undefined &&
      ours[p] !== undefined &&
      !sameValues(theirs[p], ours[p], { list: LIST_PROPERTIES.includes(p) }),
  );
}

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
    const status = project.status ? ` (status: ${project.status})` : "";
    return {
      quiet: false,
      reason: `no public repository${status}, not compared`,
    };
  }
  if (project.docs.startsWith(`${project.repo}#`)) {
    return { quiet: true, reason: "documentation is the repository README" };
  }
  return null;
}
