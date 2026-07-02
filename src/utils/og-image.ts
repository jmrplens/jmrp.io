/**
 * OG Image Generator — jmrp.io Lab/Engineering brand.
 *
 * Produces 1200×630 PNG images for per-route Open Graph cards using:
 * - satori (pure JS/WASM) for SVG layout + text-as-paths rendering
 * - sharp (already a project dependency) for SVG→PNG rasterisation
 *
 * Design matches the Lab design system (tokens.css):
 * - Background: #0A0A0B with hairline grid overlay (#1D1D22 @ 40px)
 * - Logo mark: the real `❯ jmrp_` brand PNG (src/assets/brand), embedded
 * - Title: Space Grotesk 700, up to 2 lines, heading colour #F4F2EC
 * - Domain: IBM Plex Mono 500, bottom-right, muted #8C8A82
 * - Bottom accent bar: 3px teal #46B8A6
 *
 * Fonts are committed to `src/assets/fonts/og/` (latin subsets, TTF).
 * They match the exact files Astro Fonts downloads at build time.
 */

import { readFile } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import satori from "satori";
import sharp from "sharp";

const readFileAsync = promisify(readFile);

// ─── Design tokens (hard-coded for OG; always dark theme) ───────────────────
const OG_BG = "#0a0a0b";
const OG_GRID = "#1d1d22";
const OG_HEADING = "#f4f2ec";
const OG_MUTED = "#8c8a82";
const OG_TEAL = "#46b8a6";
const OG_BORDER = "#26262c";

// ─── Dimensions ─────────────────────────────────────────────────────────────
const W = 1200;
const H = 630;
const PAD_X = 72;
const PAD_Y = 56;

// ─── Font paths ──────────────────────────────────────────────────────────────
// TTF format is required — satori's opentype.js does not support woff2.
// Files downloaded from Fontsource CDN (OFL-1.1 licensed) at the same
// versions that Astro Fonts caches for the live site.
//
// Use process.cwd() instead of import.meta.url: during the Astro SSG build
// compiled modules run from the dist directory, making URL-relative paths
// point to the wrong location. process.cwd() is always the project root.
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts/og");

// Lazily loaded font buffers (shared across all images in a single build).
let _spaceGrotesk700: ArrayBuffer | undefined;
let _ibmPlexMono500: ArrayBuffer | undefined;

/**
 * Returns ArrayBuffer for Space Grotesk 700 (latin subset, TTF).
 */
async function getSpaceGrotesk700(): Promise<ArrayBuffer> {
  if (!_spaceGrotesk700) {
    const buf = await readFileAsync(`${FONT_DIR}/space-grotesk-700.ttf`);
    _spaceGrotesk700 = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
  }
  return _spaceGrotesk700;
}

/**
 * Returns ArrayBuffer for IBM Plex Mono 500 (latin subset, TTF).
 */
async function getIbmPlexMono500(): Promise<ArrayBuffer> {
  if (!_ibmPlexMono500) {
    const buf = await readFileAsync(`${FONT_DIR}/ibm-plex-mono-500.ttf`);
    _ibmPlexMono500 = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
  }
  return _ibmPlexMono500;
}

// ─── Satori element helpers ──────────────────────────────────────────────────
// Minimal React.createElement-compatible factory required by satori.
type StyleProp = Record<string, string | number | undefined>;

interface VNode {
  type: string;
  key: null;
  props: {
    style?: StyleProp;
    children?: VNode | VNode[] | string | (VNode | string)[];
    [k: string]: unknown;
  };
}

// Lazily loaded brand logo — the real `❯ jmrp_` mark (dark theme, truecolor+sRGB
// PNG from the brand pipeline) embedded as a data-URI so satori renders the
// actual chevron/underscore, not an ASCII approximation.
let _logo: { uri: string; ratio: number } | undefined;
async function getLogo(): Promise<{ uri: string; ratio: number }> {
  if (!_logo) {
    const buf = await readFileAsync(
      path.join(process.cwd(), "src/assets/brand/logo-full-dark-512.png"),
    );
    // PNG IHDR carries width @ byte 16 and height @ byte 20 (big-endian).
    _logo = {
      uri: `data:image/png;base64,${buf.toString("base64")}`,
      ratio: buf.readUInt32BE(16) / buf.readUInt32BE(20),
    };
  }
  return _logo;
}

/**
 * Creates a satori-compatible virtual node.
 * @param type - HTML element tag name.
 * @param style - Inline styles (CSS properties as camelCase).
 * @param children - Child nodes or strings.
 */
function el(
  type: string,
  style: StyleProp,
  ...children: (VNode | string | null | undefined)[]
): VNode {
  const filtered = children.filter(
    (c): c is VNode | string => c !== null && c !== undefined,
  );

  // Resolve children into the scalar satori expects:
  //   0 items → undefined  |  1 item → unwrap  |  2+ items → array
  let resolvedChildren: VNode["props"]["children"];
  if (filtered.length > 0) {
    resolvedChildren = filtered.length === 1 ? filtered[0] : filtered;
  }

  return {
    type,
    key: null,
    props: { style, children: resolvedChildren },
  };
}

// ─── Title font-size heuristic ───────────────────────────────────────────────
/**
 * Picks a font size for the title based on character count so it stays
 * within two lines at 1200px width.
 * @param title - The page title string.
 */
function titleFontSize(title: string): number {
  const len = title.length;
  if (len <= 20) return 72;
  if (len <= 36) return 60;
  if (len <= 52) return 48;
  if (len <= 70) return 40;
  return 34;
}

// ─── Main layout builder ─────────────────────────────────────────────────────
/**
 * Builds the satori element tree for the OG image.
 * @param title - Main page title (displayed large, centre-vertical).
 * @param subtitle - Optional kicker shown below the title in muted type.
 */
function buildLayout(
  title: string,
  subtitle: string | undefined,
  logo: { uri: string; ratio: number },
): VNode {
  const fs = titleFontSize(title);

  // Root container: full bleed, flex column, dark bg + grid
  return el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      width: "100%",
      height: "100%",
      background: OG_BG,
      backgroundImage: [
        `linear-gradient(${OG_GRID} 1px, transparent 1px)`,
        `linear-gradient(90deg, ${OG_GRID} 1px, transparent 1px)`,
      ].join(", "),
      backgroundSize: "40px 40px",
      position: "relative",
      // Bottom teal accent bar via border
      borderBottom: `3px solid ${OG_TEAL}`,
    },
    // ── Inner padding container
    el(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        flex: "1",
        padding: `${PAD_Y}px ${PAD_X}px`,
        // Subtle vignette to ground text without obscuring grid
        background:
          "linear-gradient(160deg, rgba(10,10,11,0.30) 0%, transparent 55%, rgba(10,10,11,0.55) 100%)",
      },
      // ── Top row: the real `❯ jmrp_` brand mark (embedded PNG)
      {
        type: "img",
        key: null,
        props: {
          src: logo.uri,
          width: Math.round(40 * logo.ratio),
          height: 40,
          style: { display: "flex" },
        },
      },
      // ── Centre: title + subtitle
      el(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "1040px",
        },
        el(
          "div",
          {
            fontFamily: "'Space Grotesk'",
            fontSize: `${fs}px`,
            fontWeight: "700",
            color: OG_HEADING,
            lineHeight: "1.15",
            letterSpacing: "-0.025em",
          },
          title,
        ),
        subtitle
          ? el(
              "div",
              {
                fontFamily: "'IBM Plex Mono'",
                fontSize: "18px",
                fontWeight: "500",
                color: OG_MUTED,
                letterSpacing: "0.005em",
              },
              subtitle,
            )
          : el("span", { display: "none" }),
      ),
      // ── Bottom row: domain label + teal border accent
      el(
        "div",
        {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        },
        // Left: decorative teal border accent element
        el("div", {
          width: "40px",
          height: "2px",
          background: OG_TEAL,
          borderRadius: "1px",
          opacity: "0.6",
        }),
        // Right: domain
        el(
          "div",
          {
            fontFamily: "'IBM Plex Mono'",
            fontSize: "17px",
            fontWeight: "500",
            color: OG_MUTED,
            letterSpacing: "0.02em",
            // Thin top border above domain for visual separation
            borderTop: `1px solid ${OG_BORDER}`,
            paddingTop: "12px",
          },
          "jmrp.io",
        ),
      ),
    ),
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generates a 1200×630 branded OG image as a raw PNG Buffer.
 *
 * @param title - Page title, rendered large in Space Grotesk 700.
 * @param subtitle - Optional secondary line in IBM Plex Mono (e.g. section name or description).
 * @returns Node.js `Buffer` containing a PNG.  Wrap in `new Uint8Array(buf)` when
 *          passing as `BodyInit` to the Web `Response` constructor in Astro endpoints.
 */
export async function generateOgImage(
  title: string,
  subtitle?: string,
): Promise<Buffer> {
  const [spaceGrotesk, ibmPlexMono, logo] = await Promise.all([
    getSpaceGrotesk700(),
    getIbmPlexMono500(),
    getLogo(),
  ]);

  const svg = await satori(
    buildLayout(title, subtitle, logo) as Parameters<typeof satori>[0],
    {
      width: W,
      height: H,
      fonts: [
        {
          name: "Space Grotesk",
          data: spaceGrotesk,
          weight: 700,
          style: "normal",
        },
        {
          name: "IBM Plex Mono",
          data: ibmPlexMono,
          weight: 500,
          style: "normal",
        },
      ],
    },
  );

  return sharp(Buffer.from(svg))
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
}
