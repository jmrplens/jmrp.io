/**
 * JSON-LD block size guard
 *
 * Fails when any JSON-LD block of the built site is larger than
 * `MAX_BLOCK_BYTES` (80 KB). The Schema Markup Validator extracted 0 objects
 * from the 268 KB block of /projects/contributions/ and 8 once it was cut to
 * 88 KB, so a block that grows past that size takes the whole page's graph
 * out of reach while staying valid in every range (GEO audit #13, M4).
 *
 * `check-schema-ranges.mjs` makes the same check, but it runs in `pnpm verify`
 * and in CI, and neither sees the data that makes the block grow: CI builds
 * from `src/data/ghc/fixture.json`, and `pnpm verify` on the production host
 * runs its dist phase after the build has already been swapped live. The
 * daily contributions rebuild (`scripts/ghc/rebuild-if-changed.mjs`) runs
 * `pnpm build` and no check at all. This script exists to run INSIDE the
 * build, from `astro:build:done` (`src/integrations/post-build.ts`, through
 * the same `runBuildGuard()` as the markdown-twin and `<dl>` guards), so that
 * a block pushed over the cap by fresh data fails the build before
 * `deploy-swap.mjs` retargets `dist`. It reads only sizes, with no
 * vocabulary, so it adds a fraction of a second.
 *
 * It also prints the largest block and its margin under the cap on success,
 * so that the build log shows the headroom shrinking before it runs out.
 *
 * Run manually: `node scripts/ci/check-jsonld-size.mjs [distDir]`
 *
 * Exit codes: 0 every block within the cap · 1 oversized blocks found
 * (listed) · 2 the guard itself could not run (bad argument, unreadable
 * build).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_BLOCK_BYTES,
  oversizedBlocks,
  readDist,
} from "./check-schema-ranges.mjs";

/**
 * The size findings for a set of built pages.
 *
 * @param {{file: string, sizes?: number[]}[]} pages - Pages with the UTF-8
 *   byte size of each of their JSON-LD blocks, as `readDist` returns them.
 * @param {number} [limit] - The cap in bytes; `MAX_BLOCK_BYTES` by default.
 * @returns {{
 *   oversized: {file: string, block: number, bytes: number}[],
 *   largest: {file: string, block: number, bytes: number} | null,
 * }} Every block above the cap (largest first), and the largest block of
 *   all, or `null` when no page carries JSON-LD.
 */
export function sizeReport(pages, limit = MAX_BLOCK_BYTES) {
  const [largest = null] = oversizedBlocks(pages, -1);
  return { oversized: oversizedBlocks(pages, limit), largest };
}

/**
 * Bytes as KB (1024 bytes) with one decimal, the unit the cap is stated in.
 *
 * @param {number} bytes - A size in bytes.
 * @returns {string} E.g. "57.3 KB".
 */
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Entry point: validates the directory, measures every block, reports.
 *
 * @param {string[]} argv - Command-line arguments after the script path.
 */
function main(argv) {
  const distArg = argv.find((a) => !a.startsWith("--")) ?? "dist";
  const resolved = path.resolve(process.cwd(), distArg);
  const isDirectory =
    fs.existsSync(resolved) && fs.statSync(resolved).isDirectory(); // NOSONAR: this IS the validation S8707 asks for, on the canonical path
  if (!isDirectory)
    throw new Error(`${distArg} (${resolved}) is not an existing directory`);
  // `dist` is a symlink to the live colour: resolve it once.
  const distDir = fs.realpathSync(resolved);
  if (!fs.existsSync(path.join(distDir, "index.html")))
    throw new Error(
      `${distArg} (${resolved}) holds no index.html; this guard reads built ` +
        `site output, and refuses to walk a directory that is not one`,
    );

  const { pages } = readDist(distDir);
  const { oversized, largest } = sizeReport(pages);

  if (oversized.length === 0) {
    const detail = largest
      ? `largest is ${kb(largest.bytes)} (block ${largest.block} of ` +
        `${largest.file}), ${kb(MAX_BLOCK_BYTES - largest.bytes)} under the cap`
      : "no page carries JSON-LD";
    console.log(
      `✅ No JSON-LD block over ${kb(MAX_BLOCK_BYTES)} in ${distArg}: ${detail}.`,
    );
    return;
  }
  console.error(`❌ JSON-LD blocks over ${kb(MAX_BLOCK_BYTES)} in ${distArg}:`);
  for (const { file, block, bytes } of oversized)
    console.error(`    ${kb(bytes).padStart(10)}  block ${block}  | ${file}`);
  console.error(
    "\n  The Schema Markup Validator extracts nothing from a block this\n" +
      "  size, so every node on the page goes unread. Keep in the graph what\n" +
      "  the page shows in view, and point at the full list through a Dataset\n" +
      "  whose distribution is a file (the markdown twin, a JSON file). See\n" +
      "  GEO audit #13, M4.\n",
  );
  process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    // Exit 2, never 1: a guard that could not run must not read as a finding.
    console.error("❌ check-jsonld-size could not run:", error);
    process.exitCode = 2;
  }
}
