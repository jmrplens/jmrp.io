/**
 * design-audit/capture.mjs
 *
 * Captures EVERY page of the site (all posts, tools, tag/category listings and
 * main pages — everything under dist/ except the parked About/Uses/Now) in
 * BOTH themes (light + dark) and BOTH viewports (desktop 1600px + mobile
 * iPhone 17 Pro Max, 440×956@3x). Each full page is sliced into numbered chunks
 * so nothing is scaled or cropped. The hydrated HTML of each page is also saved.
 *
 * Output (all under design-audit/):
 *   <theme>/<viewport>/<name>-NN.jpg      e.g. dark/desktop/home-01.jpg
 *   html/<name>.html
 *
 * Run from the worktree root:  node design-audit/capture.mjs
 * Overrides: AUDIT_BASE=https://beta.jmrp.io  (target host)
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.AUDIT_BASE || "https://beta.jmrp.io";
const OUT = dirname(fileURLToPath(import.meta.url));
const ROOT = join(OUT, "..");

/** Parked pages that are out of scope for this review. */
const EXCLUDE = /(^|\/)(about|uses|now)\//;

/** Enumerate every built route from the dist index.html files, plus /404. */
function discoverPaths() {
  const distDir = join(ROOT, "dist");
  const files = readdirSync(distDir, { recursive: true })
    .map((f) => String(f).replaceAll("\\", "/"))
    .filter((f) => f.endsWith("index.html"));
  const paths = files.map((f) => "/" + f.replace(/index\.html$/, ""));
  paths.push("/404");
  return [...new Set(paths)]
    .filter((p) => !EXCLUDE.test(p))
    .sort((a, b) => a.localeCompare(b));
}

/** Stable file-name for a route: "/es/blog/tags/nginx/" → "es-blog-tags-nginx". */
function nameFor(path) {
  if (path === "/") return "home";
  if (path === "/es/") return "es-home";
  return path.replace(/^\/+|\/+$/g, "").replaceAll("/", "-") || "home";
}

/** Islands that fetch remote data need a longer settle before capture. */
const NEEDS_DATA = /\/(homelab|github)\/?$/;

const THEMES = ["dark", "light"];
const VIEWPORTS = [
  { key: "desktop", width: 1600, height: 1000, chunk: 1200, dsf: 1, mobile: false },
  { key: "mobile", width: 440, height: 956, chunk: 1400, dsf: 3, mobile: true },
];

/** Scroll to the bottom in steps so lazy images + client:visible islands load. */
async function primePage(page, step) {
  await page.evaluate(async (s) => {
    await new Promise((resolve) => {
      let y = 0;
      const timer = setInterval(() => {
        window.scrollTo(0, y);
        y += s;
        if (y >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 90);
    });
  }, step);
}

async function run() {
  const paths = discoverPaths();
  for (const theme of THEMES) {
    for (const vp of VIEWPORTS) {
      mkdirSync(join(OUT, theme, vp.key), { recursive: true });
    }
  }
  mkdirSync(join(OUT, "html"), { recursive: true });
  console.log(`${paths.length} pages × ${THEMES.length} themes × ${VIEWPORTS.length} viewports`);

  const browser = await chromium.launch();
  try {
    for (const theme of THEMES) {
      for (const vp of VIEWPORTS) {
        const ctx = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dsf,
          isMobile: vp.mobile,
          hasTouch: vp.mobile,
          colorScheme: theme,
        });
        // Persist the theme the site's own toggle reads (THEME_KEY = "theme").
        await ctx.addInitScript((t) => {
          try {
            localStorage.setItem("theme", t);
          } catch {
            /* ignore */
          }
        }, theme);
        const page = await ctx.newPage();

        for (const p of paths) {
          const name = nameFor(p);
          const url = BASE + p;
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          } catch {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
          }
          await primePage(page, vp.height);
          await page.waitForTimeout(NEEDS_DATA.test(p) ? 3000 : 1200);
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(300);

          const buf = await page.screenshot({ fullPage: true, scale: "css", type: "png" });
          const { width: w, height: h } = await sharp(buf).metadata();
          const chunks = Math.max(1, Math.ceil(h / vp.chunk));
          for (let i = 0; i < chunks; i++) {
            const top = i * vp.chunk;
            const sliceH = Math.min(vp.chunk, h - top);
            const file = join(
              OUT,
              theme,
              vp.key,
              `${name}-${String(i + 1).padStart(2, "0")}.jpg`,
            );
            await sharp(buf)
              .extract({ left: 0, top, width: w, height: sliceH })
              .jpeg({ quality: 82, mozjpeg: true })
              .toFile(file);
          }

          // Save the hydrated HTML once (theme-independent DOM).
          if (theme === "dark" && vp.key === "desktop") {
            writeFileSync(join(OUT, "html", `${name}.html`), await page.content(), "utf8");
          }
        }
        await ctx.close();
        console.log(`✓ ${theme}/${vp.key} — ${paths.length} pages`);
      }
    }
  } finally {
    await browser.close();
  }
}

await run();
console.log("Done.");
