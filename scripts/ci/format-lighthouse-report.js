/**
 * Format Lighthouse Report for PR Comment
 *
 * Scans the .lighthouseci directory for JSON reports,
 * aggregates scores by URL and Form Factor (Mobile/Desktop),
 * and outputs a Markdown table.
 */

const fs = require("fs");
const path = require("path");

const lhDir = process.argv[2] || ".lighthouseci";
const theme = process.env.THEME || "light";

if (!fs.existsSync(lhDir)) {
  console.log("No Lighthouse reports found.");
  process.exit(0);
}

// Find all JSON reports
const files = fs
  .readdirSync(lhDir)
  .filter(
    (f) =>
      f.endsWith(".json") && !f.includes("manifest") && !f.includes("links"),
  );

const results = {};

files.forEach((file) => {
  try {
    const content = fs.readFileSync(path.join(lhDir, file), "utf8");
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

    // Fallback: look at configSettings.formFactor, default to mobile
    const formFactor = json.configSettings?.formFactor || "mobile";

    const scores = {
      p: (json.categories.performance?.score || 0) * 100,
      a: (json.categories.accessibility?.score || 0) * 100,
      b: (json.categories["best-practices"]?.score || 0) * 100,
      s: (json.categories.seo?.score || 0) * 100,
    };

    if (!results[url]) {
      results[url] = { mobile: [], desktop: [] };
    }

    // Safety check for formFactor array existence
    if (!results[url][formFactor]) {
      results[url][formFactor] = [];
    }
    results[url][formFactor].push(scores);
  } catch (e) {
    // ignore invalid json
  }
});

// Calculate averages
const getAvg = (list) => {
  if (!list || list.length === 0) return null;
  const totals = { p: 0, a: 0, b: 0, s: 0 };
  list.forEach((item) => {
    totals.p += item.p;
    totals.a += item.a;
    totals.b += item.b;
    totals.s += item.s;
  });
  return {
    p: Math.round(totals.p / list.length),
    a: Math.round(totals.a / list.length),
    b: Math.round(totals.b / list.length),
    s: Math.round(totals.s / list.length),
  };
};

const rows = Object.entries(results)
  .sort()
  .map(([url, data]) => {
    const m = getAvg(data.mobile);
    const d = getAvg(data.desktop);

    const formatScore = (val) => {
      if (val === null) return "—";
      const icon = val >= 90 ? "🟢" : val >= 50 ? "🟠" : "🔴";
      return `${icon} ${val}`;
    };

    return `| \`${url}\` | ${formatScore(m ? m.p : null)} | ${formatScore(d ? d.p : null)} |`;
  });

if (rows.length === 0) {
  console.log("No valid Lighthouse results parsed.");
} else {
  console.log(
    `### ⚡ Lighthouse Report (${theme.charAt(0).toUpperCase() + theme.slice(1)})`,
  );
  console.log("");
  console.log("| Page | 📱 Mobile (Perf) | 🖥️ Desktop (Perf) |");
  console.log("| :--- | :---: | :---: |");
  console.log(rows.join("\n"));
  console.log("");
  console.log(
    "_Scores represent the average Performance metric across multiple runs._",
  );
}
