import fs from "node:fs";
import path from "node:path";

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");
const THRESHOLD = 95;

// Helper: Map URL to a friendly Page Name
const getPageName = (url) => {
  try {
    const urlObj = new URL(url);
    let pathName = urlObj.pathname;

    // Normalize: remove trailing slash if present (but keep root /)
    if (pathName.length > 1 && pathName.endsWith("/")) {
      pathName = pathName.slice(0, -1);
    }

    if (pathName === "/" || pathName === "") return "Home";
    if (pathName === "/services") return "Services";
    if (pathName === "/cv") return "CV";
    if (pathName === "/publications") return "Publications";
    if (pathName === "/github") return "GitHub";
    if (pathName === "/blog") return "Blog Index";

    // Check for blog posts
    if (pathName.startsWith("/blog/")) {
      const slug = pathName.split("/").pop();
      // Capitalize for nicer display
      const friendlySlug = slug.charAt(0).toUpperCase() + slug.slice(1);
      return "Post: " + friendlySlug;
    }

    // Fallback: return path
    return pathName;
  } catch (e) {
    return "Unknown";
  }
};

// Identify Core Pages (for linking purposes)
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

  // 1. Get Scores
  let manifest = [];
  const manifestPath = path.join(lhciDir, "manifest.json");

  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } else {
    // Fallback: find all lhr-*.json files
    const files = fs.readdirSync(lhciDir);
    const jsonFiles = files.filter(
      (f) => f.startsWith("lhr-") && f.endsWith(".json"),
    );
    manifest = jsonFiles.map((f) => ({ jsonPath: path.join(lhciDir, f) }));
  }

  // Group by URL
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

  // Calculate Median Scores per Page
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

      if (finalScore < THRESHOLD) {
        hasFailure = true;
      }
    });

    if (hasFailure) {
      failedPages.push(url);
    }
  });

  // 2. Get Links
  let links = {};
  if (fs.existsSync(linksPath)) {
    links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  }

  // --- OUTPUT GENERATION ---

  const theme = process.env.THEME || "unknown";

  const themeNames = {
    light: "☀️ Light Mode",
    dark: "🌙 Dark Mode",
  };
  const themeName = themeNames[theme] || "Report";

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

  // SECTION 1: Global Summary
  console.log("\n#### 📊 Site Summary (Median)");
  console.log("| Metric | Score | Lowest |");
  console.log("| :--- | :---: | :--- |");

  categories.forEach((cat) => {
    if (!allUrls.some((u) => pageScores[u][cat] !== undefined)) return;

    // Site Median
    const catScores = allUrls.map((u) => pageScores[u][cat]);
    catScores.sort((a, b) => a - b);
    const mid = Math.floor(catScores.length / 2);
    const siteMedian = Math.round(
      catScores.length % 2 === 1
        ? catScores[mid]
        : (catScores[mid - 1] + catScores[mid]) / 2,
    );

    // Lowest Score
    const minScore = Math.min(...catScores);
    const worstUrl = allUrls.find((u) => pageScores[u][cat] === minScore);
    const worstName = getPageName(worstUrl);

    const getIcon = (s) => (s >= 90 ? "🟢" : s >= 50 ? "🟠" : "🔴");

    console.log(
      `| ${categoryIcons[cat]} ${categoryNames[cat]} | ${getIcon(siteMedian)} **${siteMedian}%** | ${minScore}% (${worstName}) |`,
    );
  });

  // SECTION 2: Alerts
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

  // SECTION 3: Links
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
