/**
 * Format Lighthouse Report for PR Comment
 *
 * Scans the .lighthouseci directory for JSON reports,
 * aggregates scores by URL, Theme, and Form Factor,
 * and outputs an HTML table for GitHub.
 */

import fs from "node:fs";
import path from "node:path";

const lhDir = process.argv[2] || ".lighthouseci";

if (!fs.existsSync(lhDir)) {
  console.log("No Lighthouse reports found.");
  process.exit(0);
}

/**
 * Recursively scans a directory for Lighthouse JSON reports.
 *
 * @param dir - Directory to scan.
 * @param fileList - Accumulated list of file paths.
 * @returns Array of paths to JSON report files.
 */
function findReports(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
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
  }
  return fileList;
}

const files = findReports(lhDir);
const results = {};

for (const filePath of files) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(content);

    if (!json.finalUrl) continue;

    // Normalize URL
    let url = json.finalUrl;
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "localhost") {
        url = parsed.pathname || "/";
      }
    } catch (error) {
      // Fallback to original URL if parsing fails
      console.warn(`URL parsing failed for ${filePath}:`, error.message);
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
  } catch (error) {
    // Skip invalid files
    console.warn(`Failed to process ${filePath}:`, error.message);
  }
}

/**
 * Aggregates scores from a list of runs by taking the maximum of each category.
 *
 * @param list - Array of score objects.
 * @returns The average of the maximum category scores.
 */
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

/**
 * Formats a numeric score into a string with a colored emoji badge.
 *
 * @param avg - The average score (0-100).
 * @returns Formatted HTML string.
 */
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
  return `${icon} <b>${avg}%</b>`;
};

const rows = Object.entries(results)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .map(([url, themes]) => {
    // Only include main pages
    if (!PAGE_NAMES[url]) return null;

    const ml = getAggregatedScore(themes.light?.mobile);
    const md = getAggregatedScore(themes.dark?.mobile);
    const dl = getAggregatedScore(themes.light?.desktop);
    const dd = getAggregatedScore(themes.dark?.desktop);

    return `<tr><td align="left"><b>${PAGE_NAMES[url]}</b></td><td align="center">${formatScore(ml)}</td><td align="center">${formatScore(md)}</td><td align="center">${formatScore(dl)}</td><td align="center">${formatScore(dd)}</td></tr>`;
  })
  .filter((row) => row !== null);

if (rows.length === 0) {
  console.log("No valid Lighthouse results parsed.");
} else {
  process.stdout.write(`### ⚡ Lighthouse Audit Report\n\n`);
  process.stdout.write(`<table>\n`);
  process.stdout.write(`<thead>\n`);
  process.stdout.write(
    `<tr><th rowspan="2" align="left">Page</th><th colspan="2" align="center">📱 Mobile</th><th colspan="2" align="center">🖥️ Desktop</th></tr>\n`,
  );
  process.stdout.write(
    `<tr><th align="center">Light</th><th align="center">Dark</th><th align="center">Light</th><th align="center">Dark</th></tr>\n`,
  );
  process.stdout.write(`</thead>\n`);
  process.stdout.write(`<tbody>\n`);
  process.stdout.write(rows.join("\n"));
  process.stdout.write(`</tbody>\n`);
  process.stdout.write(`</table>\n\n`);
  process.stdout.write(
    `_Each score is the **average of the maximum values** obtained across 3 runs for Performance, Accessibility, Best Practices, and SEO._\n`,
  );
}
