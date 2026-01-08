/**
 * Analyze Lighthouse Results
 *
 * Scans the lighthouse-results directory for JSON reports,
 * summarizes scores, and identifies critical problems.
 */

import fs from "node:fs";
import path from "node:path";

const resultsDir = "lighthouse-results";

if (!fs.existsSync(resultsDir)) {
  console.log("❌ No Lighthouse results directory found.");
  process.exit(1);
}

const files = fs
  .readdirSync(resultsDir)
  .filter((f) => f.endsWith(".json") && !f.includes("manifest"));

if (files.length === 0) {
  console.log("❌ No Lighthouse JSON reports found.");
  process.exit(1);
}

console.log(`\n🧐 Analyzing ${files.length} Lighthouse reports...\n`);

const summary = [];
const criticalIssues = [];

files.forEach((file) => {
  const filePath = path.join(resultsDir, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const url = data.finalUrl;
    const scores = {
      performance: Math.round(data.categories.performance.score * 100),
      accessibility: Math.round(data.categories.accessibility.score * 100),
      bestPractices: Math.round(data.categories["best-practices"].score * 100),
      seo: Math.round(data.categories.seo.score * 100),
    };

    summary.push({ url, scores });

    // Identify failed audits (score < 1 and not informative)
    Object.values(data.audits).forEach((audit) => {
      if (
        audit.score !== null &&
        audit.score < 0.9 &&
        audit.details?.type !== "debugdata"
      ) {
        criticalIssues.push({
          url,
          id: audit.id,
          title: audit.title,
          displayValue: audit.displayValue || "",
          score: audit.score,
        });
      }
    });
  } catch (e) {
    console.warn(`⚠️ Error parsing ${file}: ${e.message}`);
  }
});

// Print Summary Table
console.log("📊 SCORES SUMMARY:");
console.log("".padEnd(80, "-"));
console.log(
  `${"Page URL".padEnd(40)} | ${"Perf".padStart(4)} | ${"A11y".padStart(4)} | ${"Best".padStart(4)} | ${"SEO".padStart(4)}`,
);
console.log("".padEnd(80, "-"));

summary
  .sort((a, b) => a.url.localeCompare(b.url))
  .forEach((s) => {
    const p = String(s.scores.performance).padStart(4);
    const a = String(s.scores.accessibility).padStart(4);
    const b = String(s.scores.bestPractices).padStart(4);
    const seo = String(s.scores.seo).padStart(4);
    console.log(`${s.url.padEnd(40)} | ${p} | ${a} | ${b} | ${seo}`);
  });
console.log("".padEnd(80, "-"));

// Print Critical Issues
if (criticalIssues.length > 0) {
  console.log(`\n⚠️  IDENTIFIED PROBLEMS (${criticalIssues.length}):`);

  // Group by URL
  const grouped = criticalIssues.reduce((acc, issue) => {
    if (!acc[issue.url]) acc[issue.url] = [];
    acc[issue.url].push(issue);
    return acc;
  }, {});

  Object.entries(grouped).forEach(([url, issues]) => {
    console.log(`\n📍 ${url}`);
    issues.forEach((i) => {
      const color = i.score === 0 ? "\x1b[31m" : "\x1b[33m";
      console.log(
        `  - [${color}${i.id}\x1b[0m]: ${i.title} ${i.displayValue ? `(${i.displayValue})` : ""}`,
      );
    });
  });
} else {
  console.log("\n✅ No critical issues found in the audit.");
}

console.log("\n" + "".padEnd(80, "=") + "\n");
