/**
 * Text for the diff size of a contribution ("+162 −29 · 6 files"), shared
 * by the contributions subpage and its markdown twin so both print the
 * same thing. The lines half is visual only; `spoken` carries the same
 * figures in words for assistive technology, since "+162 −29" read aloud
 * is ambiguous.
 *
 * @module
 */

import type { DiffSize } from "@components/projects/dataset-types";
import type { Locale } from "@i18n/config";
import { formatNumber, pluralize, useTranslations } from "@i18n/utils";
import { diffSpoken } from "@utils/llms/diff-spoken";

/** The pieces a caller renders. */
export interface DiffSizeText {
  /** "5 PRs" / "5 MRs" when the size sums more than one, else null. */
  readonly count: string | null;
  /** "+162", or null when line counts are unknown. */
  readonly added: string | null;
  /** "−29" (U+2212), or null when line counts are unknown. */
  readonly removed: string | null;
  /** The lines in words, or null when line counts are unknown. */
  readonly spoken: string | null;
  /** "6 files". */
  readonly files: string;
  /** Everything on one line, for plain text (the markdown twin). */
  readonly plain: string;
}

/**
 * A single ledger item's size, or null when it has none (an issue, or a
 * row collected before the source carried sizes).
 *
 * @param item - A ledger item.
 * @returns The size of that one item.
 */
export function itemDiffSize(item: {
  readonly kind: string;
  readonly additions?: number | null;
  readonly deletions?: number | null;
  readonly changedFiles?: number | null;
}): DiffSize | null {
  if (item.kind !== "pull_request" || typeof item.changedFiles !== "number") {
    return null;
  }
  const lines =
    typeof item.additions === "number" && typeof item.deletions === "number";
  return {
    prs: 1,
    additions: lines ? (item.additions ?? null) : null,
    deletions: lines ? (item.deletions ?? null) : null,
    changedFiles: item.changedFiles,
  };
}

/**
 * Formats a size for one locale.
 *
 * @param size - The size, or null.
 * @param platform - Decides "PRs" or "MRs" for a multi-item sum.
 * @param locale - Page locale.
 * @returns The pieces, or null when there is no size.
 */
export function diffSizeText(
  size: DiffSize | null | undefined,
  platform: "github" | "gitlab",
  locale: Locale,
): DiffSizeText | null {
  if (!size) return null;
  const t = useTranslations(locale);
  const n = (value: number) => formatNumber(value, locale);
  const countKey =
    platform === "gitlab"
      ? "pages.projectsContributions.diffMrs"
      : "pages.projectsContributions.diffPrs";
  const count = size.prs > 1 ? t(countKey, { count: n(size.prs) }) : null;
  const hasLines = size.additions !== null && size.deletions !== null;
  const added = hasLines ? `+${n(size.additions ?? 0)}` : null;
  const removed = hasLines ? `−${n(size.deletions ?? 0)}` : null;
  const spoken = hasLines
    ? diffSpoken(size.additions ?? 0, size.deletions ?? 0, {
        text: (key, params) => t(`pages.projectsContributions.${key}`, params),
        plural: (value, forms) => pluralize(value, forms, locale),
        format: n,
      })
    : null;
  const files = t(
    size.changedFiles === 1
      ? "pages.projectsContributions.diffFilesOne"
      : "pages.projectsContributions.diffFiles",
    { count: n(size.changedFiles) },
  );
  const plain = [count, hasLines ? `${added} ${removed}` : null, files]
    .filter(Boolean)
    .join(" · ");
  return { count, added, removed, spoken, files, plain };
}

/**
 * Projects per main language, most first (ties by name), for the
 * "by main language" line. Projects with no language are left out.
 *
 * @param rows - "Contributed to" rows.
 * @returns `[language, projects]` pairs.
 */
export function languageCounts(
  rows: readonly { readonly language?: string | null }[],
): [string, number][] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.language) {
      counts.set(row.language, (counts.get(row.language) ?? 0) + 1);
    }
  }
  return [...counts].toSorted(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
}
