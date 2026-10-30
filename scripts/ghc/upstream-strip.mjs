/**
 * The "Contributed to" strip on /projects/ and the homepage's upstream line:
 * which upstream projects they name, from the dataset's `contributedTo`.
 *
 * Until 2026-10-30 both took the first rows of `contributedTo`, which is
 * ordered by stars. With 241 merged code and docs changes, 84 % of them on
 * GitLab, that named acme.sh, Trilium Notes and Nginx Proxy Manager (8 of the
 * 241 merges) and no GitLab project at all. The rule is now about the work:
 *
 * - eligible: a merge in the 12 months before the dataset's `asOf`;
 * - order: most merged changes, then stars, then the project's name;
 * - at most `perOwner` rows per owner, then the first `size`.
 *
 * There is no fill-up: when fewer projects qualify, the list is shorter, so
 * the rule the page prints under the strip stays true.
 *
 * Pure, with no imports: the page, its markdown twin, the homepage, llms.txt
 * and the nightly rebuild's display projection all call it.
 *
 * @module
 */

/** One year, the strip's window. */
const WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Owners that are one organization to a reader. GitLab's CI/CD components
 * live under `components/` and some infrastructure under `gitlab-com/`;
 * without this, `components/toolkit` (2 merged) would take a row of its own
 * next to two `gitlab-org` projects and push Beszel out.
 */
const OWNER_ALIAS = Object.freeze({
  components: "gitlab-org",
  "gitlab-com": "gitlab-org",
});

/**
 * A dataset timestamp in milliseconds. InfluxDB writes naive UTC times, some
 * with nine fraction digits; GitLab's API writes `...Z`. A naive time is read
 * as UTC, so the window does not move with the build machine's time zone.
 *
 * @param {string | null | undefined} value - The timestamp.
 * @returns {number} Milliseconds since the epoch, or NaN.
 */
function instant(value) {
  if (typeof value !== "string" || value === "") return Number.NaN;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  return Date.parse(zoned);
}

/**
 * The owner a row counts against: the repository's first path segment,
 * folded through {@link OWNER_ALIAS}.
 *
 * @param {string} repo - `owner/repo`, or a nested GitLab path.
 * @returns {string} The owner.
 */
export function stripOwner(repo) {
  const owner = repo.split("/")[0] ?? repo;
  return OWNER_ALIAS[owner] ?? owner;
}

/**
 * Selects the strip's rows.
 *
 * @template {{project: string, repo: string, merged: number,
 *   stars: number | null, lastMergedAt: string | null}} Row
 * @param {readonly Row[]} rows - The dataset's `contributedTo`.
 * @param {string | null | undefined} asOf - The dataset's `asOf`.
 * @param {{size?: number, perOwner?: number}} [options] - How many rows, and
 *   how many from one owner (the homepage asks for 3 and 1).
 * @returns {Row[]} The rows, in display order.
 */
export function selectUpstreamStrip(
  rows,
  asOf,
  { size = 6, perOwner = 2 } = {},
) {
  const end = instant(asOf);
  if (Number.isNaN(end)) return [];
  const ranked = rows
    .filter((row) => {
      const at = instant(row.lastMergedAt);
      return row.merged > 0 && at <= end && end - at <= WINDOW_MS;
    })
    .toSorted(
      (a, b) =>
        b.merged - a.merged ||
        (b.stars ?? -1) - (a.stars ?? -1) ||
        a.project.localeCompare(b.project, "en"),
    );
  const taken = new Map();
  const picked = [];
  for (const row of ranked) {
    const owner = stripOwner(row.repo);
    const count = taken.get(owner) ?? 0;
    if (count >= perOwner) continue;
    taken.set(owner, count + 1);
    picked.push(row);
    if (picked.length === size) break;
  }
  return picked;
}
