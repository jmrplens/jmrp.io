#!/usr/bin/env node
/**
 * On-demand drift check between `src/content/profile/projects.yaml` and the
 * `#software` nodes each project's own documentation site publishes.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * /projects/ restates `name`, `description` and `license` for every project.
 * For the five with their own docs site, those values describe a node under a
 * SHARED `@id` (`https://github.com/jmrplens/<repo>#software`) — so a divergent
 * value is not extra detail, it is two documents contradicting each other about
 * one entity. Exactly the failure that hit the Person node twice before it was
 * centralized.
 *
 * ── Gate semantics (GEO audit #12, M1) ──────────────────────────────────
 * It used to exit 0 whatever it found, so a contradiction could not stop
 * anything and the rule it enforces drifted unnoticed more than once. Now an
 * undeclared contradiction exits 1. A site that cannot be read (outage, rate
 * limit) still exits 0: that says nothing about drift, and an offline CI must
 * not go red because of someone else's server. Declared exceptions live in
 * `software-drift-decision.mjs` and print as "accepted". Wired into
 * `pnpm verify` (phase 3) and the CI `schema-validation` job.
 *
 * ── Direction of truth ───────────────────────────────────────────────────
 * Unlike the Person entity, where jmrp.io is authoritative, the project's own
 * site is the better source for its software: it knows the version, the feature
 * list and the release date. So a mismatch reported here almost always means
 * `projects.yaml` is the stale side.
 *
 * Usage:
 *   node scripts/ci/check-software-drift.mjs
 *   pnpm run check:software-drift
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";

import {
  ACCEPTED_DIVERGENCES,
  classifyDivergences,
  exitCodeFor,
} from "./software-drift-decision.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Single-valued properties where a divergence is a contradiction, not detail. */
const CONTRADICTABLE = [
  "name",
  "description",
  "license",
  "programmingLanguage",
  "applicationCategory",
  "codeRepository",
  "url",
];

/**
 * Extracts every JSON-LD node from a page.
 *
 * @param {string} url - Page to read.
 * @returns {Promise<Record<string, unknown>[]>} Flattened graph nodes.
 */
async function graphOf(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  // Without this, a 404 or 5xx page parses as ordinary HTML with no JSON-LD in
  // it, and a dead site would be reported as "publishes no #software node" —
  // indistinguishable from a healthy site that simply never published one.
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const nodes = [];
  for (const m of html.matchAll(
    /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      const parsed = JSON.parse(m[1]);
      nodes.push(...(parsed["@graph"] ?? [parsed]));
    } catch {
      // A non-JSON-LD block on the page is not this script's problem.
    }
  }
  return nodes;
}

const projects = loadYaml(
  readFileSync(join(ROOT, "src/content/profile/projects.yaml"), "utf8"),
).projects;

// The canonical Person node, for the second comparison below. Every docs site
// splices `https://jmrp.io/#person` into its own graph at build time, so a
// site whose served node lags the canonical one is publishing a stale
// identity, whatever its `#software` node says. Every property is compared
// except `knowsAbout`, which is additive on the consumer side: comparing only
// `sameAs` and `owns` missed mcp.jmrp.io serving the description #526
// replaced (GEO audit #10).
const PERSON_ID = "https://jmrp.io/#person";
const canonicalPerson = JSON.parse(
  readFileSync(join(ROOT, "public/identity/person.jsonld"), "utf8"),
);
const PERSON_KEYS = Object.keys(canonicalPerson).filter(
  (key) => !key.startsWith("@") && key !== "knowsAbout",
);

// Pages that splice the canonical `#person` but are not a project's `docs`
// site, so the loop below would never visit them.
const EXTRA_PERSON_PAGES = ["https://mcp.jmrp.io/"];

/**
 * Compares the `#person` node a page serves with the canonical document.
 *
 * @param {Record<string, unknown>[]} nodes - The page's flattened graph.
 * @returns {string[]} One line per divergent property, empty when the page
 *   carries no `#person` node at all (a page that does not splice it cannot
 *   lag it).
 */
function stalePersonLines(nodes) {
  const served = nodes.find((n) => n["@id"] === PERSON_ID && n.sameAs);
  if (!served) return [];
  const lines = [];
  for (const key of PERSON_KEYS) {
    const ours = JSON.stringify(canonicalPerson[key] ?? null);
    const theirs = JSON.stringify(served[key] ?? null);
    if (ours === theirs) continue;
    if (!Array.isArray(canonicalPerson[key])) {
      lines.push(`#person ${key}: served copy differs from the canonical one`);
      continue;
    }
    // Same length with different contents is the usual case (a URL that
    // changed spelling), so name the first entry the served copy lacks.
    const servedSet = new Set(
      [served[key] ?? []].flat().map((entry) => JSON.stringify(entry)),
    );
    const firstMissing = canonicalPerson[key].find(
      (entry) => !servedSet.has(JSON.stringify(entry)),
    );
    const label =
      typeof firstMissing === "string"
        ? firstMissing
        : (firstMissing?.["@id"] ?? JSON.stringify(firstMissing));
    lines.push(
      `#person ${key}: served ${[served[key] ?? []].flat().length}, ` +
        `canonical ${canonicalPerson[key].length}` +
        (firstMissing ? `, served copy lacks ${label}` : ""),
    );
  }
  return lines;
}

/**
 * Fetches every distinct page's JSON-LD graph concurrently.
 *
 * @param {string[]} urls - Pages to read; duplicates are fetched once.
 * @returns {Promise<Map<string, PromiseSettledResult<object[]>>>} Each page's
 *   outcome, fulfilled or rejected.
 */
async function fetchGraphs(urls) {
  const unique = [...new Set(urls)];
  const settled = await Promise.allSettled(unique.map((url) => graphOf(url)));
  return new Map(unique.map((url, i) => [url, settled[i]]));
}

/**
 * Unwraps a settled fetch: its value, or its error thrown again, so the
 * caller's `catch` reports it exactly as a failed `await` would have.
 *
 * @param {PromiseSettledResult<object[]>} result - The outcome.
 * @returns {object[]} The graph's nodes.
 */
function settledValue(result) {
  if (result.status === "rejected") throw result.reason;
  return result.value;
}

// The one table the site reads, shared rather than restated: this script
// compares what each project's own site claims against what jmrp.io claims,
// and a private copy of the answer is the last place that comparison should
// get its expectations from. It also carried only three of the five ids.
const LICENSE_URLS = JSON.parse(
  readFileSync(join(ROOT, "src/data/license-urls.json"), "utf8"),
);

let contradictions = 0;
let acceptedCount = 0;
let unreachable = 0;
let missingNodes = 0;
let stalePersons = 0;

// Every site is fetched up front and at once: they are independent, and the
// report below still walks them in order. A failed fetch stays with its page.
const graphs = await fetchGraphs([
  ...projects
    .filter((project) => !project.docs.startsWith(`${project.repo}#`))
    .map((project) => project.docs),
  ...EXTRA_PERSON_PAGES,
]);

for (const project of projects) {
  // Only projects with their own documentation site can contradict anything;
  // for the rest, projects.yaml is the sole publisher.
  if (project.docs.startsWith(`${project.repo}#`)) continue;

  const softwareId = `https://github.com/jmrplens/${project.id}#software`;
  let theirs;
  let personLines = [];
  try {
    const nodes = settledValue(graphs.get(project.docs));
    theirs = nodes.find(
      (n) =>
        n["@id"] === softwareId && (n["@type"] ?? "").startsWith("Software"),
    );
    personLines = stalePersonLines(nodes);
  } catch (error) {
    console.log(
      `\n⚠ ${project.id}: could not read ${project.docs} (${error.message})`,
    );
    unreachable++;
    continue;
  }

  if (!theirs) {
    // Not necessarily a problem: some `docs` URLs point at a plain GitHub
    // Pages site that never published structured data. It only matters if the
    // site used to, in which case projects.yaml became the sole publisher
    // without anyone deciding that.
    console.log(
      `\n⚠ ${project.id}: ${project.docs} publishes no ${softwareId} node — ` +
        `projects.yaml is the only source for it`,
    );
    missingNodes++;
    continue;
  }

  const ours = {
    name: project.name,
    description: project.summary.en,
    license: LICENSE_URLS[project.license] ?? project.license,
    programmingLanguage: project.language,
    applicationCategory: project.applicationCategory,
    codeRepository: project.repo,
    url: project.repo,
  };

  // A bilingual site states `description` as language-tagged literals. The
  // English one is what `summary.en` must match; comparing the whole array
  // against a string reported mikroscope and ghchronicle as contradicting
  // while their English text was identical. The Spanish literal is checked
  // against `summary.es` further down, as a note: that copy is display-only.
  const theirDescriptions = [theirs.description ?? []].flat();
  const tagged = (lang) =>
    theirDescriptions.find((literal) => literal?.["@language"] === lang)?.[
      "@value"
    ];
  const theirValue = (p) =>
    p === "description" && tagged("en") !== undefined
      ? tagged("en")
      : theirs[p];

  const allDiffs = CONTRADICTABLE.filter(
    (p) =>
      theirValue(p) !== undefined &&
      ours[p] !== undefined &&
      JSON.stringify(theirValue(p)) !== JSON.stringify(ours[p]),
  );
  const { contradicting: diffs, accepted: acceptedDiffs } = classifyDivergences(
    project.id,
    allDiffs,
  );
  const esDrift =
    tagged("es") !== undefined && tagged("es") !== project.summary.es;

  // `sameAs` is multi-valued and merges, so a shorter list here is a missed
  // opportunity rather than a contradiction — reported separately.
  // Ours is everything the built node states about the same thing: the docs,
  // the repository (`url`/`codeRepository`), the rendered `listings` that
  // `buildProjectSchema` folds into `sameAs` on its own, and `sameAs` itself.
  // Leaving the listings out reported npm, PyPI, NuGet and the CrowdSec Hub as
  // missing while the graph already carried them (GEO audit #8).
  const theirAliases = new Set([theirs.sameAs ?? []].flat());
  const ourAliases = new Set([
    project.docs,
    project.repo,
    ...(project.listings ?? []).map((listing) => listing.url),
    ...(project.sameAs ?? []),
    // Endpoint aliases sit on the `#api` node here; a docs site that keeps
    // them on `#software` is not missing anything jmrp.io lacks.
    ...(project.endpointSameAs ?? []),
  ]);
  // The MCP Registry has no permalink per server, so the two sites spell its
  // alias differently (the `/versions` resource here, a `?search=` query on
  // libgen's docs). Either names the same entry; neither is missing from the
  // other (GEO audit #9, LOW).
  const registryHost = "registry.modelcontextprotocol.io";
  const isRegistryUrl = (url) => {
    try {
      return new URL(url).hostname === registryHost;
    } catch {
      return false;
    }
  };
  const missing = [...theirAliases.difference(ourAliases)].filter(
    (url) => !(project.registryId && isRegistryUrl(url)),
  );

  if (
    diffs.length === 0 &&
    acceptedDiffs.length === 0 &&
    missing.length === 0 &&
    personLines.length === 0 &&
    !esDrift
  ) {
    console.log(`✓ ${project.id}`);
    continue;
  }

  console.log(
    `\n${diffs.length === 0 && personLines.length === 0 && !esDrift && missing.length === 0 ? "~" : "✗"} ${project.id}`,
  );
  if (personLines.length > 0) {
    // mikroscope spliced the canonical node without being in the consumer
    // roster, so a change to the canonical never reached it until its author's
    // next push; the site that served the stale node looked fine from the
    // roster's side (GEO audit #9, A4). The served page is what counts.
    stalePersons++;
    for (const line of personLines) console.log(`   ${line} (stale)`);
  }
  for (const p of diffs) {
    contradictions++;
    console.log(`   ${p} CONTRADICTS`);
    console.log(`     their site : ${JSON.stringify(theirValue(p))}`);
    console.log(`     projects.yaml: ${JSON.stringify(ours[p])}`);
  }
  for (const p of acceptedDiffs) {
    acceptedCount++;
    const rule = ACCEPTED_DIVERGENCES[project.id];
    console.log(
      `   ${p} differs, accepted (${rule.reason}; decided ${rule.decided})`,
    );
    console.log(`     their site : ${JSON.stringify(theirValue(p))}`);
    console.log(`     projects.yaml: ${JSON.stringify(ours[p])}`);
  }
  if (esDrift) {
    console.log(`   summary.es differs (display-only, not counted)`);
    console.log(`     their site : ${JSON.stringify(tagged("es"))}`);
    console.log(`     projects.yaml: ${JSON.stringify(project.summary.es)}`);
  }
  if (missing.length > 0) {
    console.log(`   sameAs entries their site has and projects.yaml lacks:`);
    for (const u of missing) console.log(`     ${u}`);
  }
}

for (const page of EXTRA_PERSON_PAGES) {
  let lines;
  try {
    lines = stalePersonLines(settledValue(graphs.get(page)));
  } catch (error) {
    console.log(`\n⚠ ${page}: could not read it (${error.message})`);
    unreachable++;
    continue;
  }
  if (lines.length === 0) continue;
  stalePersons++;
  console.log(`\n✗ ${page}`);
  for (const line of lines) console.log(`   ${line} (stale)`);
}

// Three distinct outcomes, deliberately not collapsed into one number: a site
// that would not respond says nothing about drift and may be fixed by rerunning,
// whereas a healthy site with no `#software` node means projects.yaml is now the
// sole publisher for that entity — a standing fact, not a transient failure.
console.log(
  `\n${contradictions} contradiction(s), ${acceptedCount} accepted, ` +
    `${unreachable} site(s) unreadable, ` +
    `${missingNodes} readable site(s) with no #software node, ` +
    `${stalePersons} site(s) serving a stale #person.`,
);
if (contradictions > 0) {
  console.log(
    "Contradictions share an @id, so they weaken the entity. The project's own\n" +
      "site is normally the authoritative side — update projects.yaml to match.",
  );
}
// Exit 1 only for an undeclared contradiction; unreadable sites stay 0.
process.exit(exitCodeFor({ contradictions }));
