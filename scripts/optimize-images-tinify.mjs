#!/usr/bin/env node
// TinyPNG (Tinify) image optimizer — compresses image files IN PLACE.
//
// TinyPNG's smart lossy compression beats the local encoder for these covers.
// Run on demand when adding/changing a blog cover (not wired into the build, to
// avoid spending the monthly Tinify quota and a network call on every build).
//
// Reads TINIFY_API_KEY from the environment (kept in ~/.bashrc).
//
// Usage:
//   node scripts/optimize-images-tinify.mjs <file...>
//   node scripts/optimize-images-tinify.mjs --webp <file.png|file.jpg ...>
//
// webp/png/jpeg inputs are compressed in place. With --webp, png/jpeg inputs are
// also converted to .webp (the .webp file is written next to the original).

import fs from "node:fs";
import path from "node:path";

import tinify from "tinify";

import { runWithConcurrency } from "./utils/concurrency.mjs";

const key = process.env.TINIFY_API_KEY;
if (!key) {
  console.error(
    "TINIFY_API_KEY is not set. Add it to ~/.bashrc:\n" +
      '  export TINIFY_API_KEY="<your-key>"',
  );
  process.exit(1);
}
tinify.key = key;

const args = process.argv.slice(2);
const toWebp = args.includes("--webp");
const files = args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error(
    "Usage: node scripts/optimize-images-tinify.mjs [--webp] <file...>",
  );
  process.exit(1);
}

/**
 * Compresses one file through the Tinify API, logging the outcome.
 *
 * @param {string} file - Path of the image.
 * @returns {Promise<boolean>} Whether the file failed.
 */
async function compressOne(file) {
  if (!fs.existsSync(file)) {
    console.warn(`skip (not found): ${file}`);
    return false;
  }
  const before = fs.statSync(file).size;
  try {
    let source = tinify.fromFile(file);
    let outFile = file;
    const ext = path.extname(file).toLowerCase();
    if (toWebp && ext !== ".webp") {
      source = source.convert({ type: "image/webp" });
      outFile = file.replace(/\.(png|jpe?g)$/i, ".webp");
    }
    await source.toFile(outFile);
    const after = fs.statSync(outFile).size;
    const pct = Math.round((1 - after / before) * 100);
    console.log(
      `✓ ${file} → ${outFile}  ${(before / 1024).toFixed(1)} KB → ${(
        after / 1024
      ).toFixed(1)} KB (-${pct}%)`,
    );
    return false;
  } catch (error) {
    console.error(
      `✗ ${file}: ${error instanceof Error ? error.message : error}`,
    );
    return true;
  }
}

// A few files at a time: each is an upload and a download through the API,
// independent of the others. Each line prints as its file finishes.
const outcomes = await runWithConcurrency(
  files.map((file) => () => compressOne(file)),
  4,
);
const failures = outcomes.filter(Boolean).length;

console.log(`Tinify compressions used this month: ${tinify.compressionCount}`);
if (failures > 0) process.exit(1);
