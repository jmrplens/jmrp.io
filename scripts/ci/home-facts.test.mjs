/**
 * Tests for the homepage twin's featured-project lines: a localized
 * "Language" label (twin audit 2026-09-27, W8), the display name the card
 * shows as its title, and a colon, not an em dash, between name and URL (W11).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { featuredProjectLines } from "../../src/utils/llms/home-facts.ts";

const card = {
  id: "gitlab-mcp-server",
  name: "GitLab MCP Server",
  url: "https://github.com/jmrplens/gitlab-mcp-server",
  language: "Go",
  summary: "GitLab operations as AI tools.",
};

describe("featuredProjectLines", () => {
  it("prints the display name and the label it is given, name and URL split by a colon", () => {
    assert.deepEqual(featuredProjectLines([card], "Lang"), [
      "- GitLab MCP Server: https://github.com/jmrplens/gitlab-mcp-server",
      "  Lang: Go",
      "  GitLab operations as AI tools.",
    ]);
  });

  it("never emits an em dash", () => {
    const text = featuredProjectLines([card], "Language").join("\n");
    assert.ok(!text.includes(String.fromCodePoint(0x20_14)));
  });
});
