const fs = require("node:fs");
const path = require("node:path");

const theme = process.env.THEME || "light";
const resultsDir = ".lighthouseci";

function formatReport() {
  if (!fs.existsSync(resultsDir)) {
    console.log(
      "## ⚡ Lighthouse Analysis (" + theme + ")\n\n⚠️ No results found.",
    );
    return;
  }

  const manifestFiles = fs
    .readdirSync(resultsDir)
    .filter((f) => f.startsWith("manifest.json"));
  if (manifestFiles.length === 0) {
    console.log(
      "## ⚡ Lighthouse Analysis (" + theme + ")\n\n⚠️ No manifest found.",
    );
    return;
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(resultsDir, manifestFiles[0]), "utf8"),
  );
  let body = "## ⚡ Lighthouse Analysis (" + theme + ")\n\n";
  body += "| Page | Performance | Accessibility | Best Practices | SEO |\n";
  body += "| :--- | :---: | :---: | :---: | :---: |\n";

  manifest.forEach((entry) => {
    const perf = Math.round(entry.summary.performance * 100);
    const acc = Math.round(entry.summary.accessibility * 100);
    const bp = Math.round(entry.summary["best-practices"] * 100);
    const seo = Math.round(entry.summary.seo * 100);

    const getIcon = (score) => (score >= 90 ? "🟢" : score >= 50 ? "🟠" : "🔴");

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
}

formatReport();
