/**
 * Tests for the reader behind the site-wide download total that /projects/
 * and its twin now state in a sentence (GEO audit #11, B11): the figure and
 * its date come from `downloads.json`, and a copy without a usable total or
 * date yields no sentence rather than a zero or a thrown RangeError.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteDownloadsTotal } from "../../src/utils/llms/downloads-total.ts";

describe("siteDownloadsTotal", () => {
  it("returns the total and the moment the file was generated", () => {
    const site = siteDownloadsTotal({
      total: 140_933,
      generatedAt: "2026-09-30T17:16:59.962Z",
    });
    assert.equal(site?.total, 140_933);
    assert.equal(site?.countedAt.toISOString(), "2026-09-30T17:16:59.962Z");
  });

  it("yields nothing for a zero total, which the home card prints as a dash", () => {
    assert.equal(
      siteDownloadsTotal({ total: 0, generatedAt: "2026-09-30T00:00:00Z" }),
      undefined,
    );
  });

  it("yields nothing when the total is not a whole number", () => {
    for (const total of [undefined, null, "140933", 1.5, NaN]) {
      assert.equal(
        siteDownloadsTotal({ total, generatedAt: "2026-09-30T00:00:00Z" }),
        undefined,
      );
    }
  });

  it("yields nothing when the date is missing or unparseable", () => {
    for (const generatedAt of [undefined, null, "", "not a date"]) {
      assert.equal(siteDownloadsTotal({ total: 10, generatedAt }), undefined);
    }
  });
});
