/**
 * Tests for `absolutizeRootLinks`, the pass that makes the root-relative
 * links of an MDX body absolute in its markdown twin (twin audit 2026-09-27,
 * W10).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { absolutizeRootLinks } from "../../src/utils/llms/absolute-links.ts";

const SITE = "https://jmrp.io";

describe("absolutizeRootLinks", () => {
  it("rewrites inline links and images that start at the site root", () => {
    assert.equal(
      absolutizeRootLinks(
        "See [the tarpit](/blog/005-tarpit/) and ![x](/img/a.webp).",
        SITE,
      ),
      "See [the tarpit](https://jmrp.io/blog/005-tarpit/) and ![x](https://jmrp.io/img/a.webp).",
    );
  });

  it("rewrites reference definitions", () => {
    assert.equal(
      absolutizeRootLinks("[home]: /homelab/", SITE),
      "[home]: https://jmrp.io/homelab/",
    );
  });

  it("leaves absolute, protocol-relative, fragment and relative links alone", () => {
    const text =
      "[a](https://x.dev/) [b](//cdn.x/y) [c](#faq) [d](../up/) [e](mailto:x@y)";
    assert.equal(absolutizeRootLinks(text, SITE), text);
  });

  it("does not touch fenced code blocks or inline code", () => {
    const text = [
      "Use `[x](/not-a-link)` literally.",
      "```md",
      "[x](/inside-fence)",
      "```",
      "[y](/after)",
    ].join("\n");
    assert.equal(
      absolutizeRootLinks(text, SITE),
      [
        "Use `[x](/not-a-link)` literally.",
        "```md",
        "[x](/inside-fence)",
        "```",
        "[y](https://jmrp.io/after)",
      ].join("\n"),
    );
  });

  it("tolerates a trailing slash on the origin", () => {
    assert.equal(
      absolutizeRootLinks("[a](/cv/)", "https://jmrp.io/"),
      "[a](https://jmrp.io/cv/)",
    );
  });
});
