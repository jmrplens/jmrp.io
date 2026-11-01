import { wikidataEntityUri } from "@utils/wikidata";
import type {
  EducationalOccupationalCredential,
  EducationalOrganization,
  Organization,
  OrganizationRole,
  Text,
} from "schema-dts";

/**
 * A JSON-LD language-tagged literal: `{ "@value": …, "@language": … }`.
 *
 * `schema-dts` models every `Text`-valued property as a bare `string`, so it
 * rejects this shape — but the shape is not an extension, it is core JSON-LD
 * 1.1 (§4.2.4 "Language-Tagged Strings") and plain RDF. The library's types are
 * simply narrower than the specification they describe; Google's own
 * documentation shows language-tagged values for multilingual entities.
 *
 * Declared here, once, so the widening is a named and explained concept rather
 * than an `as unknown as` scattered across the schema builders. Use it ONLY for
 * properties that genuinely carry one value per language on a single `@id`
 * (`jobTitle`, `description`, `Occupation.name`) — never to smuggle an
 * otherwise ill-typed value past the checker.
 *
 * A `Multilingual<T> = T | LanguageTaggedValue[]` alias was tried and removed: the
 * Person node is emitted inside an object checked with `satisfies WebSite`, and a
 * union that admits the array shape is not assignable to schema-dts's `Text`, so
 * the alias could never actually be applied at the one call site that needed it.
 * The single documented cast in BaseHead.astro is the honest version.
 */
export interface LanguageTaggedValue {
  "@value": string;
  "@language": string;
}

/**
 * The `@id` of the site's Person entity. It is a name, not a location: the
 * eight sites in `.github/identity-consumers.json`, mcp.jmrp.io and kleidos.dev
 * all restate this exact string, and every page here points at it.
 *
 * Hard-coded on purpose, never derived from `PUBLIC_SITE_URL`. If the site
 * moves to another domain, its URLs change but the entity must not: built from
 * the site URL, the `@id` would follow the move silently, splitting one person
 * into two for every consumer still holding the old string. After a move,
 * `https://jmrp.io/` keeps answering with a 301, so the IRI stays
 * dereferenceable. `scripts/ci/build-identity.mjs` repeats the literal.
 */
export const PERSON_ID = "https://jmrp.io/#person";

/**
 * The `@id` of the site's WebSite entity: a name, pinned for the same reason
 * as {@link PERSON_ID}.
 */
export const WEBSITE_ID = "https://jmrp.io/#website";

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
 * Turns an `{ en, es }` pair into JSON-LD language-tagged values.
 *
 * The canonical `#person` node is locale-neutral: it carries ONE `@id`, so it
 * must not change its `jobTitle` depending on which page a consumer crawled.
 * It used to do exactly that, emitting an untagged string picked by `locale`,
 * which left the same entity holding two contradictory titles across the site.
 * Tagged values let both be true at once. English first, so a consumer that
 * ignores the tags and takes the first entry reads what it always read.
 *
 * Mirrors `localizedValues` in `scripts/ci/build-identity.mjs`; the
 * schema-validation spec compares the two documents. The single cast to
 * `Text` is the one documented on {@link LanguageTaggedValue}.
 *
 * @param pair - Object with `en` and `es` strings.
 * @returns The two values, typed as the `Text` schema-dts expects.
 */
export const localizedValues = (pair: { en: string; es: string }) =>
  [
    { "@value": pair.en, "@language": "en" },
    { "@value": pair.es, "@language": "es" },
  ] satisfies LanguageTaggedValue[] as unknown as Text;

/**
 * The schools the `#person` studied at, keyed as `education[].school` in
 * `profile/about.yaml` refers to them.
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
 *
 * Mirrored in `scripts/ci/build-identity.mjs`; the schema-validation spec
 * fails if the two drift.
 */
export const SCHOOLS = {
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
} satisfies Record<string, EducationalOrganization>;

/** The `@id`s of the schools that have one (the two universities). */
export const SCHOOL_IDS: ReadonlySet<string> = new Set(
  Object.values(SCHOOLS).flatMap((school) =>
    "@id" in school ? [school["@id"]] : [],
  ),
);

/** One `education` entry of `profile/about.yaml`, as the schema parses it. */
export interface EducationEntry {
  school: string;
  name: { en: string; es: string };
  startDate?: string;
  endDate: string;
  credential?: {
    name?: { en: string; es: string };
    category: string;
    eqfLevel: number;
  };
}

/** One `memberships` entry of `profile/about.yaml`. */
export interface MembershipEntry {
  organization: {
    name: string;
    alternateName?: string;
    url?: string;
    description?: { en: string; es: string };
  };
  roleName: { en: string; es: string };
  startDate: string;
  endDate?: string;
}

/**
 * The page that defines the European Qualifications Framework levels, the set
 * every `educationalLevel` term below belongs to.
 */
const EQF_LEVELS = "https://europass.europa.eu/en/description-eight-eqf-levels";

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
 * Shared by BaseHead (the canonical node) and the pages that restate the
 * `#person` as a ProfilePage's main entity (AboutPage, CVPage), so all of
 * them emit the same value. Mirrored in `scripts/ci/build-identity.mjs`.
 *
 * @param education - `person.education` from `profile/about.yaml`.
 * @returns The two properties, ready to spread into the Person node.
 */
export function educationProperties(education: readonly EducationEntry[]) {
  const school = (key: string) => {
    if (!(key in SCHOOLS)) {
      throw new Error(
        `profile/about.yaml education: unknown school "${key}"; add it to SCHOOLS in src/utils/person.ts`,
      );
    }
    return SCHOOLS[key as keyof typeof SCHOOLS];
  };
  const alumniOf = education.map(
    (entry) =>
      ({
        "@type": "OrganizationRole",
        alumniOf: school(entry.school),
        roleName: localizedValues(entry.name),
        ...(entry.startDate && { startDate: entry.startDate }),
        endDate: entry.endDate,
      }) satisfies OrganizationRole<EducationalOrganization, "alumniOf">,
  );
  const hasCredential = education.flatMap((entry) => {
    if (!entry.credential) return [];
    const where = school(entry.school);
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
        ...("@id" in where && { recognizedBy: where }),
      } satisfies EducationalOccupationalCredential,
    ];
  });
  return { alumniOf, hasCredential };
}

/**
 * The memberships as the `#person`'s `memberOf`: one Role per organization,
 * with the role held and its years. Mirrored in
 * `scripts/ci/build-identity.mjs`.
 *
 * @param memberships - `person.memberships` from `profile/about.yaml`.
 * @returns The `memberOf` list (empty when there is none).
 */
export function membershipRoles(memberships: readonly MembershipEntry[]) {
  return memberships.map(
    (entry) =>
      ({
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
      }) satisfies OrganizationRole<Organization, "memberOf">,
  );
}
