/**
 * Tests for the parenthetical the llms documents append to a name: a CV
 * skill note that already arrives in parentheses is not wrapped again, which
 * printed "GoReleaser ((multi-platform releases))" 21 times in each CV twin
 * (GEO audit #11, B6).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parenthetical } from "../../src/utils/llms/parenthetical.ts";

describe("parenthetical", () => {
  it("wraps a bare value", () => {
    assert.equal(parenthetical("2021"), " (2021)");
  });

  it("keeps a value that is already one parenthesized group", () => {
    assert.equal(
      parenthetical("(multi-platform releases)"),
      " (multi-platform releases)",
    );
    assert.equal(
      parenthetical("(MSP430, Tiva C, Code Composer Studio)"),
      " (MSP430, Tiva C, Code Composer Studio)",
    );
  });

  it("keeps nested groups that span the whole value", () => {
    assert.equal(parenthetical("(a (b) c)"), " (a (b) c)");
  });

  it("wraps a value whose first group closes before the end", () => {
    assert.equal(parenthetical("(a) and (b)"), " ((a) and (b))");
  });

  it("returns nothing for an absent or empty value", () => {
    assert.equal(parenthetical(), "");
    assert.equal(parenthetical(""), "");
  });
});
