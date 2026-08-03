import wikidataLabels from "@data/wikidata-labels.json";

/**
 * Canonical Wikidata labels for every Q-id the site references.
 *
 * Three separate places emit `Thing` nodes carrying a Wikidata `@id`: the
 * `#person.knowsAbout` list (BaseHead), post `topics` mapped to
 * `about`/`mentions` (BlogPost) and project `topics` (ProjectsPage). Each used
 * its own authored spelling, so the same `@id` ended up asserting two
 * different names — `Q989632` was both "Network Security" and "Network
 * security", `Q12036888` both "MikroTik RouterOS" and "RouterOS". A single
 * `@id` with conflicting labels is the one thing a shared identifier is
 * supposed to prevent.
 *
 * The authored strings stay untouched where they are *displayed* (the nav
 * drawer stack, the project topic chips); only the schema-facing `name` is
 * normalized, so the graph agrees with Wikidata itself and the UI keeps its
 * own typography.
 *
 * The map is a verified snapshot fetched from the `wbgetentities` API — the
 * English label, or the `mul` (multilingual) label for proper nouns such as
 * OpenSSL, Docker and GitLab that have no language-specific one.
 */
const LABELS = wikidataLabels as Record<string, string>;

/**
 * Q-ids where Wikidata's English *label* is a worse name than another value
 * Wikidata itself publishes for the same entity.
 *
 * Adopting the English label wholesale is right in 93 of 95 cases. These two
 * are not, and both replacements are still Wikidata data — this is not the
 * site inventing its own vocabulary:
 *
 * - `Q1135322` is described by Wikidata as "communications protocol", but its
 *   English label is "Modbus ethernet", which names a narrower thing than the
 *   entity actually is. Its **Spanish label** is plainly "Modbus".
 * - `Q3025536`'s English label is the expansion "development and operations";
 *   "DevOps" is a registered English **alias** and the term every source
 *   actually uses.
 *
 * Verified against `wbgetentities` (labels + aliases) on 2026-08-03.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  Q1135322: "Modbus",
  Q3025536: "DevOps",
};

/** Wikidata's canonical entity URI. Plain `http:` by design — it is a Linked
 * Data identifier, not a fetchable link. */
export function wikidataEntityUri(qid: string): string {
  // eslint-disable-next-line unicorn/prefer-https -- see comment above
  return `http://www.wikidata.org/entity/${qid}`;
}

/**
 * The name to publish for a Wikidata-identified `Thing`.
 *
 * @param qid - The bare Q-id, e.g. `Q989632`.
 * @param authored - The name written in the content source.
 * @returns The canonical Wikidata label, falling back to the authored name for
 *   a Q-id added after this map was last generated.
 */
export function wikidataLabel(qid: string, authored: string): string {
  return LABEL_OVERRIDES[qid] ?? LABELS[qid] ?? authored;
}
