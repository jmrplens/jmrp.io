/**
 * Format Lighthouse Report for PR Comment
 *
 * Scans the .lighthouseci directory for JSON reports,
 * aggregates scores by URL, Theme, and Form Factor,
 * and outputs a Markdown table.
 */

const fs = require("fs");
const path = require("path");

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
    } catch (e) {}

    const formFactor = json.configSettings?.formFactor || "mobile";

    // Detect theme
    const lowerPath = filePath.toLowerCase();
    let theme = "unknown";
    if (lowerPath.includes("/light/") || lowerPath.includes("\light\ "))
      theme = "light";
    if (lowerPath.includes("/dark/") || lowerPath.includes("\dark\ "))
      theme = "dark";

    const scores = {
      p: (json.categories.performance?.score || 0) * 100,
    };

    if (!results[url]) results[url] = {};
    if (!results[url][theme]) results[url][theme] = { mobile: [], desktop: [] };
    if (results[url][theme][formFactor]) {
      results[url][theme][formFactor].push(scores);
    }
  } catch (e) {}
});

// Calculate averages
const getAvg = (list) => {
  if (!list || list.length === 0) return null;
  const totalP = list.reduce((sum, item) => sum + item.p, 0);
  return Math.round(totalP / list.length);
};

const rows = Object.entries(results)
  .sort()
  .map(([url, themes]) => {
    const formatScore = (val) => {
      if (val === null) return "—";
      const icon = val >= 90 ? "🟢" : val >= 50 ? "🟠" : "🔴";
      return `${icon} ${val}`;
    };

    // Columns: Mobile Light | Desktop Light | Mobile Dark | Desktop Dark
    // Only if themes exist
    const ml = getAvg(themes.light?.mobile);
    const dl = getAvg(themes.light?.desktop);
    const md = getAvg(themes.dark?.mobile);
    const dd = getAvg(themes.dark?.desktop);

    return (
      "| `" +
      url +
      "` | " +
      formatScore(ml) +
      " | " +
      formatScore(dl) +
      " | " +
      formatScore(md) +
      " | " +
      formatScore(dd) +
      " |"
    );
  });

if (rows.length === 0) {
  console.log("No valid Lighthouse results parsed.");
} else {
  console.log(`### ⚡ Lighthouse Performance Report`);
  console.log("");
  console.log("| Page | 📱 Light | 🖥️ Light | 📱 Dark | 🖥️ Dark |");
  console.log("| :--- | :---: | :---: | :---: | :---: |");
  console.log(rows.join("\n"));
  console.log("");
  console.log("_Scores represent the average Performance metric across runs._");
}
