/**
 * Unit tests for the JSON-LD block size guard.
 *
 * The guard runs inside the build so that a block pushed over 80 KB by fresh
 * contributions data fails before the swap (GEO audit #13, M4). These tests
 * pin the report it builds from the measured sizes and its exit codes, the
 * contract `runBuildGuard()` in src/integrations/post-build.ts relies on:
 * 1 is a finding, anything else other than 0 is a guard that could not run.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { sizeReport } from "./check-jsonld-size.mjs";
import { MAX_BLOCK_BYTES } from "./check-schema-ranges.mjs";

const SCRIPT = fileURLToPath(new URL("check-jsonld-size.mjs", import.meta.url));

test("sizeReport lists the blocks above the cap and names the largest block", () => {
  const pages = [
    { file: "a/index.html", sizes: [100, 300] },
    { file: "b/index.html", sizes: [250] },
    { file: "c/index.html" },
  ];
  assert.deepEqual(sizeReport(pages, 200), {
    oversized: [
      { file: "a/index.html", block: 2, bytes: 300 },
      { file: "b/index.html", block: 1, bytes: 250 },
    ],
    largest: { file: "a/index.html", block: 2, bytes: 300 },
  });
  // A block exactly at the cap is within it.
  assert.deepEqual(sizeReport(pages, 300).oversized, []);
  assert.equal(sizeReport([{ file: "x.html", sizes: [] }]).largest, null);
});

/**
 * A throwaway built site: an index.html carrying one JSON-LD block whose
 * body is `bytes` long, or no index.html at all when `bytes` is null.
 *
 * @param {number | null} bytes - The block body's size in bytes.
 * @returns {string} The directory, for the caller to remove.
 */
function makeSite(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jsonld-size-"));
  if (bytes !== null) {
    const prefix = '{"@type":"Thing","name":"';
    const suffix = '"}';
    const body =
      prefix + "x".repeat(bytes - prefix.length - suffix.length) + suffix;
    fs.writeFileSync(
      path.join(dir, "index.html"),
      `<!DOCTYPE html><html><head><script type="application/ld+json">${body}</script></head><body></body></html>`,
    );
  }
  return dir;
}

test("CLI exit codes: 0 within the cap, 1 an oversized block, 2 could not run", () => {
  const atCap = makeSite(MAX_BLOCK_BYTES);
  const overCap = makeSite(MAX_BLOCK_BYTES + 1);
  const notASite = makeSite(null);
  try {
    const run = (dir) =>
      spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    const clean = run(atCap);
    assert.equal(clean.status, 0, clean.stderr);
    assert.match(clean.stdout, /largest is 80\.0 KB .* 0\.0 KB under the cap/);
    const tooBig = run(overCap);
    assert.equal(tooBig.status, 1);
    assert.match(tooBig.stderr, /JSON-LD blocks over 80\.0 KB/);
    assert.match(tooBig.stderr, /block 1 {2}\| index\.html/);
    assert.equal(run(notASite).status, 2);
  } finally {
    for (const dir of [atCap, overCap, notASite])
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
