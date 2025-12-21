import fs from "fs";
import path from "path";

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");

// Helper: Map URL to a friendly Page Name
const getPageName = (url) => {
  if (url.endsWith("localhost/") || url.endsWith("localhost")) return "Home";
  if (url.includes("/services/")) return "Services";
  if (url.includes("/cv/")) return "CV";
  if (url.includes("/publications/")) return "Publications";
  if (url.includes("/github/")) return "Repositories";
  if (url.includes("/blog/")) return "Blog";
  return "Unknown";
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

  // Calculate Averages
  const averagedResults = {};
  Object.keys(groupedResults).forEach((url) => {
    averagedResults[url] = {};
    Object.keys(groupedResults[url]).forEach((cat) => {
      const scores = groupedResults[url][cat];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      averagedResults[url][cat] = Math.round(avg);
    });
  });

  // 2. Get Links
  let links = {};
  if (fs.existsSync(linksPath)) {
    links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  }

  // 3. Generate Output Table
  console.log("### ⚡ Lighthouse Report");

  const urls = Object.keys(averagedResults);
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

  const validCategories = categories.filter((cat) =>
    urls.some((url) => averagedResults[url][cat] !== undefined),
  );

  // Table Header
  let headerRow = "| Category |";
  let separatorRow = "| --- |";

  urls.forEach((url) => {
    headerRow += ` ${getPageName(url)} |`;
    separatorRow += " --- |";
  });

  console.log(headerRow);
  console.log(separatorRow);

  // Table Body
  validCategories.forEach((cat) => {
    let row = `| ${categoryIcons[cat]} ${categoryNames[cat]} |`;
    urls.forEach((url) => {
      const score = averagedResults[url][cat];
      row += ` ${score ? `${getScoreEmoji(score)} ${score}%` : "-"} |`;
    });
    console.log(row);
  });

  // 4. Full Report Links
  const linkKeys = Object.keys(links);
  if (linkKeys.length > 0) {
    console.log("\n#### 🔗 Full Reports");
    linkKeys.forEach((url) => {
      const pageName = getPageName(url);
      console.log(`- [${pageName} Report](${links[url]})`);
    });
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}