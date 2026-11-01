import type {
  EducationalOccupationalCredential,
  EducationalOrganization,
  Organization,
  OrganizationRole,
  Text,
} from "schema-dts";

import {
  educationProperties as buildEducationProperties,
  localizedValues as tagLanguages,
  membershipRoles as buildMembershipRoles,
  SCHOOLS as SCHOOL_NODES,
} from "../../scripts/utils/person-schema.mjs";

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
 * Turns an `{ en, es }` pair into JSON-LD language-tagged values; the rule
 * and its reasons live in `scripts/utils/person-schema.mjs`, which
 * `scripts/ci/build-identity.mjs` imports too. The single cast to `Text` is
 * the one documented on {@link LanguageTaggedValue}.
 *
 * @param pair - Object with `en` and `es` strings.
 * @returns The two values, typed as the `Text` schema-dts expects.
 */
export const localizedValues = (pair: { en: string; es: string }) =>
  tagLanguages(pair) satisfies LanguageTaggedValue[] as unknown as Text;

/**
 * The schools the `#person` studied at, keyed as `education[].school` in
 * `profile/about.yaml` (and the CV's `school`/`partOf`) refers to them.
 * Defined, with its reasons, in `scripts/utils/person-schema.mjs`; checked
 * here against schema-dts.
 */
export const SCHOOLS = SCHOOL_NODES satisfies Record<
  string,
  EducationalOrganization
>;

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
 * The studies as the `#person`'s `alumniOf` (one dated Role each) and
 * `hasCredential` (the finished ones), built by the shared rule in
 * `scripts/utils/person-schema.mjs`. Used by BaseHead (the canonical node)
 * and by the pages that restate the `#person` (AboutPage, CVPage), so all of
 * them emit the same value as `/identity/person.jsonld`.
 *
 * @param education - `person.education` from `profile/about.yaml`.
 * @returns The two properties, ready to spread into the Person node.
 */
export function educationProperties(education: readonly EducationEntry[]) {
  const { alumniOf, hasCredential } = buildEducationProperties(education);
  return {
    alumniOf: alumniOf as OrganizationRole<
      EducationalOrganization,
      "alumniOf"
    >[],
    hasCredential: hasCredential as EducationalOccupationalCredential[],
  };
}

/**
 * The memberships as the `#person`'s `memberOf`, one dated Role each, built
 * by the shared rule in `scripts/utils/person-schema.mjs`.
 *
 * @param memberships - `person.memberships` from `profile/about.yaml`.
 * @returns The `memberOf` list (empty when there is none).
 */
export function membershipRoles(memberships: readonly MembershipEntry[]) {
  return buildMembershipRoles(memberships) as OrganizationRole<
    Organization,
    "memberOf"
  >[];
}
