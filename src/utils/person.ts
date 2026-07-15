import type { EducationalOrganization } from "schema-dts";

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
