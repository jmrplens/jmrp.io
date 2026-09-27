#!/usr/bin/env node
/**
 * Checks that the six CV PDFs print the same download figures as /cv/.
 *
 * `/cv/` states that the web page and the PDFs never disagree. They did
 * twice: in GEO audit #9 the page read live figures while the PDFs read the
 * snapshot, and in #10 the reverse, because the PDF generators ran from
 * `cv_latex/` and missed the snapshot. This guard compares what was actually
 * built: every `~Nk downloads` (`~Nk descargas`) badge in `dist/cv/` (and
 * `dist/es/cv/`) against the badges the extractor finds in the matching PDFs.
 *
 * Usage: `node scripts/ci/check-cv-figures.mjs dist`. Skips with a notice
 * when the PDF text extractor is not installed.
 *
 * @module
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// cspell:ignore pdftotext descargas
const DIST = process.argv[2] ?? "dist";

/** Page → the PDFs that must agree with it, and the badge word. */
const PAIRS = [
  {
    page: "cv/index.html",
    word: "downloads",
    pdfs: [
      "CV_RequenaPlensJoseManuel_ENG.pdf",
      "CV_RequenaPlensJoseManuel_ENG_ATS.pdf",
      "CV_RequenaPlensJoseManuel_ENG_ATS_EXT.pdf",
    ],
  },
  {
    page: "es/cv/index.html",
    word: "descargas",
    pdfs: [
      "CV_RequenaPlensJoseManuel_SPA.pdf",
      "CV_RequenaPlensJoseManuel_SPA_ATS.pdf",
      "CV_RequenaPlensJoseManuel_SPA_ATS_EXT.pdf",
    ],
  },
];

/**
 * The distinct `~Nk <word>` badges in a text, sorted.
 *
 * @param {string} text - Page or PDF text.
 * @param {string} word - "downloads" or "descargas".
 * @returns {string[]} The badges.
 */
function downloadBadges(text, word) {
  const found = new Set();
  for (const match of text.matchAll(
    new RegExp(String.raw`~(\d+)k\s+${word}`, "g"),
  )) {
    found.add(`~${match[1]}k`);
  }
  return [...found].toSorted((a, b) => a.localeCompare(b));
}

/**
 * The PDF text extractor, looked up in fixed system directories rather than
 * on PATH, so a writable PATH entry cannot stand in for it.
 *
 * @returns {string | undefined} Its absolute path, if installed.
 */
function findPdftotext() {
  return ["/usr/bin", "/usr/local/bin", "/opt/homebrew/bin"]
    .map((dir) => path.join(dir, "pdftotext"))
    .find((candidate) => fs.existsSync(candidate));
}

function main() {
  const pdftotext = findPdftotext();
  if (!pdftotext) {
    console.log("CV figures: pdftotext not installed, skipping.");
    return;
  }
  let failures = 0;
  for (const { page, word, pdfs } of PAIRS) {
    const html = fs.readFileSync(path.join(DIST, page), "utf8");
    const expected = downloadBadges(html, word).join(", ");
    if (!expected) {
      console.error(`✗ ${page}: no download badge found`);
      failures += 1;
      continue;
    }
    for (const pdf of pdfs) {
      const run = spawnSync(pdftotext, [path.join(DIST, "pdf", pdf), "-"], {
        encoding: "utf8",
      });
      const actual = downloadBadges(run.stdout ?? "", word).join(", ");
      if (actual === expected) continue;
      console.error(
        `✗ ${pdf}: ${actual || "none"} (page ${page}: ${expected})`,
      );
      failures += 1;
    }
  }
  if (failures > 0) {
    console.error(`CV figures: ${failures} PDF(s) disagree with /cv/.`);
    process.exit(1);
  }
  console.log("✅ CV figures: the six PDFs print the same downloads as /cv/.");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
