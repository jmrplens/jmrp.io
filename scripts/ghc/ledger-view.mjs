/**
 * The "Code and documentation" ledger of /projects/contributions/ and its
 * markdown twin: one entry per project, in the order both print it.
 *
 * Until 2026-10-30 the entries were ordered by their latest activity, "so an
 * old project cannot outrank this month's" (abf7a95), and each listed its 10
 * newest rows. With 241 merges in 57 projects that put a one-merge project
 * fifth, the MCP Go SDK (7 merged) 43rd, and opened the GitLab entry (85
 * merged, 20 open) with eight open rows and two merged ones. The rule now:
 *
 * - entries with merged work first, most merged first, ties by the position
 *   in `contributedTo` (its star order), then by name;
 * - entries with only open work after them, latest activity first;
 * - within an entry, merged rows first, then open ones, newest first in each;
 * - closed (not merged) rows are left out; the page counts them apart.
 *
 * The caller keeps the cap (LEDGER_MAX_ITEMS), so the first rows it shows
 * are merged ones.
 *
 * Pure: the page and the twin both call it, so they cannot drift.
 *
 * @module
 */

import { instant } from "./upstream-strip.mjs";

/**
 * Newest first, by `createdAt`.
 *
 * @param {{createdAt: string}} a - A row.
 * @param {{createdAt: string}} b - Another row.
 * @returns {number} The sort order.
 */
const newestFirst = (a, b) => instant(b.createdAt) - instant(a.createdAt);

/**
 * The ledger's entries, in display order.
 *
 * @template {{state: string, createdAt: string, fullName: string}} Item
 * @param {Record<string, Record<string, readonly Item[]>>} ledgerByYear - The
 *   dataset's ledger, by year and folded project.
 * @param {readonly {project: string}[]} contributedTo - The dataset's
 *   `contributedTo`, for the tie-break.
 * @returns {{project: string, items: Item[], merged: number, open: number}[]}
 *   One entry per project with merged or open rows.
 */
export function ledgerProjects(ledgerByYear, contributedTo) {
  /** @type {Map<string, Item[]>} */
  const byProject = new Map();
  for (const projects of Object.values(ledgerByYear)) {
    for (const [project, items] of Object.entries(projects)) {
      for (const item of items) {
        if (item.state === "closed") continue;
        byProject.set(project, [...(byProject.get(project) ?? []), item]);
      }
    }
  }
  const position = new Map(contributedTo.map((row, i) => [row.project, i]));
  const at = (project) => position.get(project) ?? Number.POSITIVE_INFINITY;
  return [...byProject]
    .map(([project, items]) => {
      const merged = items
        .filter((it) => it.state === "merged")
        .toSorted(newestFirst);
      const open = items
        .filter((it) => it.state === "open")
        .toSorted(newestFirst);
      return {
        project,
        items: [...merged, ...open],
        merged: merged.length,
        open: open.length,
      };
    })
    .toSorted((a, b) => {
      const landed = Number(b.merged > 0) - Number(a.merged > 0);
      if (landed !== 0) return landed;
      if (a.merged > 0) {
        return (
          b.merged - a.merged ||
          at(a.project) - at(b.project) ||
          a.project.localeCompare(b.project, "en")
        );
      }
      return (
        newestFirst(a.items[0], b.items[0]) ||
        a.project.localeCompare(b.project, "en")
      );
    });
}

/**
 * The repository prefix a row's label carries on the page: the repo's last
 * path segment and a space, or nothing when the row belongs to the repo
 * holding a strict majority of the entry's rows (or the entry has one repo).
 * GitLab's entry (104 rows in gitlab-org/gitlab, 1 in cells/http-router)
 * names only the odd one out; Beszel and OpenCloud (one row in each of two
 * repos) keep both prefixes.
 *
 * @param {readonly {fullName: string}[]} items - The entry's rows.
 * @param {{fullName: string}} item - The row.
 * @returns {string} The prefix, possibly empty.
 */
export function rowPrefix(items, item) {
  const counts = new Map();
  for (const it of items) {
    counts.set(it.fullName, (counts.get(it.fullName) ?? 0) + 1);
  }
  if (counts.size <= 1) return "";
  const majority = [...counts].find(([, n]) => n * 2 > items.length)?.[0];
  if (item.fullName === majority) return "";
  return `${item.fullName.split("/").at(-1) ?? ""} `;
}
