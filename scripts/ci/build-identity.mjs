#!/usr/bin/env node
/**
 * Canonical identity document generator.
 *
 * Writes `public/identity/person.jsonld` — the standalone JSON-LD description
 * of the `https://jmrp.io/#person` entity, assembled from the same YAML sources
 * BaseHead.astro reads (`site_config/site.yaml`, `profile/about.yaml`,
 * `profile/projects.yaml`) plus the shared Wikidata map in
 * `src/data/knows-about-wikidata.json`.
 *
 * ── Why a committed file instead of an Astro route ───────────────────────
 * The five project documentation sites restate this same entity, and they read
 * it at BUILD time from their own CI runners. Fetching it from jmrp.io would
 * route those builds through this server's Cloudflare / CrowdSec / MikroTik
 * stack — the one place where a blocked runner IP would silently degrade every
 * downstream site to a stale snapshot. Committing the artifact means it is also
 * served by GitHub:
 *
 *   crawlers / humans → https://jmrp.io/identity/person.jsonld
 *   project builds    → https://raw.githubusercontent.com/jmrplens/jmrp.io/
 *                       main/public/identity/person.jsonld
 *
 * Same bytes, two paths, and the build path never touches this server.
 *
 * ── Language ─────────────────────────────────────────────────────────────
 * Bilingual, via JSON-LD language-tagged values on `jobTitle`, `description`
 * and `hasOccupation.name`:
 *
 *   "jobTitle": [
 *     { "@value": "R&D · Firmware & Software Engineer",     "@language": "en" },
 *     { "@value": "I+D · Ingeniero de Firmware y Software", "@language": "es" }
 *   ]
 *
 * This document used to be English-only, on the reasoning that "publishing a
 * Spanish description from a SECOND URL would fork the node". That reasoning
 * was right, but it rules out a different technique than the one used here.
 * Forking happens when a second *document* re-declares the entity; language
 * tags live INSIDE the one document under the one `@id`, which is precisely
 * what RDF language-tagged literals are for. One node, two labels, no fork.
 *
 * It also fixes a real defect the English-only rule created: the site emitted
 * `jobTitle` as an untagged string whose value changed with the page locale, so
 * the same `@id` accumulated two contradictory titles depending on which page a
 * consumer crawled. Tagged values make both true simultaneously.
 *
 * This matters downstream: all six project documentation sites are bilingual
 * and splice this node into their `@graph` verbatim, so they inherit both
 * labels instead of hard-coding an English one next to Spanish prose. They
 * consume the node as JSON-LD only (none renders these values as display
 * text), so the array shape is safe for them — verified 2026-08-02 across
 * gitlab-mcp-server, phonometry, cs-routeros-bouncer, Cloudflare-DNS-Updater,
 * libgen-mcp and jmrplens.github.io.
 *
 * ── Drift protection ─────────────────────────────────────────────────────
 * Two independent guards, because this file duplicates assembly logic that
 * also lives in BaseHead.astro (a .astro component cannot be imported from a
 * plain Node script, and adding a TypeScript loader for one script is not
 * worth the dependency):
 *
 *   1. `--check` here re-derives from YAML and diffs the committed file, so
 *      editing a YAML source without regenerating fails `pnpm verify`.
 *   2. `tests/schema-validation.spec.ts` asserts the served document is
 *      deep-equal to the Person node BaseHead actually renders, so if this
 *      script and the component ever disagree, CI fails regardless of which
 *      one is wrong.
 *
 * Usage:
 *   node scripts/ci/build-identity.mjs           # write the file
 *   node scripts/ci/build-identity.mjs --check   # verify it is up to date
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { load as loadYaml } from "js-yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT = join(ROOT, "public", "identity", "person.jsonld");

const SITE_URL = "https://jmrp.io";
const PERSON_ID = `${SITE_URL}/#person`;

/**
 * Mirrors `CANONICAL_PERSON_IMAGE` in `src/utils/person.ts`. Kept in sync by
 * the schema-validation spec, which compares this document against the node
 * BaseHead renders from that constant.
 */
const IMAGE = {
  url: `${SITE_URL}/identity/avatar.png`,
  width: 460,
  height: 460,
};

/**
 * Wikidata's canonical entity URI. Plain `http:` by design — it is the Linked
 * Data identifier, not a fetchable link. Mirrors `wikidataEntityUri` in
 * `src/utils/wikidata.ts`.
 *
 * @param qid - The bare Q-id, e.g. `Q2037040`.
 * @returns The entity URI.
 */
// eslint-disable-next-line unicorn/prefer-https -- see comment above
const wikidataEntityUri = (qid) => `http://www.wikidata.org/entity/${qid}`;

/**
 * Mirrors `CANONICAL_ALUMNI_OF` and `CANONICAL_CREDENTIALS` in
 * `src/utils/person.ts` (a .astro/.ts module cannot be imported here). Kept
 * in sync by the schema-validation spec, which compares this document against
 * the node BaseHead renders.
 */
const ALUMNI_OF = [
  {
    "@type": "EducationalOrganization",
    // Identified by the Wikidata entity URI, the same convention `knowsAbout`
    // uses below — not an anonymous node carrying only a `sameAs` to the wiki
    // ARTICLE. Mirrors `CANONICAL_ALUMNI_OF` in src/utils/person.ts.
    "@id": wikidataEntityUri("Q2037040"),
    name: "University of Alicante",
    sameAs: "https://www.wikidata.org/wiki/Q2037040",
  },
  {
    "@type": "EducationalOrganization",
    "@id": wikidataEntityUri("Q2003976"),
    name: "Universitat Politècnica de València",
    sameAs: "https://www.wikidata.org/wiki/Q2003976",
  },
];

const CREDENTIALS = [
  {
    "@type": "EducationalOccupationalCredential",
    name: "Telecommunications Engineer in Sound and Image",
    credentialCategory: "degree",
    recognizedBy: ALUMNI_OF[0],
  },
  {
    "@type": "EducationalOccupationalCredential",
    name: "MSc in Acoustics Engineering",
    credentialCategory: "degree",
    recognizedBy: ALUMNI_OF[1],
  },
];

/**
 * Whether a URL points at ORCID, matched on the parsed hostname.
 *
 * A substring test (`url.includes("orcid.org")`) would also accept
 * `https://evil.example/?ref=orcid.org` — flagged by CodeQL as
 * `js/incomplete-url-substring-sanitization`. The input here is a
 * repo-committed YAML list rather than user input, so it was not exploitable,
 * but the hostname check is both correct and free. Kept identical to the same
 * helper in BaseHead.astro so the two Person nodes stay byte-equal.
 *
 * @param value - Candidate URL from `person.sameAs`.
 * @returns True when the URL's host is ORCID.
 */
const isOrcidUrl = (value) => {
  try {
    const { hostname } = new URL(value);
    return hostname === "orcid.org" || hostname === "www.orcid.org";
  } catch {
    return false;
  }
};

/**
 * Reads and parses a YAML file relative to the repository root.
 *
 * @param relativePath - Path from the repo root, e.g. "src/content/…".
 * @returns The parsed document.
 */
const readYaml = (relativePath) =>
  loadYaml(readFileSync(join(ROOT, relativePath), "utf8"));

/**
 * Turns an `{ en, es }` YAML pair into JSON-LD language-tagged values.
 *
 * English first so a consumer that ignores language tags and naively takes the
 * first entry still gets the same string this document published when it was
 * English-only — the shape changes, the default answer does not.
 *
 * Mirrors `localizedValues` in BaseHead.astro. The schema-validation spec
 * compares the two outputs, so a change here that is not mirrored fails CI.
 *
 * @param pair - Object with `en` and `es` strings.
 * @returns Array of language-tagged value objects.
 */
const localizedValues = (pair) => [
  { "@value": pair.en, "@language": "en" },
  { "@value": pair.es, "@language": "es" },
];

/**
 * Builds the canonical Person node.
 *
 * Property order and value shapes intentionally match the node emitted by
 * `BaseHead.astro`, so the two can be compared with a plain deep-equal.
 *
 * @returns The JSON-LD document (with its own `@context`, so it is valid
 *   standalone rather than only as a fragment of a page `@graph`).
 */
function buildIdentityDocument() {
  const site = readYaml("src/content/site_config/site.yaml");
  const about = readYaml("src/content/profile/about.yaml");
  const projects = readYaml("src/content/profile/projects.yaml");
  const wikidata = JSON.parse(
    readFileSync(join(ROOT, "src/data/knows-about-wikidata.json"), "utf8"),
  );
  // Canonical Wikidata labels, so the Thing nodes here carry exactly the same
  // `name` as the ones BaseHead.astro emits for the same `@id`. Without this
  // the two implementations drift and schema-validation.spec.ts fails — which
  // is precisely how this line came to exist.
  const wikidataLabels = JSON.parse(
    readFileSync(join(ROOT, "src/data/wikidata-labels.json"), "utf8"),
  );
  // Must stay identical to LABEL_OVERRIDES in src/utils/wikidata.ts — see the
  // rationale there. A .astro component cannot be imported from a plain Node
  // script, which is why this small table is duplicated rather than shared;
  // schema-validation.spec.ts compares the two outputs and fails on drift.
  const labelOverrides = { Q1135322: "Modbus", Q3025536: "DevOps" };

  const orcidUrl = site.person?.sameAs?.find(isOrcidUrl);
  const orcidId = /orcid\.org\/([\dX-]+)/i.exec(orcidUrl ?? "")?.[1];

  const knowsAbout = site.person?.knowsAbout?.map((topic) =>
    wikidata[topic]
      ? {
          "@type": "Thing",
          name:
            labelOverrides[wikidata[topic]] ??
            wikidataLabels[wikidata[topic]] ??
            topic,
          "@id": wikidataEntityUri(wikidata[topic]),
        }
      : topic,
  );

  const owns = [
    ...projects.projects.map((project) => ({
      "@id": `https://github.com/jmrplens/${project.id}#software`,
    })),
    // Same entries and rationale as BaseHead.astro (the drift guards keep
    // them in lockstep): the deployed MCP endpoints, whose canonical nodes
    // live on mcp.jmrp.io and point back via `provider`/`author`. Derived
    // from the same `endpoint` field of projects.yaml BaseHead reads, in
    // YAML order, so the two emitters cannot disagree.
    ...projects.projects
      .filter((project) => typeof project.endpoint === "string")
      .map((project) => ({ "@id": `${project.endpoint}#api` })),
  ];

  const sameAs = [
    ...new Set([
      ...(site.social_links?.map((l) => l.url) ?? []),
      ...(site.person?.sameAs ?? []),
    ]),
  ];

  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: site.author,
    ...(site.person?.alternateName && {
      alternateName: site.person.alternateName,
    }),
    jobTitle: localizedValues(about.person.jobTitle),
    description: localizedValues(about.person.description),
    ...(about.person.email && { email: about.person.email }),
    url: `${SITE_URL}/`,
    // The page that IS about this entity, not merely one that mentions it:
    // /about/ emits `ProfilePage.mainEntity → #person`, while the home page
    // only emits `WebPage.about → #person`. Declaring the inverse here
    // completes the reciprocal pair, the same way the article nodes pair
    // `translationOfWork`/`workTranslation`.
    //
    // A plain URL, not the `#profile` node reference: the six downstream sites
    // splice this document into a graph that does NOT contain that node, so an
    // `@id` reference would dangle for them. Unprefixed (EN) on purpose — the
    // entity is locale-neutral, like `#person` and `#website` themselves.
    mainEntityOfPage: `${SITE_URL}/about/`,
    // The editorial & corrections policy published at /about/#editorial —
    // verification, corrections and AI-assistance disclosure. Stated in the
    // graph rather than only in prose, so the six downstream sites that splice
    // this node in inherit the signal too.
    // KEEP-IN-SYNC: src/components/layout/BaseHead.astro.
    publishingPrinciples: `${SITE_URL}/about/#editorial`,
    image: {
      "@type": "ImageObject",
      url: IMAGE.url,
      // Numeric QuantitativeValue, not a quoted string — schema.org types
      // MediaObject width/height as Distance | QuantitativeValue, never Text.
      // E37 = pixel (UN/CEFACT). Must mirror BaseHead.astro exactly: the
      // schema-validation spec compares this document to the rendered node.
      width: {
        "@type": "QuantitativeValue",
        value: IMAGE.width,
        unitCode: "E37",
      },
      height: {
        "@type": "QuantitativeValue",
        value: IMAGE.height,
        unitCode: "E37",
      },
    },
    alumniOf: ALUMNI_OF,
    hasCredential: CREDENTIALS,
    ...(about.person.occupation && {
      hasOccupation: {
        "@type": "Occupation",
        name: localizedValues(about.person.occupation),
      },
    }),
    ...(about.person.knowsLanguage && {
      knowsLanguage: about.person.knowsLanguage.map((language) => ({
        "@type": "Language",
        name: language.name,
        alternateName: language.code,
      })),
    }),
    ...(about.person.homeLocation && {
      homeLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: about.person.homeLocation.locality,
          addressRegion: about.person.homeLocation.region,
          addressCountry: about.person.homeLocation.country,
        },
      },
    }),
    ...(knowsAbout && knowsAbout.length > 0 && { knowsAbout }),
    ...(owns.length > 0 && { owns }),
    ...(orcidId && {
      // Array, not a bare object: the entity must be able to carry more than one
      // identifier without silently dropping all but the first. Mirrors the same
      // shape in BaseHead.astro — the two are compared in schema-validation.spec.ts.
      identifier: [
        {
          "@type": "PropertyValue",
          propertyID: "ORCID",
          value: orcidId,
          url: orcidUrl,
        },
      ],
    }),
    sameAs,
  };
}

const serialized = `${JSON.stringify(buildIdentityDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let committed;
  try {
    committed = readFileSync(OUTPUT, "utf8");
  } catch {
    console.error(
      `✗ Missing ${OUTPUT}. Run: node scripts/ci/build-identity.mjs`,
    );
    process.exit(1);
  }
  if (committed !== serialized) {
    console.error(
      "✗ public/identity/person.jsonld is out of date with its YAML sources.\n" +
        "  Regenerate it with: pnpm run identity:build",
    );
    process.exit(1);
  }
  console.log("✓ Canonical identity document is in sync with its sources.");
} else {
  writeFileSync(OUTPUT, serialized);
  console.log(`✓ Wrote ${OUTPUT}`);
}
