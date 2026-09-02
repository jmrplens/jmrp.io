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
 * source: same format, same pixel dimensions, same frame count, and the same
 * picture — every frame of it, decoded to raw pixels and compared channel by
 * channel. Re-encoding moves those numbers a little (measured on this site: at
 * most 1.6 of 255 on the worst asset); a different image moves them far more,
 * and a resize, a format change or a lost frame is caught outright before the
 * pixel test runs. SVGs are rendered to a fixed-size bitmap first, so an SVGO
 * rewrite passes and a frozen older drawing does not.
 *
 * Animated input is decoded in full rather than rejected, because the build
 * accepts it: the optimizer asks sharp for every frame, but only when the
 * extension is `.gif` (`vite-plugin-image-optimizer/dist/index.js:232`). An
 * animated WebP or AVIF is therefore re-encoded from its first frame and loses
 * the rest — precisely the silent content loss this file exists to catch, and
 * one that a first-frame comparison cannot see. Nor can the dimension check
 * below it: libvips reports the height of a single page, so a three-frame
 * source and its flattened artefact both measure the same.
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
 * Largest mean absolute per-channel difference (0-255), on any one frame,
 * still attributable to re-encoding. The worst legitimate asset on this site
 * measures 1.54; the limit leaves roughly 4x headroom while a substituted
 * image scores tens.
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
 * `animated: true` makes libvips hand back every frame as one tall filmstrip
 * instead of frame one alone; on a still image it is a no-op (verified: all 34
 * raster assets under `public/` decode to byte-identical buffers either way —
 * the 35th is the SVG, which never reaches this branch).
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
      : sharp(file, { animated: true });

  const [colour, alpha] = await Promise.all([
    base().flatten({ background: "#000000" }).raw().toBuffer(),
    base().ensureAlpha().extractChannel(3).raw().toBuffer(),
  ]);
  return { colour, alpha };
}

/**
 * Worst per-frame mean absolute difference between two equally sized byte
 * buffers, each holding `frames` equal-length frames back to back.
 *
 * Per frame rather than over the whole buffer so the tolerance keeps its
 * meaning whatever the frame count: averaged across a 100-frame animation, a
 * single wholly substituted frame would read as a hundredth of its true drift
 * and slip under the limit. With `frames` of 1 this is a plain mean absolute
 * difference over the buffer.
 *
 * @param {Buffer} a - First buffer.
 * @param {Buffer} b - Second buffer, of the same length.
 * @param {number} frames - How many frames the buffers are divided into.
 * @returns {{ diff: number, frame: number }} The worst mean absolute
 *   difference, in 0-255 units, and the zero-based frame carrying it.
 */
function worstFrameMeanAbsDiff(a, b, frames) {
  const span = a.length / frames;
  let worst = { diff: 0, frame: 0 };
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let i = frame * span; i < (frame + 1) * span; i++) {
      sum += Math.abs(a[i] - b[i]);
    }
    const diff = sum / span;
    if (diff > worst.diff) worst = { diff, frame };
  }
  return worst;
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
  let frames = 1;
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
    // Reported per format (1 on a still GIF, absent on a still PNG or
    // WebP), so normalize before comparing. A drop to one frame is the
    // shape a de-animating re-encode takes, and the dimension check above
    // cannot show it.
    const srcFrames = a.pages ?? 1;
    const outFrames = b.pages ?? 1;
    if (srcFrames !== outFrames) {
      return `${rel}: ${srcFrames} frame(s) in public/, ${outFrames} in the build output`;
    }
    frames = srcFrames;
  }

  const [A, B] = await Promise.all([decode(src, isSvg), decode(out, isSvg)]);
  if (A.colour.length !== B.colour.length) {
    return `${rel}: decoded geometry differs between public/ and the build output`;
  }

  const colour = worstFrameMeanAbsDiff(A.colour, B.colour, frames);
  const alpha = worstFrameMeanAbsDiff(A.alpha, B.alpha, frames);
  if (colour.diff > MAX_MEAN_ABS_DIFF || alpha.diff > MAX_MEAN_ABS_DIFF) {
    const worst = colour.diff >= alpha.diff ? colour : alpha;
    const where = frames > 1 ? ` frame ${worst.frame + 1} of ${frames}:` : "";
    return `${rel}:${where} the build output depicts a different image (colour ${colour.diff.toFixed(2)}, alpha ${alpha.diff.toFixed(2)}, limit ${MAX_MEAN_ABS_DIFF})`;
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
