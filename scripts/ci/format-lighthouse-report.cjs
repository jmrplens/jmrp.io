const fs = require("node:fs");
const path = require("node:path");

const theme = process.env.THEME || "light";
const resultsDir = ".lighthouseci";

/**
 * Recursively find manifest.json or lhr-*.json files in a directory
 */
function findManifest(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir);

  // 1. Try to find manifest.json directly
  const manifest = files.find((f) => f === "manifest.json");
  if (manifest) return { type: "manifest", path: path.join(dir, manifest) };

  // 2. Try to find lhr-*.json files
  const lhrFiles = files.filter(
    (f) => f.startsWith("lhr-") && f.endsWith(".json"),
  );
  if (lhrFiles.length > 0) {
    return { type: "lhr", files: lhrFiles.map((f) => path.join(dir, f)) };
  }

  // 3. Search subdirectories
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const found = findManifest(fullPath);
      if (found) return found;
    }
  }

  return null;
}

const getPageName = (url) => {
  try {
    const urlObj = new URL(url);
    let pathName = urlObj.pathname;
    if (pathName.length > 1 && pathName.endsWith("/"))
      pathName = pathName.slice(0, -1);
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

function formatReport() {
  const manifestInfo = findManifest(resultsDir);

  if (!manifestInfo) {
    console.log(
      "## 🌓 Lighthouse Report (" +
        theme +
        ")\n\n⚠️ No results found in " +
        resultsDir,
    );
    return;
  }

  const groupedResults = {};

  if (manifestInfo.type === "manifest") {
    const manifest = JSON.parse(fs.readFileSync(manifestInfo.path, "utf8"));
    manifest.forEach((run) => {
      if (!run.jsonPath || !fs.existsSync(run.jsonPath)) return;
      const json = JSON.parse(fs.readFileSync(run.jsonPath, "utf8"));
      const url = json.finalUrl || json.requestedUrl;
      if (!groupedResults[url]) groupedResults[url] = {};
      Object.keys(json.categories).forEach((key) => {
        if (!groupedResults[url][key]) groupedResults[url][key] = [];
        groupedResults[url][key].push(json.categories[key].score * 100);
      });
    });
  } else {
    manifestInfo.files.forEach((file) => {
      const json = JSON.parse(fs.readFileSync(file, "utf8"));
      const url = json.finalUrl || json.requestedUrl;
      if (!groupedResults[url]) groupedResults[url] = {};
      Object.keys(json.categories).forEach((key) => {
        if (!groupedResults[url][key]) groupedResults[url][key] = [];
        groupedResults[url][key].push(json.categories[key].score * 100);
      });
    });
  }

  const themeIcon = theme === "light" ? "☀️" : "🌙";
  const themeName = theme === "light" ? "Light Mode" : "Dark Mode";
  console.log(`## 🌓 Lighthouse Report (${themeIcon} ${themeName})`);
  console.log("");
  console.log("| Page | Performance | Accessibility | Best Practices | SEO |");
  console.log("| :--- | :---: | :---: | :---: | :---: |");

  Object.keys(groupedResults).forEach((url) => {
    const name = getPageName(url);
    const getMedian = (scores) => {
      scores.sort((a, b) => a - b);
      const mid = Math.floor(scores.length / 2);
      return Math.round(
        scores.length % 2 === 1
          ? scores[mid]
          : (scores[mid - 1] + scores[mid]) / 2,
      );
    };
    const perf = getMedian(groupedResults[url].performance || [0]);
    const acc = getMedian(groupedResults[url].accessibility || [0]);
    const bp = getMedian(groupedResults[url]["best-practices"] || [0]);
    const seo = getMedian(groupedResults[url].seo || [0]);
    const getIcon = (s) => (s >= 90 ? "🟢" : s >= 50 ? "🟠" : "🔴");
    console.log(
      `| **${name}** | ${getIcon(perf)} ${perf} | ${getIcon(acc)} ${acc} | ${getIcon(bp)} ${bp} | ${getIcon(seo)} ${seo} |`,
    );
  });
}

formatReport();
