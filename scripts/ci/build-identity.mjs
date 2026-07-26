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
 * English only, deliberately. The entity has ONE `@id`; publishing a Spanish
 * description from a second URL would fork the node it is meant to unify. The
 * site's own /es/ pages still render Spanish prose for their readers — that is
 * a per-page localization, not a second canonical claim.
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
  url: "https://github.com/jmrplens.png",
  width: 460,
  height: 460,
};

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

  const orcidUrl = site.person?.sameAs?.find(isOrcidUrl);
  const orcidId = /orcid\.org\/([\dX-]+)/i.exec(orcidUrl ?? "")?.[1];

  const knowsAbout = site.person?.knowsAbout?.map((topic) =>
    wikidata[topic]
      ? {
          "@type": "Thing",
          name: topic,
          // Wikidata's canonical entity concept URI is http by design — it is
          // the Linked Data identifier, not a fetchable link. Mirrors the same
          // suppression in BaseHead.astro.
          // eslint-disable-next-line unicorn/prefer-https -- see comment above
          "@id": `http://www.wikidata.org/entity/${wikidata[topic]}`,
        }
      : topic,
  );

  const owns = projects.projects.map((project) => ({
    "@id": `https://github.com/jmrplens/${project.id}#software`,
  }));

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
    jobTitle: about.person.jobTitle.en,
    description: about.person.description.en,
    url: `${SITE_URL}/`,
    image: {
      "@type": "ImageObject",
      url: IMAGE.url,
      width: String(IMAGE.width),
      height: String(IMAGE.height),
    },
    ...(knowsAbout && knowsAbout.length > 0 && { knowsAbout }),
    ...(owns.length > 0 && { owns }),
    ...(orcidId && {
      identifier: {
        "@type": "PropertyValue",
        propertyID: "ORCID",
        value: orcidId,
        url: orcidUrl,
      },
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
