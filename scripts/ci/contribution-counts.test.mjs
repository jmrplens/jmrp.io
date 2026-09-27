/**
 * Tests for the counts /projects/contributions/ prints above its lists: each
 * is the count OF the list it heads, never GitHub's search total, which also
 * counts what `exclude` hides (production audit 2026-09-27, N1).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { listedContributionCounts } from "../../src/utils/contribution-counts.ts";

const input = {
  ledgerByYear: {
    2025: { a: [{ state: "merged" }, { state: "closed" }] },
    2026: { a: [{ state: "open" }], b: [{ state: "merged" }] },
  },
  // 44 listed issues, 24 open: the search total said 45 and 25 because an
  // excluded PyPI support request is still open.
  issuesByProject: {
    Kong: { open: 20, closed: 5 },
    pypi: { open: 4, closed: 15 },
  },
  listingSplit: { merged: 14, open: 5 },
};

describe("listedContributionCounts", () => {
  it("counts issues from the per-project rows", () => {
    const counts = listedContributionCounts(input);
    assert.equal(counts.issues, 44);
    assert.equal(counts.issuesOpen, 24);
    assert.equal(counts.issuesClosed, 20);
  });

  it("counts code PRs from the ledger, closed ones as not merged", () => {
    const counts = listedContributionCounts(input);
    assert.equal(counts.codeMerged, 2);
    assert.equal(counts.codeOpen, 1);
    assert.equal(counts.codeNotMerged, 1);
    assert.equal(counts.listingMerged, 14);
  });

  it("totals the ledger and the merged and open listing PRs", () => {
    assert.equal(listedContributionCounts(input).prs, 4 + 14 + 5);
  });
});
