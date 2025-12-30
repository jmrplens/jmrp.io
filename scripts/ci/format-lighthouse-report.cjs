const fs = require("node:fs");
const path = require("node:path");

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");
const THRESHOLD = 90; // User preferred threshold

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
    const jsonPath = run.jsonPath
      ? path.isAbsolute(run.jsonPath)
        ? run.jsonPath
        : path.join(process.cwd(), run.jsonPath)
      : null;
    if (!jsonPath || !fs.existsSync(jsonPath)) return;

    const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const url = json.finalUrl || json.requestedUrl;
    const categories = json.categories;

    if (!groupedResults[url]) groupedResults[url] = {};

    Object.keys(categories).forEach((key) => {
      if (!groupedResults[url][key]) groupedResults[url][key] = [];
      groupedResults[url][key].push(categories[key].score * 100);
    });
  });

  if (Object.keys(groupedResults).length === 0) {
    console.log("## 🌓 Lighthouse Report\n\nNo runs found");
    process.exit(0);
  }

  // Calculate Median Scores per Page
  const pageScores = {};

  Object.keys(groupedResults).forEach((url) => {
    pageScores[url] = {};
    Object.keys(groupedResults[url]).forEach((cat) => {
      const scores = groupedResults[url][cat];
      scores.sort((a, b) => a - b);
      const mid = Math.floor(scores.length / 2);
      const median =
        scores.length % 2 === 1
          ? scores[mid]
          : (scores[mid - 1] + scores[mid]) / 2;
      pageScores[url][cat] = Math.round(median);
    });
  });

  // 2. Get Links (Uploaded reports)
  let links = {};
  if (fs.existsSync(linksPath)) {
    links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  }

  // --- OUTPUT GENERATION ---
  const theme = process.env.THEME || "light";
  const themeIcon = theme === "light" ? "☀️" : "🌙";
  const themeName = theme === "light" ? "Light Mode" : "Dark Mode";

  console.log(`## 🌓 Lighthouse Report (${themeIcon} ${themeName})`);
  console.log("");
  console.log(
    "| Page | Performance | Accessibility | Best Practices | SEO | Report |",
  );
  console.log("| :--- | :---: | :---: | :---: | :---: | :---: |");

  Object.keys(pageScores).forEach((url) => {
    const scores = pageScores[url];
    const name = getPageName(url);
    const link = links[url] ? `[🔗 View](${links[url]})` : "N/A";

    const getIcon = (score) => (score >= 90 ? "🟢" : score >= 50 ? "🟠" : "🔴");

    console.log(
      `| **${name}** | ${getIcon(scores.performance)} ${scores.performance} | ${getIcon(scores.accessibility)} ${scores.accessibility} | ${getIcon(scores["best-practices"])} ${scores["best-practices"]} | ${getIcon(scores.seo)} ${scores.seo} | ${link} |
    `,
    );
  });
} catch (e) {
  console.log(
    "## 🌓 Lighthouse Report\n\n❌ Error generating report: " + e.message,
  );
}
