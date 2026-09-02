/**
 * License URIs, and the locale-correct links into `/license/`.
 *
 * The reuse terms are stated in prose on `/license/` and mirrored in
 * `LICENSE-CONTENT.md`. This module is the single place the MACHINE surfaces
 * read them from — the JSON-LD graph and the RSS feed — so a claim emitted for
 * a machine cannot drift from the page that makes it (GEO audit 2026-09-02, M4).
 *
 * Only the two grants the page actually makes are exported, and there is
 * deliberately NO site-wide license: the page assigns different terms to the
 * writing, the covers, the portrait and the code, so a single blanket value
 * would publish a grant the page does not make — and the material it would
 * sweep in is the portrait, the one thing kept outside CC BY on purpose
 * precisely because that grant cannot be withdrawn.
 */
import type { Locale } from "@i18n/config";
import { useTranslatedPath } from "@i18n/utils";
import { getSiteUrl } from "@utils/site";

/**
 * CC BY 4.0 — the writing (articles and the tool documentation) and the covers.
 *
 * The canonical URI, never the localized `deed.es` the Spanish page links for
 * humans: this value is an identifier a machine matches, not a page it reads.
 * Same reasoning already written out in BlogPost.astro for the cover image.
 */
export const CC_BY_4_0 = "https://creativecommons.org/licenses/by/4.0/";

/**
 * MIT — the site source and the interactive tools' own code.
 *
 * `@utils/projects` reads this same constant for its `LICENSE_URLS` map, so
 * `/projects/` and the tool pages name one identifier rather than two spellings
 * of the same license that nothing keeps in step.
 */
export const MIT_LICENSE = "https://opensource.org/licenses/MIT";

/** A section of the license page, addressable in either locale. */
export type LicenseSection =
  "writing" | "covers" | "portrait" | "code" | "permission";

/**
 * The `<h2>` anchors of `/license/`, per locale.
 *
 * The Spanish page's headings are Spanish, so its anchors are too: the
 * fragments are NOT interchangeable between locales, and an English fragment
 * on an `/es/license/` URL is a dead link. Hard-coded rather than derived
 * because the slugs are content, and content that moves should break loudly
 * here rather than silently on the page.
 *
 * All five sections are listed even though the canonical `#person` node links
 * `#portrait` and `#permission` with its own hard-coded English URLs (it must
 * not vary by locale — six external sites splice it in verbatim). The table is
 * a mirror of the page's headings, and a partial mirror is the kind that rots.
 *
 * KEEP-IN-SYNC: the `## ` headings of `src/content/pages/{en,es}/license.mdx`.
 */
const LICENSE_ANCHORS: Record<Locale, Record<LicenseSection, string>> = {
  en: {
    writing: "writing",
    covers: "covers",
    portrait: "portrait",
    code: "code",
    permission: "permission",
  },
  es: {
    writing: "textos",
    covers: "portadas",
    portrait: "retrato",
    code: "código",
    permission: "permiso",
  },
};

/**
 * Absolute URL of the license page, optionally of one of its sections.
 *
 * @param locale - Locale whose license page to link.
 * @param section - Section to deep-link; omit for the page itself.
 * @returns The absolute URL. `URL` percent-encodes a non-ASCII anchor
 *   (`#código` → `#c%C3%B3digo`), which is the form a fragment is matched by
 *   after percent-decoding, so the link resolves either way.
 */
export function licensePageUrl(
  locale: Locale,
  section?: LicenseSection,
): string {
  const path = useTranslatedPath(locale)("/license/");
  const anchor = section ? `#${LICENSE_ANCHORS[locale][section]}` : "";
  return new URL(`${path}${anchor}`, getSiteUrl()).href;
}
