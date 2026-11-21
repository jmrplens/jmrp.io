/**
 * A project's license as the SPDX expression it declares, and the license
 * URLs that expression stands for: the ONE rule every reader of
 * `projects.yaml` applies.
 *
 * Most projects declare one identifier ("MIT") and the shared `#software`
 * node states one URL for it. A project that bundles material under other
 * terms declares an AND expression instead, the way its package metadata
 * does: phonometry ships its code under MIT and the EASA ANP tables it
 * bundles under EASA's terms, so PyPI carries `license_expression`
 * "MIT AND LicenseRef-EASA-ANP" and its documentation site states both URLs
 * as `license` on the node jmrp.io shares. Stating one of them here would
 * state a subset of the terms under the same `@id`.
 *
 * The card (`src/components/pages/ProjectsPage.astro` through
 * `@utils/projects`), the JSON-LD node, `scripts/ci/build-projects.mjs` (the
 * published `projects.json`) and `scripts/ci/software-drift-decision.mjs`
 * all need the same split, and the last two are plain Node that cannot
 * import a `.ts` module. A `.mjs` module is the one form all of them can
 * import, the same arrangement as `software-id.mjs`.
 *
 * ── What is accepted ─────────────────────────────────────────────────────
 * One identifier, or identifiers joined by `AND`: every term applies, each
 * to its own part, and each has a URL. `OR`, `WITH` and parentheses are
 * refused rather than guessed at: a choice between terms is not a list of
 * URLs, and no project here declares one.
 *
 * @module
 */

/** An SPDX short identifier or `LicenseRef-` reference (SPDX idstring). */
const IDENTIFIER = /^[A-Za-z0-9.+-]+$/;

/** The operator between two identifiers of an AND expression. */
const AND = "AND";

/** The run of whitespace between the tokens of an expression. */
const SPACE = /\s+/;

/**
 * The identifiers an expression joins, in its order.
 *
 * @param {string} expression - `license` as authored in projects.yaml.
 * @returns {string[]} One identifier, or the identifiers of an AND
 *   expression.
 * @throws {Error} When the expression is anything but identifiers joined by
 *   `AND`.
 */
export function licenseIdentifiers(expression) {
  // Split once on whitespace and read the tokens in turn: an identifier at
  // every even position, the operator at every odd one. One split with a
  // single quantifier runs in linear time, where a pattern that matched the
  // operator with whitespace on both sides could backtrack.
  const tokens = expression.trim().split(SPACE);
  const refuse = (/** @type {string} */ reason) =>
    new Error(
      `license "${expression}": expected one SPDX identifier or identifiers ` +
        `joined by AND, and ${reason}`,
    );
  if (tokens.length % 2 === 0) {
    throw refuse(`"${tokens.at(-1)}" ends it without an identifier after it`);
  }
  const identifiers = [];
  for (const [index, token] of tokens.entries()) {
    if (index % 2 === 1) {
      if (token !== AND) throw refuse(`"${token}" is not AND`);
    } else if (IDENTIFIER.test(token)) {
      identifiers.push(token);
    } else {
      throw refuse(`"${token}" is not an identifier`);
    }
  }
  return identifiers;
}

/**
 * Whether an expression is one this module reads. Pure.
 *
 * @param {string} expression - `license` as authored in projects.yaml.
 * @returns {boolean} True for one identifier or identifiers joined by AND.
 */
export function isLicenseExpression(expression) {
  try {
    licenseIdentifiers(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Each identifier of a project's license with the URL that states it.
 *
 * The URL is the one the project's own site states (`licenseUrl`, one per
 * identifier and in the same order) when the YAML gives it, the table's
 * otherwise, and the identifier itself when the table does not know it (the
 * content schema and the license tests refuse that case for every project in
 * projects.yaml, so it only reaches a caller handing in a partial table).
 *
 * @param {{ license: string, licenseUrl?: string | readonly string[] }} project
 *   The project's `license` and optional `licenseUrl`.
 * @param {Readonly<Record<string, string>>} table - SPDX identifier to
 *   license URL (`src/data/license-urls.json`).
 * @returns {{ id: string, url: string }[]} One entry per identifier, in the
 *   expression's order.
 * @throws {Error} When the expression is not one {@link licenseIdentifiers}
 *   reads, or `licenseUrl` does not give one URL per identifier.
 */
export function projectLicenses(project, table) {
  const identifiers = licenseIdentifiers(project.license);
  const stated =
    project.licenseUrl === undefined ? undefined : [project.licenseUrl].flat();
  if (stated !== undefined && stated.length !== identifiers.length) {
    throw new Error(
      `license "${project.license}" names ${identifiers.length} identifier(s) ` +
        `and licenseUrl gives ${stated.length} URL(s); give one per identifier`,
    );
  }
  return identifiers.map((id, index) => ({
    id,
    url: stated?.[index] ?? table[id] ?? id,
  }));
}

/**
 * The value a project's `license` takes on the shared `#software` node and
 * in `projects.json`: one URL for one identifier, exactly as before AND
 * expressions were read, and the list of URLs for an AND expression.
 *
 * @param {{ license: string, licenseUrl?: string | readonly string[] }} project
 *   The project's `license` and optional `licenseUrl`.
 * @param {Readonly<Record<string, string>>} table - SPDX identifier to
 *   license URL (`src/data/license-urls.json`).
 * @returns {string | string[]} The URL, or the URLs in the expression's
 *   order.
 */
export function projectLicenseValue(project, table) {
  const urls = projectLicenses(project, table).map(({ url }) => url);
  return urls.length === 1 ? urls[0] : urls;
}
