/**
 * Unit tests for `src/utils/linked-text.ts`, the links a FAQ answer carries
 * beside its plain text (the HTML page and the markdown twin render them;
 * the FAQPage node keeps the text plain).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { linkedMarkdown, linkSegments } from "../../src/utils/linked-text.ts";

const ANSWER = "Some servers, and Kleidos, a hardware password manager.";
const KLEIDOS = { text: "Kleidos", href: "https://kleidos.dev/" };

describe("linkSegments", () => {
  it("returns the text whole when there are no links", () => {
    assert.deepEqual(linkSegments(ANSWER), [{ text: ANSWER }]);
    assert.deepEqual(linkSegments(""), [{ text: "" }]);
  });

  it("links the phrase and keeps the text around it", () => {
    assert.deepEqual(linkSegments(ANSWER, [KLEIDOS]), [
      { text: "Some servers, and " },
      { text: "Kleidos", href: "https://kleidos.dev/" },
      { text: ", a hardware password manager." },
    ]);
  });

  it("links only the first occurrence", () => {
    const segments = linkSegments("Kleidos and Kleidos", [KLEIDOS]);
    assert.equal(segments.filter((s) => s.href).length, 1);
    assert.equal(segments.map((s) => s.text).join(""), "Kleidos and Kleidos");
  });

  it("orders several links by position, whatever their authored order", () => {
    const segments = linkSegments("A then B", [
      { text: "B", href: "https://b.example/" },
      { text: "A", href: "https://a.example/" },
    ]);
    assert.deepEqual(
      segments.map((s) => s.href ?? null),
      ["https://a.example/", null, "https://b.example/"],
    );
  });

  it("refuses a phrase the text does not contain", () => {
    assert.throws(
      () =>
        linkSegments(ANSWER, [
          { text: "Kleidos firmware", href: KLEIDOS.href },
        ]),
      /not in/,
    );
    assert.throws(
      () => linkSegments(ANSWER, [{ text: "", href: KLEIDOS.href }]),
      /not in/,
    );
  });

  it("refuses overlapping phrases", () => {
    assert.throws(
      () =>
        linkSegments(ANSWER, [
          KLEIDOS,
          { text: "Kleidos, a", href: "https://x.example/" },
        ]),
      /overlaps/,
    );
  });
});

describe("linkedMarkdown", () => {
  it("writes each linked phrase as a markdown link", () => {
    assert.equal(
      linkedMarkdown(ANSWER, [KLEIDOS]),
      "Some servers, and [Kleidos](https://kleidos.dev/), a hardware password manager.",
    );
  });

  it("leaves text without links unchanged", () => {
    assert.equal(linkedMarkdown(ANSWER), ANSWER);
  });
});
