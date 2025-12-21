import fs from "fs";
import path from "path";

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");
const THRESHOLD = 95;

// Helper: Map URL to a friendly Page Name
const getPageName = (url) => {
  const cleanUrl = url.replace(/:\d+/, ""); // Remove port if present
  if (/localhost\/?$/.test(cleanUrl)) return "Home";
  if (cleanUrl.includes("/services/")) return "Services";
  if (cleanUrl.includes("/cv/")) return "CV";
  if (cleanUrl.includes("/publications/")) return "Publications";
  if (cleanUrl.includes("/github/")) return "GitHub";
  if (cleanUrl.includes("/blog/")) return "Blog Index";
  // Extract slug for posts/others
  const match = cleanUrl.match(/localhost\/([\w-/]+)\/?$/);
  if (match) return match[1].replace(/\/$/, "");
  return "Unknown";
};

// Identify Core Pages
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

// Helper: Get Emoji for Score
const getScoreEmoji = (score) => {
  if (score >= 90) return "🟢";
  if (score >= 50) return "🟠";
  return "🔴";
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
    console.log("No runs found");
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
        scores.length % 2 !== 0
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

  console.log("### ⚡ Lighthouse Report");

  const categories = [
    "performance",
    "accessibility",
    "best-practices",
    "seo",
    "pwa",
  ];
  const categoryIcons = {
    performance: "⚡",
    accessibility: "♿",
    "best-practices": "💡",
    seo: "🔍",
    pwa: "📱",
  };
  const categoryNames = {
    performance: "Perf",
    accessibility: "A11y",
    "best-practices": "Best",
    seo: "SEO",
    pwa: "PWA",
  };

  const allUrls = Object.keys(pageScores);
  const coreUrls = allUrls.filter(isCorePage);

  // SECTION 1: Global Summary
  // Calculate median across ALL pages for each category
  console.log("\n#### 📊 Site Summary (Median)");
  console.log("| Metric | Site Score | Lowest Score |");
  console.log("| :--- | :--- | :--- |");

  categories.forEach((cat) => {
    if (!allUrls.some((u) => pageScores[u][cat] !== undefined)) return;

    // Site Median
    const catScores = allUrls.map((u) => pageScores[u][cat]);
    catScores.sort((a, b) => a - b);
    const mid = Math.floor(catScores.length / 2);
    const siteMedian =
      catScores.length % 2 !== 0
        ? catScores[mid]
        : (catScores[mid - 1] + catScores[mid]) / 2;

    // Lowest Score
    const minScore = Math.min(...catScores);
    const worstUrl = allUrls.find((u) => pageScores[u][cat] === minScore);
    const worstName = getPageName(worstUrl);

    console.log(
      "| " +
        categoryIcons[cat] +
        " " +
        categoryNames[cat] +
        " | " +
        Math.round(siteMedian) +
        "% | " +
        minScore +
        "% (" +
        worstName +
        ") |",
    );
  });

  // SECTION 2: Core Pages Detail
  if (coreUrls.length > 0) {
    console.log("\n#### 🏆 Core Pages");
    let header = "| Category |";
    let separator = "| :--- |";
    coreUrls.forEach((url) => {
      header = header + " " + getPageName(url) + " |";
      separator = separator + " :---: |";
    });
    console.log(header);
    console.log(separator);

    categories.forEach((cat) => {
      if (!coreUrls.some((u) => pageScores[u][cat] !== undefined)) return;
      let row = "| " + categoryIcons[cat] + " " + categoryNames[cat] + " |";
      coreUrls.forEach((url) => {
        const score = pageScores[url][cat];
        row =
          row +
          " " +
          (score ? getScoreEmoji(score) + " " + score + "%" : "-") +
          " |";
      });
      console.log(row);
    });
  }

  // SECTION 3: Alerts (Failures < 95%)
  if (failedPages.length > 0) {
    console.log("\n#### ⚠️ Alerts (<" + THRESHOLD + "%)");
    failedPages.forEach((url) => {
      const name = getPageName(url);
      const failures = categories
        .filter((cat) => pageScores[url][cat] < THRESHOLD)
        .map(
          (cat) =>
            categoryIcons[cat] +
            " " +
            categoryNames[cat] +
            ": " +
            pageScores[url][cat] +
            "%",
        )
        .join(", ");
      console.log("- **" + name + "**: " + failures);
    });
  } else {
    console.log("\n✅ **All pages met the " + THRESHOLD + "% threshold!**");
  }

  // SECTION 4: Links
  const relevantUrls = new Set([...coreUrls, ...failedPages]);
  const relevantLinks = Object.keys(links).filter((url) =>
    relevantUrls.has(url),
  );

  if (relevantLinks.length > 0) {
    console.log("\n#### 🔗 Reports");
    relevantLinks.forEach((url) => {
      const name = getPageName(url);
      console.log("- [" + name + " Report](" + links[url] + ")");
    });
    if (Object.keys(links).length > relevantLinks.length) {
      console.log(
        "\n_(And " +
          (Object.keys(links).length - relevantLinks.length) +
          " other reports available in artifacts)_",
      );
    }
  }
} catch (error) {
  console.error("Error generating report:", error);
}
