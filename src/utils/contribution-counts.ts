/**
 * The counts /projects/contributions/ and its markdown twin print above
 * their lists, derived from the lists themselves.
 *
 * `summary.contributionTotals` counts everything GitHub's public search
 * returns: it must, because the live /projects tokens are compared against
 * that search. The subpage lists less than that on purpose: `exclude` in
 * `contributions.yaml` removes an item from every list, and listing and
 * packaging PRs are not listed at all (their section went on 2026-10-30:
 * they publish the owner's own projects, they are not work on someone
 * else's code). A header built from the search
 * totals therefore disagreed with the rows under it (production audit
 * 2026-09-27, N1: "45 issues (25 open)" above rows summing to 44 and 24,
 * the missing one being an excluded PyPI support request). Every figure
 * that sits above a list on the subpage is computed here from that list.
 *
 * A leaf on purpose (no imports), so the unit tests load it directly.
 */

/** A ledger item, reduced to what the counts read. */
interface CountedItem {
  readonly state: string;
}

/** The parts of the contributions dataset the counts are derived from. */
export interface ListedContributionsInput {
  /** Code and docs PRs/MRs by year, then folded project. */
  readonly ledgerByYear: Readonly<
    Record<string, Readonly<Record<string, readonly CountedItem[]>>>
  >;
  /** Issues by folded project. */
  readonly issuesByProject: Readonly<
    Record<string, { readonly open: number; readonly closed: number }>
  >;
}

/** The figures printed above the subpage's lists. */
export interface ListedContributionCounts {
  /** Code/docs PRs in the ledger, every state. */
  readonly prs: number;
  /** Merged code/docs PRs in the ledger. */
  readonly codeMerged: number;
  /** Open code/docs PRs in the ledger. */
  readonly codeOpen: number;
  /** Closed-unmerged code/docs PRs (the "Not merged (N)" line). */
  readonly codeNotMerged: number;
  /** Issues in the per-project list. */
  readonly issues: number;
  /** Open issues in the per-project list. */
  readonly issuesOpen: number;
  /** Closed issues in the per-project list. */
  readonly issuesClosed: number;
}

/**
 * Counts what the subpage lists. Pure.
 *
 * @param input - The listed parts of the dataset.
 * @returns The counts to print above each list.
 */
export function listedContributionCounts(
  input: ListedContributionsInput,
): ListedContributionCounts {
  let codeMerged = 0;
  let codeOpen = 0;
  let codeNotMerged = 0;
  for (const projects of Object.values(input.ledgerByYear)) {
    for (const items of Object.values(projects)) {
      for (const item of items) {
        if (item.state === "merged") codeMerged += 1;
        else if (item.state === "open") codeOpen += 1;
        else codeNotMerged += 1;
      }
    }
  }
  let issuesOpen = 0;
  let issuesClosed = 0;
  for (const counts of Object.values(input.issuesByProject)) {
    issuesOpen += counts.open;
    issuesClosed += counts.closed;
  }
  return {
    prs: codeMerged + codeOpen + codeNotMerged,
    codeMerged,
    codeOpen,
    codeNotMerged,
    issues: issuesOpen + issuesClosed,
    issuesOpen,
    issuesClosed,
  };
}
