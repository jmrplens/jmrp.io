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
 * ── Why it is NOT a gate ─────────────────────────────────────────────────
 * Deliberately absent from `pnpm verify` and from CI. It reads five external
 * sites, so a redesign, an outage or a rate limit elsewhere would turn into a
 * red build here — a failure mode with nothing to do with this repository's
 * correctness. Run it when you want to know, not on every commit.
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

const LICENSE_URLS = {
  MIT: "https://opensource.org/licenses/MIT",
  "GPL-3.0": "https://www.gnu.org/licenses/gpl-3.0.html",
  "AGPL-3.0": "https://www.gnu.org/licenses/agpl-3.0.html",
};

let contradictions = 0;
let unreachable = 0;
let missingNodes = 0;

for (const project of projects) {
  // Only projects with their own documentation site can contradict anything;
  // for the rest, projects.yaml is the sole publisher.
  if (project.docs.startsWith(`${project.repo}#`)) continue;

  const softwareId = `https://github.com/jmrplens/${project.id}#software`;
  let theirs;
  try {
    theirs = (await graphOf(project.docs)).find(
      (n) =>
        n["@id"] === softwareId && (n["@type"] ?? "").startsWith("Software"),
    );
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

  const diffs = CONTRADICTABLE.filter(
    (p) =>
      theirs[p] !== undefined &&
      ours[p] !== undefined &&
      JSON.stringify(theirs[p]) !== JSON.stringify(ours[p]),
  );

  // `sameAs` is multi-valued and merges, so a shorter list here is a missed
  // opportunity rather than a contradiction — reported separately.
  const theirAliases = new Set([theirs.sameAs ?? []].flat());
  const ourAliases = new Set([project.docs, ...(project.sameAs ?? [])]);
  const missing = [...theirAliases.difference(ourAliases)];

  if (diffs.length === 0 && missing.length === 0) {
    console.log(`✓ ${project.id}`);
    continue;
  }

  console.log(`\n✗ ${project.id}`);
  for (const p of diffs) {
    contradictions++;
    console.log(`   ${p} CONTRADICTS`);
    console.log(`     their site : ${JSON.stringify(theirs[p])}`);
    console.log(`     projects.yaml: ${JSON.stringify(ours[p])}`);
  }
  if (missing.length > 0) {
    console.log(`   sameAs entries their site has and projects.yaml lacks:`);
    for (const u of missing) console.log(`     ${u}`);
  }
}

// Three distinct outcomes, deliberately not collapsed into one number: a site
// that would not respond says nothing about drift and may be fixed by rerunning,
// whereas a healthy site with no `#software` node means projects.yaml is now the
// sole publisher for that entity — a standing fact, not a transient failure.
console.log(
  `\n${contradictions} contradiction(s), ` +
    `${unreachable} site(s) unreadable, ` +
    `${missingNodes} readable site(s) with no #software node.`,
);
if (contradictions > 0) {
  console.log(
    "Contradictions share an @id, so they weaken the entity. The project's own\n" +
      "site is normally the authoritative side — update projects.yaml to match.",
  );
}
// Always exits 0: this is a report, not a gate. Read it.
process.exit(0);
