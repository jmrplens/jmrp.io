/**
 * Local Lighthouse Result Analyzer (Simplified)
 *
 * Scans the 'lighthouse-results' directory for JSON reports,
 * filters for the second run of each URL, and prints a summary.
 */

import fs from "node:fs";
import path from "node:path";

const lhDir = "lighthouse-results";

// ANSI colors
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

if (!fs.existsSync(lhDir)) {
  console.log(
    `${colors.red}❌ No Lighthouse results found in ${lhDir}${colors.reset}`,
  );
  process.exit(0);
}

// Read manifest to correctly identify runs
const manifestPath = path.join(lhDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.log(
    `${colors.yellow}⚠️ No manifest.json found in ${lhDir}.${colors.reset}`,
  );
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

// Filter for the 2nd run of each URL
// LHCI manifest items are ordered by run. We group by URL and pick index 1 (2nd run).
const groupedByUrl = manifest.reduce((acc, run) => {
  if (!acc[run.url]) acc[run.url] = [];
  acc[run.url].push(run);
  return acc;
}, {});

console.log(
  `${colors.cyan}${colors.bold}📊 Lighthouse Audit Analysis (Local - 2nd Run Only)${colors.reset}\n`,
);

Object.entries(groupedByUrl).forEach(([url, runs]) => {
  // If there's only 1 run, we fallback to it, but the user requested 2 runs and we pick the 2nd.
  const targetRun = runs.length >= 2 ? runs[1] : runs[0];
  const runNumber = runs.length >= 2 ? "2nd" : "1st (only)";

  try {
    const reportPath = path.join(lhDir, path.basename(targetRun.jsonPath));
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const displayUrl = new URL(url).pathname;

    const scores = {
      performance: Math.round(report.categories.performance.score * 100),
      accessibility: Math.round(report.categories.accessibility.score * 100),
      bestPractices: Math.round(
        report.categories["best-practices"].score * 100,
      ),
      seo: Math.round(report.categories.seo.score * 100),
    };

    const getScoreColor = (score) => {
      if (score >= 90) return colors.green;
      if (score >= 50) return colors.yellow;
      return colors.red;
    };

    console.log(
      `${colors.bold}Page: ${displayUrl} [Analyzing ${runNumber} run]${colors.reset}`,
    );
    console.log(
      `  Perf: ${getScoreColor(scores.performance)}${scores.performance}%${colors.reset} | ` +
        `A11y: ${getScoreColor(scores.accessibility)}${scores.accessibility}%${colors.reset} | ` +
        `Best: ${getScoreColor(scores.bestPractices)}${scores.bestPractices}%${colors.reset} | ` +
        `SEO:  ${getScoreColor(scores.seo)}${scores.seo}%${colors.reset}`,
    );

    // Highlight critical issues
    const issues = [];
    Object.values(report.audits).forEach((audit) => {
      if (
        audit.score !== null &&
        audit.score < 0.9 &&
        audit.details?.type !== "debugdata"
      ) {
        if (
          [
            "lcp-lazy-loaded",
            "largest-contentful-paint",
            "cls",
            "interactive",
            "total-blocking-time",
            "image-alt",
            "errors-in-console",
          ].includes(audit.id)
        ) {
          issues.push(
            `    - ${colors.yellow}${audit.title}${colors.reset}: ${audit.displayValue || "Failed"}`,
          );
        }
      }
    });

    if (issues.length > 0) {
      console.log(`  ${colors.bold}Key Issues:${colors.reset}`);
      issues.forEach((i) => console.log(i));
    }
    console.log("");
  } catch (e) {
    console.error(
      `  ${colors.red}Error parsing report for ${url}: ${e.message}${colors.reset}`,
    );
  }
});
