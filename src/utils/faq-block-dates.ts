/**
 * When each page's FAQ last changed, read from the history of the shared
 * `src/content/page_faq/<locale>.yaml` files.
 *
 * One file per locale holds the pairs of a dozen pages, so the file's own last
 * commit says nothing about any one of them: keyed to the file, editing the
 * /cv/ answers would restamp /about/; keyed to nothing, as it was, the
 * corrected Kleidos answer on 2026-11-08 left /about/ dated 2026-10-30 and out
 * of the IndexNow resubmission. So each commit that touched a file is
 * compared block by block, before against after, and a page takes the date
 * of the newest revision that changed its own block.
 *
 * Pure and import-free, so `scripts/ci/faq-block-dates.test.mjs` runs it
 * under `node --test`; the git reads live in `content-date.ts`.
 *
 * @module
 */

/** One commit that touched a page FAQ file. */
export interface FaqRevision {
  /** Full commit hash. */
  sha: string;
  /** Commit time, ISO 8601. */
  when: string;
  /** Whether the commit counts as a revision, by `isSubstantive`. */
  substantive: boolean;
  /** The parsed file at this commit; `undefined` when unreadable. */
  after: unknown;
  /** The parsed file at the parent; `undefined` when absent there. */
  before: unknown;
}

/**
 * Substantive commits whose change to a page's block was typographic only,
 * keyed by full hash, with the pages it must not date. A commit is listed
 * here, not in `MECHANICAL_COMMITS`, when it really revised another page in
 * the same file: that list is per commit, and would leave neither page
 * dated by it.
 *
 * Closed like that one: an entry is added only for a commit that already
 * landed, with the reason beside it.
 */
export const TYPOGRAPHIC_FAQ_CHANGES: ReadonlyMap<
  string,
  ReadonlySet<string>
> = new Map([
  // fix(projects) #664: corrected the Kleidos answer on /about/ (a real
  // revision) and, in the same file, rewrote the year range of the
  // /publications/ answer from an en dash to "2018 to 2023" while clearing
  // dashes from the files it touched. Not a revision of /publications/,
  // which keeps the date of its last real change (author decision,
  // 2026-11-08).
  ["a0f035883094d840d3c7575333f478c30eed64e0", new Set(["/publications/"])],
]);

/**
 * Each page's block of a parsed page FAQ file, keyed by path, serialized so
 * two revisions compare as strings. Anything that is not the expected shape
 * yields no blocks rather than an error.
 *
 * @param document - The parsed YAML file.
 * @returns path → serialized block.
 */
export function blocksByPath(document: unknown): Map<string, string> {
  const blocks = new Map<string, string>();
  const pages = (document as { pages?: unknown } | undefined)?.pages;
  if (!Array.isArray(pages)) return blocks;
  for (const page of pages) {
    const path = (page as { path?: unknown } | null)?.path;
    if (typeof path === "string") blocks.set(path, JSON.stringify(page));
  }
  return blocks;
}

/**
 * The newest substantive revision of each page's block.
 *
 * @param revisions - Every commit that touched the file, in any order.
 * @param exceptions - Typographic changes to skip, by hash then path.
 * @returns path → ISO timestamp, only for pages some revision changed.
 */
export function faqBlockDates(
  revisions: readonly FaqRevision[],
  exceptions: ReadonlyMap<
    string,
    ReadonlySet<string>
  > = TYPOGRAPHIC_FAQ_CHANGES,
): Map<string, string> {
  const dates = new Map<string, string>();
  for (const revision of revisions) {
    if (!revision.substantive || revision.after === undefined) continue;
    const after = blocksByPath(revision.after);
    const before = blocksByPath(revision.before);
    const skipped = exceptions.get(revision.sha);
    const when = new Date(revision.when);
    if (Number.isNaN(when.getTime())) continue;
    const iso = when.toISOString();
    for (const path of new Set([...after.keys(), ...before.keys()])) {
      if (after.get(path) === before.get(path) || skipped?.has(path)) continue;
      const known = dates.get(path);
      if (!known || known < iso) dates.set(path, iso);
    }
  }
  return dates;
}
