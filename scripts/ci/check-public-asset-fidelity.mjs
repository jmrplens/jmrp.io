/**
 * Public Asset Fidelity Checker
 *
 * Answers one question the rest of the pipeline never asks: does the image the
 * build published still depict the image that is in `public/`?
 *
 * Nothing between `public/` and `dist/` is supposed to change an image's
 * subject — the optimizer only re-encodes. But `vite-plugin-image-optimizer`
 * caches by path with no content check, so a `public/` file replaced under the
 * same name is served from the blob derived from the file it replaced. That
 * shipped a 32x32 January icon as `favicon.png` for four days while
 * `public/favicon.png` was 144x144 and both RSS feeds declared 144 over it.
 * The CI check that ran on that commit validated the feed XML, not the image.
 *
 * For every image under `public/` this compares the built artefact with its
 * source: same format, same pixel dimensions, and the same picture — decoded
 * to raw pixels and compared channel by channel. Re-encoding moves those
 * numbers a little (measured on this site: at most 1.6 of 255 on the worst
 * asset); a different image moves them far more, and a resize or a format
 * change is caught outright before the pixel test runs. SVGs are rendered to a
 * fixed-size bitmap first, so an SVGO rewrite passes and a frozen older
 * drawing does not.
 *
 * Exits non-zero listing every asset that no longer matches.
 *
 * Run manually: `node scripts/ci/check-public-asset-fidelity.mjs [distDir]`
 * Wired into `pnpm verify` ("Lint: Public asset fidelity") and into the
 * `image-optimization` CI job.
 */

import fs from "node:fs";
import path from "node:path";

import { glob } from "glob";
import sharp from "sharp";

const PUBLIC_DIR = path.resolve(process.cwd(), "public");
const DIST_DIR = path.resolve(process.cwd(), process.argv[2] ?? "dist");

/** Extensions worth comparing: everything the image optimizer may rewrite. */
const IMAGE_GLOB = "**/*.{jpg,jpeg,png,gif,tiff,webp,svg,avif}";

/**
 * Glob options matching the image optimizer's own matcher, which is
 * case-insensitive (`vite-plugin-image-optimizer/dist/index.js:180`, the `/i`
 * flag). Without `nocase` a `public/LOGO.PNG` would be optimized by the plugin
 * and never compared here; `dot` covers `public/.well-known/` and friends.
 */
const GLOB_OPTIONS = { nodir: true, nocase: true, dot: true };

/**
 * Largest mean absolute per-channel difference (0-255) still attributable to
 * re-encoding. The worst legitimate asset on this site measures 1.54; the
 * limit leaves roughly 4x headroom while a substituted image scores tens.
 */
const MAX_MEAN_ABS_DIFF = 6;

/** Square size, in pixels, at which SVGs are rendered before comparison. */
const SVG_RASTER_PX = 256;

/**
 * Decodes a file to two raw buffers: the colour channels composited over
 * black (so fully transparent pixels, whose RGB values are arbitrary after
 * palette quantization, cannot dominate the comparison) and the alpha channel
 * on its own (so a lost transparency mask is still caught).
 *
 * @param {string} file - Absolute path to the image.
 * @param {boolean} isSvg - Whether to render vector input to a bitmap first.
 * @returns {Promise<{ colour: Buffer, alpha: Buffer }>} Raw pixel buffers.
 */
async function decode(file, isSvg) {
  const base = () =>
    isSvg
      ? sharp(file, { density: 384 }).resize(SVG_RASTER_PX, SVG_RASTER_PX, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
      : sharp(file);

  const [colour, alpha] = await Promise.all([
    base().flatten({ background: "#000000" }).raw().toBuffer(),
    base().ensureAlpha().extractChannel(3).raw().toBuffer(),
  ]);
  return { colour, alpha };
}

/**
 * Mean absolute difference between two equally sized byte buffers.
 *
 * @param {Buffer} a - First buffer.
 * @param {Buffer} b - Second buffer.
 * @returns {number} Mean absolute difference, in 0-255 units.
 */
function meanAbsDiff(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Compares one public asset with its built counterpart.
 *
 * @param {string} rel - Path relative to `public/`.
 * @returns {Promise<string | null>} A failure description, or null if it matches.
 */
async function compareAsset(rel) {
  const src = path.join(PUBLIC_DIR, rel);
  const out = path.join(DIST_DIR, rel);

  if (!fs.existsSync(out)) return `${rel}: absent from the build output`;

  const isSvg = rel.toLowerCase().endsWith(".svg");
  if (!isSvg) {
    const [a, b] = await Promise.all([
      sharp(src).metadata(),
      sharp(out).metadata(),
    ]);
    if (a.width !== b.width || a.height !== b.height) {
      return `${rel}: ${a.width}x${a.height} in public/, ${b.width}x${b.height} in the build output`;
    }
    if (a.format !== b.format) {
      return `${rel}: ${a.format} in public/, ${b.format} in the build output`;
    }
  }

  const [A, B] = await Promise.all([decode(src, isSvg), decode(out, isSvg)]);
  if (A.colour.length !== B.colour.length) {
    return `${rel}: decoded geometry differs between public/ and the build output`;
  }

  const colour = meanAbsDiff(A.colour, B.colour);
  const alpha = meanAbsDiff(A.alpha, B.alpha);
  if (colour > MAX_MEAN_ABS_DIFF || alpha > MAX_MEAN_ABS_DIFF) {
    return `${rel}: the build output depicts a different image (colour ${colour.toFixed(2)}, alpha ${alpha.toFixed(2)}, limit ${MAX_MEAN_ABS_DIFF})`;
  }
  return null;
}

/**
 * Compares every public image with its built counterpart and reports.
 */
async function checkPublicAssetFidelity() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(
      `❌ Build output not found at ${DIST_DIR} — run a build first, or pass the directory as an argument.`,
    );
    process.exit(1);
  }

  const files = (
    await glob(IMAGE_GLOB, { cwd: PUBLIC_DIR, ...GLOB_OPTIONS })
  ).sort((a, b) => a.localeCompare(b));
  const failures = (await Promise.all(files.map(compareAsset))).filter(Boolean);

  if (failures.length > 0) {
    console.error(
      `❌ ${failures.length}/${files.length} public asset(s) do not survive the build intact:`,
    );
    for (const failure of failures) console.error(`   - ${failure}`);
    console.error(
      "\n   The optimized-image cache is keyed by path, so a replaced public/ file\n" +
        "   can be served from the blob of the file it replaced. Clear the entry\n" +
        "   (rm .cache/optimized-images/<path>) and rebuild.",
    );
    process.exit(1);
  }

  console.log(
    `✅ All ${files.length} public asset(s) reach the build output with their content intact.`,
  );
}

try {
  await checkPublicAssetFidelity();
} catch (error) {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
}
