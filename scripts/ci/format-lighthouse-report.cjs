const fs = require("node:fs");
const path = require("node:path");

const theme = process.env.THEME || "light";
const resultsDir = ".lighthouseci";

/**
 * Recursively find manifest.json in a directory
 */
function findManifest(dir) {
  if (!fs.existsSync(dir)) return null;

  const files = fs.readdirSync(dir);

  // Look for manifest.json in current dir
  const manifest = files.find((f) => f === "manifest.json");
  if (manifest) return path.join(dir, manifest);

  // Look in subdirectories
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      const found = findManifest(fullPath);
      if (found) return found;
    }
  }

  return null;
}

function formatReport() {
  const manifestPath = findManifest(resultsDir);

  if (!manifestPath) {
    console.log(
      "## ⚡ Lighthouse Analysis (" +
        theme +
        ")\n\n⚠️ No manifest found in " +
        resultsDir,
    );
    return;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    let body = "## ⚡ Lighthouse Analysis (" + theme + ")\n\n";
    body += "| Page | Performance | Accessibility | Best Practices | SEO |\n";
    body += "| :--- | :---: | :---: | :---: | :---: |\n";

    manifest.forEach((entry) => {
      if (!entry.summary) return;

      const perf = Math.round(entry.summary.performance * 100);
      const acc = Math.round(entry.summary.accessibility * 100);
      const bp = Math.round(entry.summary["best-practices"] * 100);
      const seo = Math.round(entry.summary.seo * 100);

      const getIcon = (score) =>
        score >= 90 ? "🟢" : score >= 50 ? "🟠" : "🔴";

      body +=
        "| " +
        entry.url +
        " | " +
        getIcon(perf) +
        " " +
        perf +
        " | " +
        getIcon(acc) +
        " " +
        acc +
        " | " +
        getIcon(bp) +
        " " +
        bp +
        " | " +
        getIcon(seo) +
        " " +
        seo +
        " |\n";
    });

    console.log(body);
  } catch (e) {
    console.log(
      "## ⚡ Lighthouse Analysis (" +
        theme +
        ")\n\n❌ Error parsing manifest: " +
        e.message,
    );
  }
}

formatReport();
