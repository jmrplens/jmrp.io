/**
 * Format Lighthouse Report for PR Comment
 *
 * Scans the .lighthouseci directory for JSON reports,
 * aggregates scores by URL, Theme, and Form Factor,
 * and outputs a Markdown table.
 */

import fs from "node:fs";
import path from "node:path";

const lhDir = process.argv[2] || ".lighthouseci";

if (!fs.existsSync(lhDir)) {
  console.log("No Lighthouse reports found.");
  process.exit(0);
}

// Recursive scan
function findReports(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findReports(filePath, fileList);
    } else if (
      file.endsWith(".json") &&
      !file.includes("manifest") &&
      !file.includes("links")
    ) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const files = findReports(lhDir);
const results = {};

files.forEach((filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(content);

    if (!json.finalUrl) return;

    // Normalize URL
    let url = json.finalUrl;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "localhost") {
        url = parsed.pathname || "/";
      }
    } catch (e) {
      // Fallback to original URL if parsing fails
      console.warn(`URL parsing failed for ${filePath}:`, e.message);
    }

    const formFactor = json.configSettings?.formFactor || "mobile";

    // Detect theme
    const lowerPath = filePath.toLowerCase();
    let theme = "unknown";
    if (lowerPath.includes("/light/") || lowerPath.includes("\\light\\"))
      theme = "light";
    if (lowerPath.includes("/dark/") || lowerPath.includes("\\dark\\"))
      theme = "dark";

    const scores = {
      p: Math.round((json.categories.performance?.score || 0) * 100),
      a: Math.round((json.categories.accessibility?.score || 0) * 100),
      b: Math.round((json.categories["best-practices"]?.score || 0) * 100),
      s: Math.round((json.categories.seo?.score || 0) * 100),
    };

    if (!results[url]) results[url] = {};
    if (!results[url][theme]) results[url][theme] = { mobile: [], desktop: [] };
    if (results[url][theme][formFactor]) {
      results[url][theme][formFactor].push(scores);
    }
  } catch (e) {
    // Skip invalid files
    console.warn(`Failed to process ${filePath}:`, e.message);
  }
});

// Calculate maximums
const getMax = (list) => {
  if (!list || list.length === 0) return null;
  return {
    p: Math.max(...list.map((item) => item.p)),
    a: Math.max(...list.map((item) => item.a)),
    b: Math.max(...list.map((item) => item.b)),
    s: Math.max(...list.map((item) => item.s)),
  };
};

const PAGE_NAMES = {
  "/": "Home",
  "/cv/": "CV",
  "/publications/": "Publications",
  "/github/": "Repositories",
  "/services/": "Services",
  "/blog/": "Blog",
};

const rows = Object.entries(results)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([url, themes]) => {
    // Only include main pages
    if (!PAGE_NAMES[url]) return null;

    const formatScores = (scores) => {
      if (!scores) return "—";
      const getIcon = (val) => (val >= 90 ? "🟢" : val >= 50 ? "🟠" : "🔴");
      return `${getIcon(scores.p)}${scores.p} <br/> ${getIcon(scores.a)}${scores.a} <br/> ${getIcon(scores.b)}${scores.b} <br/> ${getIcon(scores.s)}${scores.s}`;
    };

    // Columns: Mobile Light | Desktop Light | Mobile Dark | Desktop Dark
    const ml = getMax(themes.light?.mobile);
    const dl = getMax(themes.light?.desktop);
    const md = getMax(themes.dark?.mobile);
    const dd = getMax(themes.dark?.desktop);

    return `| **${PAGE_NAMES[url]}** | ${formatScores(ml)} | ${formatScores(dl)} | ${formatScores(md)} | ${formatScores(dd)} |`;
  })
  .filter((row) => row !== null);

if (rows.length === 0) {
  console.log("No valid Lighthouse results parsed.");
} else {
  console.log(`### ⚡ Lighthouse Audit Report (Max Scores)`);
  console.log("");
  console.log(
    "| Page | 📱 Light (P/A/B/S) | 🖥️ Light (P/A/B/S) | 📱 Dark (P/A/B/S) | 🖥️ Dark (P/A/B/S) |",
  );
  console.log("| :--- | :---: | :---: | :---: | :---: |");
  console.log(rows.join("\n"));
  console.log("");
  console.log(
    "_Scores represent the **maximum** value obtained across 3 runs for Performance, Accessibility, Best Practices, and SEO._",
  );
}
