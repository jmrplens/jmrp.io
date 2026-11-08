/**
 * Unit tests for `src/utils/faq-block-dates.ts`: each page dated by the
 * newest substantive revision of its own block in the shared page FAQ file.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blocksByPath,
  faqBlockDates,
  TYPOGRAPHIC_FAQ_CHANGES,
} from "../../src/utils/faq-block-dates.ts";

const page = (path, answer) => ({
  path,
  visible: true,
  items: [{ question: "Q?", answer }],
});
const file = (...pages) => ({ locale: "en", pages });

const revision = (sha, when, before, after, substantive = true) => ({
  sha,
  when,
  substantive,
  before,
  after,
});

const NONE = new Map();

describe("faqBlockDates", () => {
  it("dates only the pages whose block changed", () => {
    const dates = faqBlockDates(
      [
        revision(
          "b",
          "2026-11-08T03:00:00+01:00",
          file(page("/about/", "eight"), page("/cv/", "cv")),
          file(page("/about/", "nine"), page("/cv/", "cv")),
        ),
        revision(
          "a",
          "2026-09-11T10:00:00+02:00",
          undefined,
          file(page("/about/", "eight"), page("/cv/", "cv")),
        ),
      ],
      NONE,
    );
    assert.equal(dates.get("/about/"), "2026-11-08T02:00:00.000Z");
    assert.equal(dates.get("/cv/"), "2026-09-11T08:00:00.000Z");
  });

  it("ignores a commit that is not a revision", () => {
    const dates = faqBlockDates(
      [
        revision(
          "chore",
          "2026-10-27T00:00:00Z",
          file(page("/feeds/", "a")),
          file(page("/feeds/", "b")),
          false,
        ),
        revision(
          "init",
          "2026-09-11T00:00:00Z",
          undefined,
          file(page("/feeds/", "a")),
        ),
      ],
      NONE,
    );
    assert.equal(dates.get("/feeds/"), "2026-09-11T00:00:00.000Z");
  });

  it("skips a listed typographic change for that page only", () => {
    const exceptions = new Map([["fix", new Set(["/publications/"])]]);
    const dates = faqBlockDates(
      [
        revision(
          "fix",
          "2026-11-08T00:00:00Z",
          file(
            page("/about/", "eight"),
            page("/publications/", "2018\u{2013}2023"),
          ),
          file(page("/about/", "nine"), page("/publications/", "2018 to 2023")),
        ),
        revision(
          "audit",
          "2026-09-11T00:00:00Z",
          file(page("/about/", "old"), page("/publications/", "old")),
          file(
            page("/about/", "eight"),
            page("/publications/", "2018\u{2013}2023"),
          ),
        ),
      ],
      exceptions,
    );
    assert.equal(dates.get("/about/"), "2026-11-08T00:00:00.000Z");
    assert.equal(dates.get("/publications/"), "2026-09-11T00:00:00.000Z");
  });

  it("keeps the newest date whatever the input order", () => {
    const older = revision(
      "a",
      "2026-09-01T00:00:00Z",
      undefined,
      file(page("/x/", "1")),
    );
    const newer = revision(
      "b",
      "2026-10-01T00:00:00Z",
      file(page("/x/", "1")),
      file(page("/x/", "2")),
    );
    for (const order of [
      [older, newer],
      [newer, older],
    ]) {
      assert.equal(
        faqBlockDates(order, NONE).get("/x/"),
        "2026-10-01T00:00:00.000Z",
      );
    }
  });

  it("dates a page whose block was removed, and skips unreadable revisions", () => {
    const dates = faqBlockDates(
      [
        revision(
          "drop",
          "2026-10-01T00:00:00Z",
          file(page("/gone/", "a"), page("/kept/", "k")),
          file(page("/kept/", "k")),
        ),
        revision("bad-when", "not a date", undefined, file(page("/y/", "1"))),
        revision("unreadable", "2026-12-01T00:00:00Z"),
      ],
      NONE,
    );
    assert.equal(dates.get("/gone/"), "2026-10-01T00:00:00.000Z");
    assert.equal(dates.has("/kept/"), false);
    assert.equal(dates.has("/y/"), false);
  });
});

describe("blocksByPath", () => {
  it("keys each block by its path", () => {
    const blocks = blocksByPath(file(page("/a/", "1"), page("/b/", "2")));
    assert.deepEqual([...blocks.keys()], ["/a/", "/b/"]);
  });

  it("yields nothing for an unexpected shape", () => {
    for (const value of [
      undefined,
      null,
      "text",
      { pages: "no" },
      { pages: [null, {}] },
    ]) {
      assert.equal(blocksByPath(value).size, 0);
    }
  });
});

describe("TYPOGRAPHIC_FAQ_CHANGES", () => {
  it("keeps /publications/ out of the #664 squash commit", () => {
    assert.equal(
      TYPOGRAPHIC_FAQ_CHANGES.get(
        "a0f035883094d840d3c7575333f478c30eed64e0",
      )?.has("/publications/"),
      true,
    );
  });
});
