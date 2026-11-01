/**
 * The parts of the canonical `#person` node built from profile/about.yaml
 * data: language-tagged literals, the schools, the dated studies and
 * credentials, and the memberships.
 *
 * Two emitters build that node: BaseHead.astro (through `@utils/person`) and
 * `scripts/ci/build-identity.mjs`, which writes `/identity/person.jsonld` for
 * the six sites that splice it in. A plain Node script cannot import a `.ts`
 * module, so the shared rules live in this `.mjs` file, the one form both can
 * import, the same arrangement as `software-id.mjs`. Written once, the two
 * documents cannot drift on these properties; the schema-validation spec
 * still compares them as a whole.
 *
 * @module
 */

/**
 * Wikidata's canonical entity URI. Plain `http:` by design: it is the Linked
 * Data identifier, not a fetchable link. Mirrors `wikidataEntityUri` in
 * src/utils/wikidata.ts.
 *
 * @param {string} qid - The bare Q-id, e.g. `Q2037040`.
 * @returns {string} The entity URI.
 */
// eslint-disable-next-line unicorn/prefer-https -- see the comment above
const wikidataEntityUri = (qid) => `http://www.wikidata.org/entity/${qid}`;

/**
 * Turns an `{ en, es }` pair into JSON-LD language-tagged values.
 *
 * The canonical `#person` node is locale-neutral: it carries ONE `@id`, so it
 * must not change its `jobTitle` depending on which page a consumer crawled.
 * It used to do exactly that, emitting an untagged string picked by `locale`,
 * which left the same entity holding two contradictory titles across the site.
 * Tagged values let both be true at once. English first, so a consumer that
 * ignores the tags and takes the first entry reads what it always read.
 *
 * @param {{ en: string, es: string }} pair - The two strings.
 * @returns {{ "@value": string, "@language": string }[]} The tagged values.
 */
export const localizedValues = (pair) => [
  { "@value": pair.en, "@language": "en" },
  { "@value": pair.es, "@language": "es" },
];

/**
 * The schools the `#person` studied at, keyed as `education[].school` in
 * profile/about.yaml (and the CV's `school`/`partOf`) refers to them.
 *
 * The two universities are IDENTIFIED by their Wikidata entity URI, the same
 * convention `knowsAbout` uses, not left as anonymous nodes carrying only a
 * `sameAs` to the wiki ARTICLE. Two consequences: the document stopped
 * publishing two different Wikidata URI conventions for the same vocabulary,
 * and the schools emitted from /about/ and /cv/ collapse onto one node each
 * (GEO audit 2026-08-27, M6). The `sameAs` stays: the article page is a real,
 * additional representation of the entity, and dropping it would be a
 * subtractive change to a document six external sites splice in verbatim.
 *
 * The two vocational schools have no Wikidata item; their own website, the
 * one the CV links, identifies each.
 */
export const SCHOOLS = /** @type {const} */ ({
  ua: {
    "@type": "EducationalOrganization",
    "@id": wikidataEntityUri("Q2037040"),
    name: "University of Alicante",
    alternateName: "UA",
    url: "https://www.ua.es/",
    sameAs: "https://www.wikidata.org/wiki/Q2037040",
  },
  upv: {
    "@type": "EducationalOrganization",
    "@id": wikidataEntityUri("Q2003976"),
    name: "Universitat Politècnica de València",
    alternateName: "UPV",
    url: "https://www.upv.es/",
    sameAs: "https://www.wikidata.org/wiki/Q2003976",
  },
  "ies-berlanga": {
    "@type": "EducationalOrganization",
    name: "IES Luis García Berlanga",
    url: "https://ies-berlanga.info/index.php/es/",
  },
  "salesianos-elche": {
    "@type": "EducationalOrganization",
    name: "IES Salesianos (San José Artesano)",
    url: "https://elche.salesianos.edu/colegio/san-jose-artesano/",
  },
});

/**
 * The page that defines the European Qualifications Framework levels, the set
 * every `educationalLevel` term belongs to.
 */
const EQF_LEVELS = "https://europass.europa.eu/en/description-eight-eqf-levels";

/**
 * The school a key names.
 *
 * @param {string} key - A SCHOOLS key.
 * @returns {Record<string, string>} The school node.
 * @throws {Error} When the key is not in SCHOOLS.
 */
export function schoolNode(key) {
  if (!Object.hasOwn(SCHOOLS, key)) {
    throw new Error(
      `unknown school "${key}"; add it to SCHOOLS in scripts/utils/person-schema.mjs`,
    );
  }
  return SCHOOLS[key];
}

/**
 * The studies as the `#person`'s `alumniOf` and `hasCredential`.
 *
 * Every study is an `alumniOf` Role at its school with its years, the way
 * `hasOccupation` dates the professions: `alumniOf` alone cannot say when,
 * and schema.org's answer for "when" is a Role. A finished study is also a
 * credential with the year it was awarded (`dateCreated`; schema.org's
 * `validFrom` is for offers, not credentials) and its European Qualifications
 * Framework level. Only a university credential is `recognizedBy` its school:
 * a Spanish university awards its own degrees, while a vocational title is
 * awarded by the education authority, which the CV does not name.
 *
 * @param {readonly {
 *   school: string,
 *   name: { en: string, es: string },
 *   startDate?: string,
 *   endDate: string,
 *   credential?: { name?: { en: string, es: string }, category: string, eqfLevel: number },
 * }[]} education - `person.education` from profile/about.yaml.
 * @returns {{ alumniOf: object[], hasCredential: object[] }} The two
 *   properties, ready to spread into the Person node.
 */
export function educationProperties(education) {
  const alumniOf = education.map((entry) => ({
    "@type": "OrganizationRole",
    alumniOf: schoolNode(entry.school),
    roleName: localizedValues(entry.name),
    ...(entry.startDate && { startDate: entry.startDate }),
    endDate: entry.endDate,
  }));
  const hasCredential = education.flatMap((entry) => {
    if (!entry.credential) return [];
    const school = schoolNode(entry.school);
    return [
      {
        "@type": "EducationalOccupationalCredential",
        name: localizedValues(entry.credential.name ?? entry.name),
        credentialCategory: entry.credential.category,
        educationalLevel: {
          "@type": "DefinedTerm",
          name: `EQF level ${entry.credential.eqfLevel}`,
          termCode: String(entry.credential.eqfLevel),
          inDefinedTermSet: EQF_LEVELS,
        },
        dateCreated: entry.endDate,
        ...("@id" in school && { recognizedBy: school }),
      },
    ];
  });
  return { alumniOf, hasCredential };
}

/**
 * The memberships as the `#person`'s `memberOf`: one Role per organization,
 * with the role held and its years.
 *
 * @param {readonly {
 *   organization: { name: string, alternateName?: string, url?: string, description?: { en: string, es: string } },
 *   roleName: { en: string, es: string },
 *   startDate: string,
 *   endDate?: string,
 * }[]} memberships - `person.memberships` from profile/about.yaml.
 * @returns {object[]} The `memberOf` list (empty when there is none).
 */
export function membershipRoles(memberships) {
  return memberships.map((entry) => ({
    "@type": "OrganizationRole",
    memberOf: {
      "@type": "Organization",
      name: entry.organization.name,
      ...(entry.organization.alternateName && {
        alternateName: entry.organization.alternateName,
      }),
      ...(entry.organization.url && { url: entry.organization.url }),
      ...(entry.organization.description && {
        description: localizedValues(entry.organization.description),
      }),
    },
    roleName: localizedValues(entry.roleName),
    startDate: entry.startDate,
    ...(entry.endDate && { endDate: entry.endDate }),
  }));
}
