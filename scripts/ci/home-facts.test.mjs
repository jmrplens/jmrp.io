/**
 * Tests for the homepage twin's featured-project lines: a localized
 * "Language" label (twin audit 2026-09-27, W8) and a colon, not an em dash,
 * between the id and its URL (W11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { featuredProjectLines } from "../../src/utils/llms/home-facts.ts";

const card = {
  id: "phonometry",
  url: "https://github.com/jmrplens/phonometry",
  language: "Python",
  summary: "Acoustics for Python.",
};

describe("featuredProjectLines", () => {
  it("prints the label it is given and separates id and URL with a colon", () => {
    assert.deepEqual(featuredProjectLines([card], "Lang"), [
      "- phonometry: https://github.com/jmrplens/phonometry",
      "  Lang: Python",
      "  Acoustics for Python.",
    ]);
  });

  it("never emits an em dash", () => {
    const text = featuredProjectLines([card], "Language").join("\n");
    assert.ok(!text.includes(String.fromCodePoint(0x20_14)));
  });
});
