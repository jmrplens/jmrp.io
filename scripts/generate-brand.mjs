/**
 * generate-brand.mjs — jmrp.io logo/brand asset pipeline (single source).
 *
 * Reproduces the header `❯ jmrp_` mark (Logo.astro): teal chevron, `jmrp` in
 * IBM Plex Mono SemiBold as VECTOR PATHS (no font dependency), amber underscore
 * cursor. Emits a full matrix into src/assets/brand/ + favicons into public/.
 *
 * Subjects (6): logo-{full,mark,appicon}-{dark,light}.
 * Per subject: SVG (static + animated), static PNG+WebP at 16→1024, and animated
 * GIF/WebP/APNG/WebM/MP4 at a few sizes. Tiny sizes are antialiased (rendered at
 * high density, then lanczos-downscaled). Static PNGs are optimised with Tinify
 * when TINIFY=1 and TINIFY_API_KEY is set.
 *
 * Run:  node scripts/generate-brand.mjs           (no network optimisation)
 *       TINIFY=1 node scripts/generate-brand.mjs   (also Tinify the PNGs)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import opentype from "opentype.js";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src/assets/brand");
const PUBLIC = path.join(ROOT, "public");
const TMP = path.join(ROOT, ".brand-tmp");

const FONT =
  "/usr/share/texlive/texmf-dist/fonts/opentype/ibm/plex/IBMPlexMono-SemiBold.otf";

// Brand palette (tokens.css). Dark = canonical; light = light-theme tokens.
const THEMES = {
  dark: {
    chevron: "#46B8A6",
    word: "#F4F2EC",
    cursor: "#F5A623",
    bg: "#0A0A0B",
  },
  light: {
    chevron: "#1F7E6E",
    word: "#1F2328",
    cursor: "#8F5300",
    bg: "#FAFAF7",
  },
};

const SIZES = [16, 32, 48, 64, 80, 128, 192, 256, 512, 768, 1024];
const ANIM_SIZES = [64, 128, 256, 512];
const DENSITY = 600; // high render density → antialiased downscales for tiny px

// Blink cycle 1.15s: cursor ON 0.53s, OFF 0.62s (matches the header CSS).
const ON_MS = 530;
const OFF_MS = 620;
const FPS = 30;

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const font = opentype.parse(Uint8Array.from(fs.readFileSync(FONT)).buffer);

// ── Geometry (font units) ──────────────────────────────────────────────────
const S = 100;
const WORD = "jmrp";
const wordAdvance = font.getAdvanceWidth(WORD, S);
const wb = font.getPath(WORD, 0, 0, S).getBoundingBox();
const capHeight = -wb.y1;
const chH = capHeight;
const chW = chH * 0.5;
const chStroke = S * 0.14;
const chGap = S * 0.42;
const chCy = -capHeight / 2;
const usW = S * 0.6;
const usH = S * 0.14;
const usGap = S * 0.14;
const usX = chW + chGap + wordAdvance + usGap;
const usY = S * 0.02;
const usR = usH * 0.22;
const wordX = chW + chGap;
const PAD = S * 0.18;
const contentTop = chCy - chH / 2;
const contentBottom = usY + usH;

/** Build a full `❯ jmrp_` or mark `❯_` SVG for a theme, static or animated. */
function logoSvg({ mark = false, theme = "dark", animated = false } = {}) {
  const c = THEMES[theme];
  const chevron =
    `<path d="M 0 ${(chCy - chH / 2).toFixed(1)} L ${chW.toFixed(1)} ${chCy.toFixed(1)} L 0 ${(chCy + chH / 2).toFixed(1)}" ` +
    `fill="none" stroke="${c.chevron}" stroke-width="${chStroke.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const wordEl = mark
    ? ""
    : `<path transform="translate(${wordX.toFixed(1)},0)" d="${font.getPath(WORD, 0, 0, S).toPathData(2)}" fill="${c.word}"/>`;
  const curX = mark ? chW + usGap : usX;
  const blink = animated
    ? `<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;0.46;0.54;1" dur="1.15s" repeatCount="indefinite" calcMode="discrete"/>`
    : "";
  const cursor = `<rect x="${curX.toFixed(1)}" y="${usY.toFixed(1)}" width="${usW.toFixed(1)}" height="${usH.toFixed(1)}" rx="${usR.toFixed(1)}" fill="${c.cursor}">${blink}</rect>`;
  const right = mark ? chW + usGap + usW : usX + usW;
  const vbW = right + PAD * 2;
  const vbH = contentBottom - contentTop + PAD * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbW.toFixed(1)} ${vbH.toFixed(1)}" role="img" aria-label="jmrp.io">` +
    `<g transform="translate(${PAD.toFixed(1)},${(PAD - contentTop).toFixed(1)})">${chevron}${wordEl}${cursor}</g></svg>`
  );
}

/** App-icon: the mark on a rounded square in the theme's bg. */
function appiconSvg({ theme = "dark", animated = false } = {}) {
  const c = THEMES[theme];
  const inner = logoSvg({ mark: true, theme, animated });
  const body = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const vb = inner.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const iw = Number.parseFloat(vb?.[1] ?? "64");
  const ih = Number.parseFloat(vb?.[2] ?? "64");
  const scale = (64 * 0.6) / Math.max(iw, ih);
  const ox = (64 - iw * scale) / 2;
  const oy = (64 - ih * scale) / 2;
  const border =
    theme === "light"
      ? `<rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="${THEMES.light.word}" stroke-opacity="0.08"/>`
      : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="jmrp.io">` +
    `<rect width="64" height="64" rx="14" fill="${c.bg}"/>${border}` +
    `<g transform="translate(${ox.toFixed(2)},${oy.toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g></svg>`
  );
}

// ── Subjects ───────────────────────────────────────────────────────────────
const SUBJECTS = [
  {
    name: "logo-full-dark",
    kind: "full",
    theme: "dark",
    svg: (a) => logoSvg({ mark: false, theme: "dark", animated: a }),
  },
  {
    name: "logo-full-light",
    kind: "full",
    theme: "light",
    svg: (a) => logoSvg({ mark: false, theme: "light", animated: a }),
  },
  {
    name: "logo-mark-dark",
    kind: "mark",
    theme: "dark",
    svg: (a) => logoSvg({ mark: true, theme: "dark", animated: a }),
  },
  {
    name: "logo-mark-light",
    kind: "mark",
    theme: "light",
    svg: (a) => logoSvg({ mark: true, theme: "light", animated: a }),
  },
  {
    name: "logo-appicon-dark",
    kind: "icon",
    theme: "dark",
    opaque: true,
    svg: (a) => appiconSvg({ theme: "dark", animated: a }),
  },
  {
    name: "logo-appicon-light",
    kind: "icon",
    theme: "light",
    opaque: true,
    svg: (a) => appiconSvg({ theme: "light", animated: a }),
  },
];

function toggleCursor(svgStr, on) {
  return on
    ? svgStr
    : svgStr.replace(
        /(<rect\b[^>]*?fill="#[0-9A-Fa-f]{6}")([^>]*?>)/,
        (m, a, b) => (/#F5A623|#8F5300/.test(a) ? `${a} opacity="0"${b}` : m),
      );
}
function resizeArgs(kind, size) {
  return kind === "full"
    ? { width: size }
    : {
        width: size,
        height: size,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      };
}
// Always truecolor (palette:false) + embedded sRGB profile. Tinify/pngquant-style
// PALETTE-INDEXED PNGs with alpha render as GREYSCALE on some devices, so a logo —
// where colour must be reliable everywhere — is kept truecolor and colour-managed.
async function render(svgStr, kind, size, { flatten } = {}) {
  let img = sharp(Buffer.from(svgStr), { density: DENSITY }).resize(
    resizeArgs(kind, size),
  );
  if (flatten) img = img.flatten({ background: flatten });
  return img
    .withMetadata({ icc: "srgb" })
    .png({ compressionLevel: 9, effort: 10, palette: false })
    .toBuffer();
}

// WebP is never palette-indexed, so it is safe to Tinify (opt-in). PNGs are not
// Tinified (it would index them → the greyscale bug above).
let tinify = null;
if (process.env.TINIFY === "1" && process.env.TINIFY_API_KEY) {
  tinify = (await import("tinify")).default;
  tinify.key = process.env.TINIFY_API_KEY;
}
async function optimizeWebp(buf) {
  if (!tinify) return buf;
  try {
    return Buffer.from(await tinify.fromBuffer(buf).toBuffer());
  } catch (error) {
    console.warn("  ! tinify webp failed, using original:", error.message);
    return buf;
  }
}

// ── Generate ───────────────────────────────────────────────────────────────
let count = 0;
const write = (file, buf) => {
  fs.writeFileSync(path.join(OUT, file), buf);
  count++;
};

for (const s of SUBJECTS) {
  // SVG masters (static + animated) — every design in SVG.
  write(`${s.name}.svg`, Buffer.from(s.svg(false)));
  write(`${s.name}-animated.svg`, Buffer.from(s.svg(true)));

  // Static rasters PNG (truecolor+sRGB) + WebP (Tinified when enabled).
  for (const size of SIZES) {
    const png = await render(s.svg(false), s.kind, size);
    write(`${s.name}-${size}.png`, png);
    const webp = await sharp(png).webp({ quality: 92, effort: 6 }).toBuffer();
    write(`${s.name}-${size}.webp`, await optimizeWebp(webp));
  }

  // Animated rasters at a few sizes: gif · webp · apng · webm · mp4.
  const staticSvg = s.svg(false); // toggle the cursor rect for on/off frames
  for (const size of ANIM_SIZES) {
    const dir = path.join(TMP, `${s.name}-${size}`);
    fs.mkdirSync(path.join(dir, "seq"), { recursive: true });
    const onP = path.join(dir, "on.png");
    const offP = path.join(dir, "off.png");
    fs.writeFileSync(
      onP,
      await render(toggleCursor(staticSvg, true), s.kind, size),
    );
    fs.writeFileSync(
      offP,
      await render(toggleCursor(staticSvg, false), s.kind, size),
    );
    const base = `${s.name}-animated-${size}`;

    // GIF (per-frame delay; -dispose background so the cursor truly toggles).
    execFileSync("convert", [
      "-loop",
      "0",
      "-dispose",
      "background",
      "-delay",
      "53",
      onP,
      "-delay",
      "62",
      offP,
      path.join(OUT, `${base}.gif`),
    ]);
    count++;
    // Animated WebP (keeps alpha).
    execFileSync("img2webp", [
      "-loop",
      "0",
      "-lossy",
      "-q",
      "90",
      "-d",
      String(ON_MS),
      onP,
      "-d",
      String(OFF_MS),
      offP,
      "-o",
      path.join(OUT, `${base}.webp`),
    ]);
    count++;
    // Constant-fps sequence for apng/webm/mp4.
    let i = 0;
    const put = (src) =>
      fs.copyFileSync(
        src,
        path.join(dir, "seq", `f${String(i++).padStart(3, "0")}.png`),
      );
    for (let k = 0; k < Math.round((ON_MS / 1000) * FPS); k++) put(onP);
    for (let k = 0; k < Math.round((OFF_MS / 1000) * FPS); k++) put(offP);
    const pat = path.join(dir, "seq", "f%03d.png");
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      pat,
      "-plays",
      "0",
      "-f",
      "apng",
      path.join(OUT, `${base}.apng`),
    ]);
    count++;
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      pat,
      "-c:v",
      "libvpx-vp9",
      "-pix_fmt",
      s.opaque ? "yuv420p" : "yuva420p",
      "-b:v",
      "0",
      "-crf",
      "30",
      path.join(OUT, `${base}.webm`),
    ]);
    count++;
    // MP4 (H.264, opaque) — flatten transparent subjects onto their theme bg.
    const seqMp4 = path.join(dir, "seqmp4");
    fs.mkdirSync(seqMp4, { recursive: true });
    if (s.opaque) {
      fs.cpSync(path.join(dir, "seq"), seqMp4, { recursive: true });
    } else {
      const onF = path.join(dir, "on-bg.png");
      const offF = path.join(dir, "off-bg.png");
      fs.writeFileSync(
        onF,
        await render(toggleCursor(staticSvg, true), s.kind, size, {
          flatten: THEMES[s.theme].bg,
        }),
      );
      fs.writeFileSync(
        offF,
        await render(toggleCursor(staticSvg, false), s.kind, size, {
          flatten: THEMES[s.theme].bg,
        }),
      );
      let j = 0;
      const put2 = (src) =>
        fs.copyFileSync(
          src,
          path.join(seqMp4, `f${String(j++).padStart(3, "0")}.png`),
        );
      for (let k = 0; k < Math.round((ON_MS / 1000) * FPS); k++) put2(onF);
      for (let k = 0; k < Math.round((OFF_MS / 1000) * FPS); k++) put2(offF);
    }
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-framerate",
      String(FPS),
      "-i",
      path.join(seqMp4, "f%03d.png"),
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "20",
      "-vf",
      "pad=ceil(iw/2)*2:ceil(ih/2)*2",
      "-movflags",
      "+faststart",
      path.join(OUT, `${base}.mp4`),
    ]);
    count++;
  }
  console.log(`  ✓ ${s.name}`);
}

// ── Favicons ────────────────────────────────────────────────────────────────
// Full-bleed square (NO rounding) for apple-touch + PWA: iOS masks the corners
// and PWA `maskable` needs edge-to-edge; the mark sits in a generous safe zone.
function iconSquareSvg({ theme = "dark" } = {}) {
  const c = THEMES[theme];
  const inner = logoSvg({ mark: true, theme });
  const body = inner.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  const vb = inner.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const iw = Number.parseFloat(vb?.[1] ?? "64");
  const ih = Number.parseFloat(vb?.[2] ?? "64");
  const scale = (64 * 0.5) / Math.max(iw, ih); // 0.5 → maskable safe zone
  const ox = (64 - iw * scale) / 2;
  const oy = (64 - ih * scale) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="jmrp.io">` +
    `<rect width="64" height="64" fill="${c.bg}"/>` +
    `<g transform="translate(${ox.toFixed(2)},${oy.toFixed(2)}) scale(${scale.toFixed(4)})">${body}</g></svg>`
  );
}

const ASSETS = path.join(ROOT, "src/assets");
const PWA = path.join(ASSETS, "icons/pwa");
fs.mkdirSync(PWA, { recursive: true });

const favSvg = appiconSvg({ theme: "dark" }); // rounded, transparent corners
const favSvgAnim = appiconSvg({ theme: "dark", animated: true });
const sqSvg = iconSquareSvg({ theme: "dark" }); // full-bleed opaque square
const rounded = (size) => render(favSvg, "icon", size); // keep transparent corners
const square = (size) => render(sqSvg, "icon", size);

// Public (favicon.svg is referenced directly; the rest are static fallbacks).
fs.writeFileSync(path.join(PUBLIC, "favicon.svg"), favSvgAnim);
fs.writeFileSync(path.join(PUBLIC, "favicon-32x32.png"), await rounded(32));
fs.writeFileSync(path.join(PUBLIC, "favicon-48x48.png"), await rounded(48));
fs.writeFileSync(path.join(PUBLIC, "favicon.png"), await rounded(180));
fs.writeFileSync(path.join(PUBLIC, "apple-touch-icon.png"), await square(180));
fs.writeFileSync(
  path.join(PUBLIC, "apple-touch-icon-precomposed.png"),
  await square(180),
);
fs.writeFileSync(path.join(PUBLIC, "icon-192.png"), await square(192));
fs.writeFileSync(path.join(PUBLIC, "icon-512.png"), await square(512));

// Source masters actually used by BaseHead.astro + manifest.ts (getImage()).
fs.writeFileSync(path.join(ASSETS, "favicon.png"), await rounded(512));
fs.writeFileSync(path.join(ASSETS, "apple-touch-icon.png"), await square(512));
fs.writeFileSync(path.join(PWA, "icon-192.png"), await square(512));
fs.writeFileSync(path.join(PWA, "icon-512.png"), await square(512));

const ico48 = path.join(TMP, "ico48.png");
fs.writeFileSync(ico48, await rounded(48));
execFileSync("convert", [
  ico48,
  "-define",
  "icon:auto-resize=16,32,48",
  path.join(PUBLIC, "favicon.ico"),
]);

fs.rmSync(TMP, { recursive: true, force: true });

// ── Audit ──────────────────────────────────────────────────────────────────
const files = fs.readdirSync(OUT);
const byExt = {};
for (const f of files) {
  const e = path.extname(f).slice(1);
  byExt[e] = (byExt[e] || 0) + 1;
}
const sampleGif = files.find((f) => f.endsWith("-256.gif"));
const frames = sampleGif
  ? execFileSync("identify", [path.join(OUT, sampleGif)])
      .toString()
      .trim()
      .split("\n").length
  : 0;
console.log(`\n✓ ${count} brand assets in src/assets/brand/`);
console.log(
  "  by format:",
  Object.entries(byExt)
    .map(([e, n]) => `${e}:${n}`)
    .join("  "),
);
console.log(`  animation frames (sample ${sampleGif}): ${frames} (expect 2)`);
console.log(`  PNG: truecolor + sRGB (reliable colour everywhere)`);
console.log(`  Tinify (WebP only): ${tinify ? "ON" : "off (set TINIFY=1)"}`);
console.log("  Favicons → public/ (svg, ico, 32/48/180, icon-192/512)");
