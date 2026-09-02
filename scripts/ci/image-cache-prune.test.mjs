/**
 * Unit tests for the optimized-image cache guard
 * (`src/integrations/pre-build/image-cache.ts`).
 *
 * The bug these lock down: `vite-plugin-image-optimizer` keys its cache by
 * path, so a replaced `public/` file keeps being served from the blob of the
 * file it replaced. The guard must drop exactly the blobs it cannot certify,
 * and must keep the `_astro/*` blobs when — and only when — the manifest
 * proves they were produced under the current encoder settings.
 *
 * Everything runs in a temp directory; nothing in the project is touched.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { pruneStaleOptimizedImageCache } from "../../src/integrations/pre-build/image-cache.ts";

/** Silent logger with the shape the guard expects. */
const logger = /** @type {any} */ ({
  info() {},
  warn() {},
  error() {},
  debug() {},
  fork: () => logger,
  options: {},
  label: "test",
});

/** Optimizer options stand-in; only its serialized form matters here. */
const OPTIONS = { png: { quality: 80 } };

/** Cache-relative path of the bundled blob that must never collide. */
const BUNDLED = "_astro/bundled.hash.webp";

let root = "";
let publicDir = "";
let cacheDir = "";

/**
 * Writes a file, creating its parent directory first.
 *
 * @param {string} base - Absolute directory the path is relative to.
 * @param {string} rel - Path relative to `base`.
 * @param {string} content - Bytes to write.
 * @returns {void}
 */
function write(base, rel, content) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/**
 * Rebuilds the fixture: three public images (one with an uppercase extension,
 * because the plugin's matcher carries the `/i` flag) with a cache blob each,
 * plus one bundled blob under `_astro/`.
 *
 * @returns {void}
 */
function seed() {
  fs.rmSync(root, { recursive: true, force: true });
  write(publicDir, "logo.png", "ORIGINAL-LOGO");
  write(publicDir, "nested/photo.webp", "ORIGINAL-PHOTO");
  write(publicDir, "MARK.PNG", "ORIGINAL-MARK");
  seedBlobs();
}

/**
 * Re-creates every cache blob, so a test can start from a certified cache
 * after an earlier run legitimately emptied it.
 *
 * @returns {void}
 */
function seedBlobs() {
  write(cacheDir, "logo.png", "BLOB-LOGO");
  write(cacheDir, "nested/photo.webp", "BLOB-PHOTO");
  write(cacheDir, "MARK.PNG", "BLOB-MARK");
  write(cacheDir, BUNDLED, "BLOB-BUNDLED");
}

/**
 * Runs the guard against the fixture.
 *
 * @param {Record<string, unknown>} [options] - Optimizer options to sign with.
 * @returns {Promise<void>}
 */
function prune(options = OPTIONS) {
  return pruneStaleOptimizedImageCache(
    { publicDir, cacheDir, options },
    logger,
  );
}

/**
 * Whether a path inside the cache directory still exists.
 *
 * @param {string} rel - Cache-relative path.
 * @returns {boolean} True if present.
 */
const cached = (rel) => fs.existsSync(path.join(cacheDir, rel));

/**
 * Brings the fixture to a fully certified state: seed, prune (which wipes a
 * cache with no recorded provenance), re-seed the blobs, prune again.
 *
 * @returns {Promise<void>}
 */
async function certifiedCache() {
  seed();
  await prune();
  seedBlobs();
  await prune();
}

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "jmrp-image-cache-"));
  publicDir = path.join(root, "public");
  cacheDir = path.join(root, "cache");
});

after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test("a cache with no manifest is dropped whole, bundled blobs included", async () => {
  seed();
  await prune();
  // Nothing on disk had a stated provenance, so nothing is kept — including
  // the `_astro` half, whose bundle hash covers the source bytes but not the
  // encoder settings that produced the blob.
  assert.equal(cached("logo.png"), false);
  assert.equal(cached("nested/photo.webp"), false);
  assert.equal(cached(BUNDLED), false);
  assert.equal(cached(".image-sources.json"), true);
});

test("a second run with unchanged sources drops nothing", async () => {
  await certifiedCache();
  assert.equal(cached("logo.png"), true);
  assert.equal(cached("nested/photo.webp"), true);
  assert.equal(cached(BUNDLED), true);
});

test("replacing one source drops exactly that blob", async () => {
  await certifiedCache();

  // The favicon.png case: same name, different bytes.
  write(publicDir, "logo.png", "REPLACED-LOGO");
  await prune();
  assert.equal(cached("logo.png"), false);
  assert.equal(cached("nested/photo.webp"), true);
  assert.equal(cached(BUNDLED), true);
});

test("an uppercase extension is certified like any other", async () => {
  await certifiedCache();
  assert.equal(cached("MARK.PNG"), true);

  write(publicDir, "MARK.PNG", "REPLACED-MARK");
  await prune();
  assert.equal(cached("MARK.PNG"), false);
  assert.equal(cached("logo.png"), true);
});

test("deleting a source drops its orphaned blob", async () => {
  await certifiedCache();
  fs.rmSync(path.join(publicDir, "logo.png"));
  await prune();
  assert.equal(cached("logo.png"), false);
  assert.equal(cached("nested/photo.webp"), true);
});

test("changing the optimizer settings invalidates the whole cache", async () => {
  await certifiedCache();
  await prune({ png: { quality: 90 } });
  assert.equal(cached(BUNDLED), false);
  assert.equal(cached("logo.png"), false);
});
