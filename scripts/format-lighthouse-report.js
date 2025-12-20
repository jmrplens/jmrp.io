import fs from "fs";
import path from "path";

const lhciDir = "./.lighthouseci";
const linksPath = path.join(lhciDir, "links.json");

try {
  if (!fs.existsSync(lhciDir)) {
    console.error("Lighthouse directory not found");
    process.exit(0);
  }

  // 1. Get Scores
  // Look for manifest.json first, if not find all lhr-*.json files
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

  const summary = {};
  let count = 0;

  manifest.forEach((run) => {
    if (!run.jsonPath || !fs.existsSync(run.jsonPath)) return;
    const json = JSON.parse(fs.readFileSync(run.jsonPath, "utf8"));
    const categories = json.categories;

    Object.keys(categories).forEach((key) => {
      if (!summary[key]) summary[key] = 0;
      summary[key] += categories[key].score;
    });
    count++;
  });

  if (count === 0) {
    console.log("No runs found");
    process.exit(0);
  }

  const scores = {};
  Object.keys(summary).forEach((key) => {
    scores[key] = Math.round((summary[key] / count) * 100);
  });

  // 2. Get Links
  let links = {};
  if (fs.existsSync(linksPath)) {
    links = JSON.parse(fs.readFileSync(linksPath, "utf8"));
  }

  // 3. Generate Output
  console.log("### ⚡ Lighthouse Report");
  console.log("| Category | Score |");
  console.log("| --- | --- |");
  console.log(`| 🟢 Performance | ${scores.performance}% |`);
  console.log(`| ♿ Accessibility | ${scores.accessibility}% |`);
  console.log(`| 💡 Best Practices | ${scores["best-practices"]}% |`);
  console.log(`| 🔍 SEO | ${scores.seo}% |`);
  if (scores.pwa) {
    console.log(`| 📱 PWA | ${scores.pwa}% |`);
  }

  const linkKeys = Object.keys(links);
  if (linkKeys.length > 0) {
    console.log("\n#### 🔗 Full Reports");
    linkKeys.forEach((url) => {
      console.log(`- [${url}](${links[url]})`);
    });
  }
} catch (e) {
  console.error(e);
  process.exit(1);
}