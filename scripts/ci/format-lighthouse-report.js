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

// Calculate maximums per category and then average those maximums
const getAggregatedScore = (list) => {
  if (!list || list.length === 0) return null;

  const maxP = Math.max(...list.map((item) => item.p));
  const maxA = Math.max(...list.map((item) => item.a));
  const maxB = Math.max(...list.map((item) => item.b));
  const maxS = Math.max(...list.map((item) => item.s));

  return Math.round((maxP + maxA + maxB + maxS) / 4);
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

    const formatScore = (avg) => {
      if (avg === null) return "—";
      let icon;
      if (avg >= 90) {
        icon = "🟢";
      } else if (avg >= 50) {
        icon = "🟠";
      } else {
        icon = "🔴";
      }
      return `${icon} ${avg}%`;
    };

    // Columns: Mobile Light | Mobile Dark | Desktop Light | Desktop Dark
    const ml = getAggregatedScore(themes.light?.mobile);
    const md = getAggregatedScore(themes.dark?.mobile);
    const dl = getAggregatedScore(themes.light?.desktop);
    const dd = getAggregatedScore(themes.dark?.desktop);

    return `| **${PAGE_NAMES[url]}** | ${formatScore(ml)} | ${formatScore(md)} | ${formatScore(dl)} | ${formatScore(dd)} |`;
  })
  .filter((row) => row !== null);

if (rows.length === 0) {
  console.log("No valid Lighthouse results parsed.");
} else {
  console.log(`### ⚡ Lighthouse Audit Report`);
  console.log("");
  console.log("| Page | 📱 Light | 📱 Dark | 🖥️ Light | 🖥️ Dark |");
  console.log("| :--- | :---: | :---: | :---: | :---: |");
  console.log(rows.join("\n"));
  console.log("");
  console.log(
    "_Each score is the **average of the maximum values** obtained across 3 runs for Performance, Accessibility, Best Practices, and SEO._",
  );
}
