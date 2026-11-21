/**
 * Tests for the content hash of `scripts/cv/build-cvs.mjs`.
 *
 * The test lives in `scripts/ci/` rather than next to the module on purpose:
 * build-cvs.mjs hashes every `.mjs` file in `scripts/cv/` as a PDF input, so a
 * test there would force a ~70 s LaTeX recompile whenever it was edited.
 */

// cspell:words descargas

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  computeInputHash,
  downloadsDisplayProjection,
} from "../cv/build-cvs.mjs";
import { formatStats } from "../cv/github-stats.mjs";
import { DOWNLOADS_DATA_PATH } from "../refresh-downloads.mjs";

const tmpRoots = [];

after(() => {
  for (const dir of tmpRoots) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A downloads snapshot shaped like the one refresh-downloads.mjs writes.
 *
 * @param {Record<string, number>} totals - Total per project.
 * @param {string} [generatedAt] - The snapshot's timestamp.
 * @returns {object} The snapshot.
 */
function snapshot(totals, generatedAt = "2026-11-21T15:33:52.152Z") {
  const projects = {};
  for (const [name, total] of Object.entries(totals)) {
    projects[name] = { releases: total, docker: 0, nuget: 0, total };
  }
  const total = Object.values(totals).reduce((sum, n) => sum + n, 0);
  return { total, generatedAt, sources: { githubReleases: total }, projects };
}

/**
 * Hashes a snapshot the way build:cv does, from a throwaway repository root
 * that holds it at the real snapshot path.
 *
 * @param {object} data - The snapshot to write.
 * @returns {string} The input hash.
 */
function hashOf(data) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cv-build-hash-"));
  tmpRoots.push(root);
  const file = path.join(root, DOWNLOADS_DATA_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return computeInputHash([file], { root, format: formatStats });
}

describe("build:cv downloads hash", () => {
  const base = { "gitlab-mcp-server": 184_519, "libgen-mcp": 11_098, x: 104 };

  it("ignores changes that stay below the printed rounding", () => {
    // 184519 and 184700 both print "~185k"; 104 and 900 both stay under the
    // display floor; the site-wide total and channel split move too.
    const moved = { ...base, "gitlab-mcp-server": 184_700, x: 900 };
    assert.equal(hashOf(snapshot(base)), hashOf(snapshot(moved)));
  });

  it("changes when a printed figure changes", () => {
    const rounded = { ...base, "gitlab-mcp-server": 185_600 };
    assert.notEqual(hashOf(snapshot(base)), hashOf(snapshot(rounded)));
  });

  it("changes when a project crosses the display floor", () => {
    const crossed = { ...base, x: 1000 };
    assert.notEqual(hashOf(snapshot(base)), hashOf(snapshot(crossed)));
  });

  it("changes when a project's total appears or disappears", () => {
    const withoutX = Object.fromEntries(
      Object.entries(base).filter(([name]) => name !== "x"),
    );
    assert.notEqual(hashOf(snapshot(base)), hashOf(snapshot(withoutX)));
  });

  it("ignores generatedAt", () => {
    assert.equal(
      hashOf(snapshot(base, "2026-11-21T15:33:52.152Z")),
      hashOf(snapshot(base, "2026-11-22T04:30:00.000Z")),
    );
  });

  it("hashes an unparsable snapshot by its bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cv-build-hash-"));
    tmpRoots.push(root);
    const file = path.join(root, DOWNLOADS_DATA_PATH);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    const first = computeInputHash([file], { root, format: formatStats });
    fs.writeFileSync(file, "{ not json either");
    const second = computeInputHash([file], { root, format: formatStats });
    assert.notEqual(first, second);
  });
});

describe("downloadsDisplayProjection", () => {
  it("keeps the badges the PDFs print, in both locales", () => {
    const projection = JSON.parse(
      downloadsDisplayProjection(snapshot({ b: 184_519, a: 500 }), formatStats),
    );
    assert.deepEqual(projection, [
      ["a", [["0★"], ["0★"]]],
      [
        "b",
        [
          ["0★", "~185k downloads"],
          ["0★", "~185k descargas"],
        ],
      ],
    ]);
  });

  it("maps a project without a numeric total to null", () => {
    const projection = JSON.parse(
      downloadsDisplayProjection(
        { projects: { a: { releases: 3 } } },
        formatStats,
      ),
    );
    assert.deepEqual(projection, [["a", null]]);
  });

  it("returns an empty projection for a snapshot with no projects", () => {
    assert.equal(downloadsDisplayProjection({}, formatStats), "[]");
    assert.equal(downloadsDisplayProjection(null, formatStats), "[]");
  });
});
