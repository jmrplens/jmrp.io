import type {
  EducationalOccupationalCredential,
  EducationalOrganization,
} from "schema-dts";

/**
 * The canonical avatar for the `#person` entity.
 *
 * Deliberately NOT an asset on jmrp.io. Astro fingerprints built assets, so a
 * `/_astro/mehome.<hash>.webp` URL changes on every deploy — fine for this
 * site, which regenerates it, but poison for the five project documentation
 * sites that restate this same `@id`: a copied hash 404s the moment jmrp.io
 * rebuilds. That is exactly how Cloudflare-DNS-Updater ended up advertising a
 * dead image (fixed in jmrplens/Cloudflare-DNS-Updater#139).
 *
 * GitHub's avatar endpoint is stable across deploys, is not behind this
 * server's own WAF/CrowdSec stack (so a crawler blocked here can still resolve
 * it), and is already the value the other project sites publish.
 *
 * Note: the `.png` path serves a 460x460 JPEG via a 302 to
 * `avatars.githubusercontent.com`. The extension is cosmetic — consumers use
 * the `Content-Type` header. This redirecting form is MORE stable than the
 * redirect target, whose `?v=N` query bumps whenever the avatar changes.
 */
export const CANONICAL_PERSON_IMAGE = {
  url: "https://github.com/jmrplens.png",
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
