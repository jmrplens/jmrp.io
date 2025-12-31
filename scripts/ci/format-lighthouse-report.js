/**
 * Lighthouse Report Formatter
 *
 * This script processes the raw JSON output from Lighthouse CI, calculates
 * median scores across multiple runs, and generates a GitHub-flavored Markdown
 * summary for use in PR comments.
 *
 * Features:
 * - Groups results by URL and calculates median scores for reliability.
 * - Highlights pages falling below the performance threshold (95%).
 * - Generates a site-wide summary table with icons.
 * - Supports theme-specific reporting (Light/Dark mode).
 */

import fs from "node:fs";
import path from "node:path";

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");
const THRESHOLD = 95;

/**
 * Map URL to a human-friendly Page Name
 */
const getPageName = (url) => {
  try {
    const urlObj = new URL(url);
    let pathName = urlObj.pathname;

    if (pathName.length > 1 && pathName.endsWith("/")) {
      pathName = pathName.slice(0, -1);
    }

    if (pathName === "/" || pathName === "") return "Home";
    if (pathName === "/services") return "Services";
    if (pathName === "/cv") return "CV";
    if (pathName === "/publications") return "Publications";
    if (pathName === "/github") return "GitHub";
    if (pathName === "/blog") return "Blog Index";

    if (pathName.startsWith("/blog/")) {
      const slug = pathName.split("/").pop();
      return "Post: " + slug.charAt(0).toUpperCase() + slug.slice(1);
    }

    return pathName;
  } catch (e) {
    return "Unknown";
  }
};

/**
 * Filter for Core Pages
 */
const isCorePage = (url) => {
  const name = getPageName(url);
  return [
    "Home",
    "Services",
    "CV",
    "Publications",
    "GitHub",
    "Blog Index",
  ].includes(name);
};

try {
  if (!fs.existsSync(lhciDir)) {
    console.error("Lighthouse directory not found");
    process.exit(0);
  }

  // 1. Extract Scores from Manifest or LHR files
  let manifest = [];
  const manifestPath = path.join(lhciDir, "manifest.json");

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } else {
    const files = fs.readdirSync(lhciDir);
    const jsonFiles = files.filter(
      (f) => f.startsWith("lhr-") && f.endsWith(".json"),
    );
    manifest = jsonFiles.map((f) => ({ jsonPath: path.join(lhciDir, f) }));
  }

  const groupedResults = {};

  manifest.forEach((run) => {
    if (!run.jsonPath || !fs.existsSync(run.jsonPath)) return;
    const json = JSON.parse(fs.readFileSync(run.jsonPath, "utf8"));
    const url = json.finalUrl || json.requestedUrl;
    const categories = json.categories;

    if (!groupedResults[url]) groupedResults[url] = {};

    Object.keys(categories).forEach((key) => {
      if (!groupedResults[url][key]) groupedResults[url][key] = [];
      groupedResults[url][key].push(categories[key].score * 100);
    });
  });

  if (Object.keys(groupedResults).length === 0) {
    console.log("### 🌓 Lighthouse Report\n\n> ⚠️ No runs found.");
    process.exit(0);
  }

  // 2. Calculate Median Scores per Page
  const pageScores = {};
  const failedPages = [];

  Object.keys(groupedResults).forEach((url) => {
    pageScores[url] = {};
    let hasFailure = false;

    Object.keys(groupedResults[url]).forEach((cat) => {
      const scores = groupedResults[url][cat];
      scores.sort((a, b) => a - b);
      const mid = Math.floor(scores.length / 2);
      const median =
        scores.length % 2 === 1
          ? scores[mid]
          : (scores[mid - 1] + scores[mid]) / 2;
      const finalScore = Math.round(median);

      pageScores[url][cat] = finalScore;
      if (finalScore < THRESHOLD) hasFailure = true;
    });

    if (hasFailure) failedPages.push(url);
  });

  // 3. Output Generation (Markdown)
  let links = {};
  if (fs.existsSync(linksPath)) {
    links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  }

  const theme = process.env.THEME || "unknown";
  const themeName =
    theme === "light"
      ? "☀️ Light Mode"
      : theme === "dark"
        ? "🌙 Dark Mode"
        : "Report";

  console.log(`### 🌓 Lighthouse Analysis (${themeName})`);

  const categories = ["performance", "accessibility", "best-practices", "seo"];
  const categoryIcons = {
    performance: "⚡",
    accessibility: "♿",
    "best-practices": "💡",
    seo: "🔍",
  };
  const categoryNames = {
    performance: "Perf",
    accessibility: "A11y",
    "best-practices": "Best",
    seo: "SEO",
  };

  const allUrls = Object.keys(pageScores);
  const coreUrls = allUrls.filter(isCorePage);

  console.log("\n#### 📊 Site Summary (Median)");
  console.log("| Metric | Score | Lowest |");
  console.log("| :--- | :---: | :--- |");

  categories.forEach((cat) => {
    if (!allUrls.some((u) => pageScores[u][cat] !== undefined)) return;

    const catScores = allUrls.map((u) => pageScores[u][cat]);
    catScores.sort((a, b) => a - b);
    const mid = Math.floor(catScores.length / 2);
    const siteMedian = Math.round(
      catScores.length % 2 === 1
        ? catScores[mid]
        : (catScores[mid - 1] + catScores[mid]) / 2,
    );

    const minScore = Math.min(...catScores);
    const worstUrl = allUrls.find((u) => pageScores[u][cat] === minScore);
    const worstName = getPageName(worstUrl);

    const getIcon = (s) => (s >= 90 ? "🟢" : s >= 50 ? "🟠" : "🔴");

    console.log(
      `| ${categoryIcons[cat]} ${categoryNames[cat]} | ${getIcon(siteMedian)} **${siteMedian}%** | ${minScore}% (${worstName}) |`,
    );
  });

  if (failedPages.length > 0) {
    console.log(
      "\n<details>\n<summary><b>⚠️ View Performance Alerts</b></summary>\n",
    );
    failedPages.forEach((url) => {
      const name = getPageName(url);
      const failures = categories
        .filter((cat) => pageScores[url][cat] < THRESHOLD)
        .map(
          (cat) =>
            `${categoryIcons[cat]} ${categoryNames[cat]}: **${pageScores[url][cat]}%**`,
        )
        .join(", ");
      console.log(`- **${name}**: ${failures}`);
    });
    console.log("\n</details>");
  } else {
    console.log(`\n✅ **All pages met the ${THRESHOLD}% threshold!**`);
  }

  const relevantUrls = new Set([...coreUrls, ...failedPages]);
  const relevantLinks = Object.keys(links).filter((url) =>
    relevantUrls.has(url),
  );

  if (relevantLinks.length > 0) {
    console.log("\n#### 🔗 Detailed Reports");
    relevantLinks.forEach((url) => {
      const name = getPageName(url);
      console.log(`- [${name} Report](${links[url]})`);
    });
  }
} catch (error) {
  console.log("### 🌓 Lighthouse Analysis\n\n❌ **Error generating report.**");
}
