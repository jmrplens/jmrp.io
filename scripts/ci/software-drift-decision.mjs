// cspell:locale en,es
// cspell:words LILYGO
/**
 * The pass/fail decision of `check-software-drift.mjs`, kept apart from the
 * network code so it is tested without fetching anything.
 *
 * @module
 */

import { projectLicenseValue } from "../utils/license-expression.mjs";

/**
 * Divergences the author decided to keep, matched by project id and property
 * (never by text, so rewording the summary cannot silently lift or hide the
 * exception). An accepted divergence is still printed, as "accepted".
 *
 * gitlab-mcp-server: the action count in `summary.en` and the tool count on
 * its docs site measure different GitLab tiers, so both are true (author
 * decision, 2026-09-03; see `src/content/profile/projects.yaml`).
 *
 * cs-routeros-bouncer: `summary` gained its final full stop on 2026-11-21
 * (GEO audit #13), because the documentation hub's llms.txt printed the
 * sentence running into the license note after it. Its docs site, another
 * repository, still publishes the sentence without one. Delete the entry
 * once that site carries the full stop.
 *
 * kleidos: kleidos.dev lists post 011's Spanish article with the headline "Un
 * llavero con bloqueo ante fallos...", a title jmrp.io never published (the
 * post is "Una bóveda con bloqueo ante fallos..."). The fix belongs in the
 * Kleidos site's repository; this entry names that one article, so any other
 * headline it misstates still fails the run (GEO audit #13).
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
  "cs-routeros-bouncer": Object.freeze({
    properties: Object.freeze(["description"]),
    reason:
      "jmrp.io added the final full stop its docs site has yet to publish",
    decided: "2026-11-21",
  }),
  kleidos: Object.freeze({
    properties: Object.freeze([
      "subjectOf headline https://jmrp.io/es/blog/011-encrypt-then-mac-vault/#article",
    ]),
    reason:
      "kleidos.dev states a Spanish headline for post 011 that jmrp.io never published; the fix is in the Kleidos repository",
    decided: "2026-11-21",
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
 * `applicationSubCategory`, `alternateName`, `disambiguatingDescription` and
 * `keywords` joined on 2026-11-21 (GEO audit #13). mikroscope's docs site
 * said "Network monitoring" and /projects/ "Monitoring", and Kleidos's site
 * spelled its board vendor "LILYGO" where projects.yaml wrote "LilyGO", on
 * properties nothing compared. Each localized property is read as its English
 * value and, under `<property>@es`, its Spanish one, as `description` is.
 *
 * @type {readonly string[]}
 */
export const CONTRADICTABLE = Object.freeze([
  "name",
  "alternateName",
  "description",
  "description@es",
  "disambiguatingDescription",
  "disambiguatingDescription@es",
  "keywords",
  "keywords@es",
  "license",
  "programmingLanguage",
  "applicationCategory",
  "applicationSubCategory",
  "operatingSystem",
  "codeRepository",
  "url",
]);

/**
 * The properties projects.yaml writes as an `{ en, es }` pair and the graph
 * states as two language-tagged literals. A bilingual site states them the
 * same way; an English-only one states a plain string, which is the English
 * value. {@link siteValues} and {@link projectValues} split each into
 * `<property>` (English) and `<property>@es` (Spanish).
 *
 * @type {readonly string[]}
 */
export const LOCALIZED = Object.freeze([
  "description",
  "disambiguatingDescription",
  "keywords",
]);

/**
 * The literal one language states for a localized property, or `undefined`.
 * Pure.
 *
 * @param {unknown} value - The property as published: a string, one
 *   language-tagged literal or a list of them.
 * @param {string} lang - The language tag wanted.
 * @returns {string | undefined} The `@value` tagged with `lang`.
 */
export function taggedLiteral(value, lang) {
  return [value ?? []]
    .flat()
    .find((literal) => literal?.["@language"] === lang)?.["@value"];
}

/**
 * What a project's own site states for each property in
 * {@link CONTRADICTABLE}, read from its `#software` node. Pure.
 *
 * A localized property gives its English literal as `<property>` and its
 * Spanish one as `<property>@es`. A site that states the property untagged
 * gives the whole value as `<property>` and nothing as `<property>@es`: an
 * English-only site has no Spanish literal to contradict. Comparing the whole
 * tagged array against `summary.en` reported mikroscope and ghchronicle as
 * contradicting while their English text was identical.
 *
 * @param {Record<string, unknown>} node - The site's `#software` node.
 * @returns {Record<string, unknown>} The values, by property.
 */
export function siteValues(node) {
  const values = {};
  for (const property of CONTRADICTABLE) {
    const [base, lang] = property.split("@", 2);
    if (!LOCALIZED.includes(base)) {
      values[property] = node[property];
    } else if (lang) {
      values[property] = taggedLiteral(node[base], lang);
    } else {
      values[property] = taggedLiteral(node[base], "en") ?? node[base];
    }
  }
  return values;
}

/** Prefix of the per-article keys {@link articleHeadlines} builds. */
const HEADLINE_KEY = "subjectOf headline ";

/**
 * The headline a site states for each article in a node's `subjectOf`, one
 * key per article (`subjectOf headline <@id>`), so a divergence names the
 * article and an accepted exception covers that article alone. Items with
 * no `@id` or no headline name nothing to compare. Pure.
 *
 * @param {unknown} subjectOf - The node's `subjectOf`.
 * @returns {Record<string, string>} Headline by key.
 */
export function articleHeadlines(subjectOf) {
  const headlines = {};
  for (const item of [subjectOf ?? []].flat()) {
    if (typeof item?.["@id"] === "string" && typeof item.headline === "string")
      headlines[`${HEADLINE_KEY}${item["@id"]}`] = item.headline;
  }
  return headlines;
}

/**
 * The headline jmrp.io states for each of its posts, keyed as
 * {@link articleHeadlines} keys a site's: the post's article node is
 * `<site>[/es]/blog/<slug>/#article` and its headline the post's `title`,
 * the rule `projectArticles` in `src/utils/projects.ts` follows. Drafts are
 * not published, so they state nothing. Pure.
 *
 * @param {readonly { lang: string, slug: string, title: string, draft?: boolean }[]} posts
 *   The posts' frontmatter.
 * @param {string} siteUrl - The site's URL, without a trailing slash.
 * @returns {Record<string, string>} Headline by key.
 */
export function postHeadlines(posts, siteUrl) {
  const headlines = {};
  for (const post of posts) {
    if (post.draft) continue;
    const prefix = post.lang === "es" ? "/es" : "";
    headlines[`${HEADLINE_KEY}${siteUrl}${prefix}/blog/${post.slug}/#article`] =
      post.title;
  }
  return headlines;
}

/**
 * What projects.yaml states for each property in {@link CONTRADICTABLE}, read
 * from one project's record. Every compared property has its source here, and
 * nothing else does: {@link divergentProperties} skips a property either side
 * leaves undefined, so a compared property without a source would pass as
 * agreement, whatever the project's site states. Pure.
 *
 * @param {{
 *   name: string,
 *   alternateName?: string[],
 *   summary: { en: string, es?: string },
 *   disambiguatingDescription?: { en: string, es?: string },
 *   keywords?: { en: string, es?: string },
 *   license?: string,
 *   licenseUrl?: string | string[],
 *   language?: string,
 *   applicationCategory?: string,
 *   applicationSubCategory?: string,
 *   operatingSystem?: string,
 *   repo?: string,
 *   docs: string,
 * }} project - The project as authored in projects.yaml.
 * @param {Readonly<Record<string, string>>} licenseUrls - SPDX identifier to
 *   license URL, the table the site reads (`src/data/license-urls.json`).
 * @returns {Record<string, unknown>} The values, by property.
 */
export function projectValues(project, licenseUrls) {
  return {
    name: project.name,
    alternateName: project.alternateName,
    description: project.summary.en,
    // The graph has stated `summary.es` too since 2026-11-01, as the Spanish
    // literal of `description`, so a bilingual site that says something else
    // in Spanish contradicts it the way a different English text would.
    "description@es": project.summary.es,
    disambiguatingDescription: project.disambiguatingDescription?.en,
    "disambiguatingDescription@es": project.disambiguatingDescription?.es,
    keywords: project.keywords?.en,
    "keywords@es": project.keywords?.es,
    // One URL for one identifier, the list of URLs for an AND expression
    // (phonometry's "MIT AND LicenseRef-EASA-ANP"), which is how its docs
    // site states `license`: compared as sets, so the order does not matter
    // and a missing or an extra term still contradicts.
    license:
      project.license === undefined
        ? undefined
        : projectLicenseValue(project, licenseUrls),
    programmingLanguage: project.language,
    applicationCategory: project.applicationCategory,
    applicationSubCategory: project.applicationSubCategory,
    // One comma-joined string here, a list in the graph /projects/ emits and
    // usually a string on the docs site: compared as the set of systems
    // either way (see LIST_PROPERTIES).
    operatingSystem: project.operatingSystem,
    codeRepository: project.repo,
    // The node's `url` is the repository, or the documentation for a project
    // whose repository is still private (`buildProjectSchema`).
    url: project.repo ?? project.docs,
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
 * Only a project whose `docs` is its own repository's README anchor is
 * skipped: it has no separate site to contradict anything, so it is skipped
 * silently, as it always was (`quiet: true`).
 *
 * A project with no public repository (`status: upcoming`) is compared like
 * any other since 2026-11-21. It used to be skipped because `url` was read
 * from the repository, and Kleidos's node drifted from kleidos.dev unseen
 * for that reason (GEO audit #13). Its `@id` and `url` come from its docs
 * instead, as `software-id.mjs` and `buildProjectSchema` derive them, and a
 * property neither side can state (`codeRepository`) is simply not compared.
 * The `{ quiet: false }` shape stays for a future skip that has to be named.
 *
 * @param {{ id: string, status?: string, repo?: string, docs: string }} project
 *   The project as authored in projects.yaml.
 * @returns {{ quiet: boolean, reason: string } | null} The skip, or `null`.
 */
export function driftSkip(project) {
  if (project.repo && project.docs.startsWith(`${project.repo}#`)) {
    return { quiet: true, reason: "documentation is the repository README" };
  }
  return null;
}
