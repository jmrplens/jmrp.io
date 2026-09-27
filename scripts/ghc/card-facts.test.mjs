/**
 * Tests for `shapeCardFacts`, the build-time view of each /projects/ card's
 * live rows that the markdown twin uses to print only the rows the card
 * shows (production audit 2026-09-27, N7).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { shapeCardFacts } from "./build-data.mjs";

test("one entry per roster repo, with its stars, gain and release tag", () => {
  assert.deepEqual(
    shapeCardFacts(
      ["ghchronicle", "portainer-mcp"],
      [
        { repo: "ghchronicle", stars: 0, stars30d: 0 },
        { repo: "portainer-mcp", stars: 2, stars30d: 1 },
      ],
      [{ repo: "ghchronicle", tag: "v2.5.1", ageDays: 1 }],
    ),
    {
      ghchronicle: { stars: 0, stars30d: 0, releaseTag: "v2.5.1" },
      "portainer-mcp": { stars: 2, stars30d: 1, releaseTag: null },
    },
  );
});

test("a repo the star query did not return counts as zero stars", () => {
  assert.deepEqual(shapeCardFacts(["x"], [], []), {
    x: { stars: 0, stars30d: 0, releaseTag: null },
  });
});
