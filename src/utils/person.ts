import type {
  EducationalOccupationalCredential,
  EducationalOrganization,
} from "schema-dts";

/**
 * The canonical avatar for the `#person` entity: 460x460 PNG, served from this
 * origin at a fixed path.
 *
 * It must NOT be an `import`ed asset. Astro fingerprints those, so a
 * `/_astro/mehome.<hash>.webp` URL changes on every deploy — fine for this
 * site, which regenerates it, but poison for the five project documentation
 * sites that restate this same `@id`: a copied hash 404s the moment jmrp.io
 * rebuilds. That is exactly how Cloudflare-DNS-Updater ended up advertising a
 * dead image (fixed in jmrplens/Cloudflare-DNS-Updater#139).
 *
 * `public/identity/avatar.png` satisfies both constraints at once: it is
 * copied verbatim, so the URL is as stable across deploys as the GitHub avatar
 * endpoint it replaces, and the identity it advertises is now hosted by the
 * entity that claims it, next to `/identity/person.jsonld` — which a consumer
 * already has to reach this origin to fetch.
 *
 * Site-root-relative on purpose: consumers absolutize it against the site URL
 * (`BaseHead.astro`, `scripts/ci/build-identity.mjs`), so there is one literal
 * path and no hard-coded hostname to drift.
 */
export const CANONICAL_PERSON_IMAGE = {
  path: "/identity/avatar.png",
  width: 460,
  height: 460,
} as const;

/**
 * Canonical alma-mater list for the site's `#person` entity, shared by every
 * page that adds `alumniOf` (AboutPage, CVPage) so knowledge-graph builders
 * resolve ONE canonical entity per school regardless of which page emits it —
 * previously /about/ and /cv/ used divergent labels ("UPV · i3M / UMIL" vs
 * "Polytechnic University of Valencia") for the same institution.
 *
 * José holds a degree from the University of Alicante and a Master's from the
 * Universitat Politècnica de València. The predoctoral doctorate at the UPV was
 * NOT completed, so it does not add a third institution — the list is exactly
 * the two universities he is an alumnus of, each carrying a Wikidata `sameAs`.
 */
export const CANONICAL_ALUMNI_OF: EducationalOrganization[] = [
  {
    "@type": "EducationalOrganization",
    name: "University of Alicante",
    sameAs: "https://www.wikidata.org/wiki/Q2037040",
  },
  {
    "@type": "EducationalOrganization",
    name: "Universitat Politècnica de València",
    sameAs: "https://www.wikidata.org/wiki/Q2003976",
  },
];

/**
 * Canonical degree list for the `#person` entity: the two degrees on the
 * public ORCID record (0000-0003-1250-6212), each recognized by the matching
 * `CANONICAL_ALUMNI_OF` institution so knowledge-graph builders resolve the
 * school to one entity whichever property they walk in from.
 *
 * These ship in the canonical `#person` node itself (BaseHead and
 * `scripts/ci/build-identity.mjs`, which downstream project sites splice in
 * verbatim), unlike the page-scoped additive facts on /cv/: a degree is a
 * stable biographical claim, not a page concern. Mirror any change here in
 * `build-identity.mjs` — the schema-validation spec fails if the two drift.
 */
export const CANONICAL_CREDENTIALS: EducationalOccupationalCredential[] = [
  {
    "@type": "EducationalOccupationalCredential",
    name: "Telecommunications Engineer in Sound and Image",
    credentialCategory: "degree",
    recognizedBy: CANONICAL_ALUMNI_OF[0],
  },
  {
    "@type": "EducationalOccupationalCredential",
    name: "MSc in Acoustics Engineering",
    credentialCategory: "degree",
    recognizedBy: CANONICAL_ALUMNI_OF[1],
  },
];
