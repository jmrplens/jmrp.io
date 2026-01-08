/**
 * Local Lighthouse Result Analyzer
 *
 * Scans the 'lighthouse-results' directory for JSON reports,
 * prints a summary table of scores, and highlights critical issues.
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

const files = fs
  .readdirSync(lhDir)
  .filter((f) => f.endsWith(".json") && !f.includes("manifest"));

if (files.length === 0) {
  console.log(`${colors.yellow}⚠️ No JSON reports found.${colors.reset}`);
  process.exit(0);
}

console.log(
  `${colors.cyan}${colors.bold}📊 Lighthouse Audit Analysis (Local Summary)${colors.reset}\n`,
);

files.forEach((file) => {
  try {
    const report = JSON.parse(fs.readFileSync(path.join(lhDir, file), "utf8"));
    const url = new URL(report.finalUrl).pathname;

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

    console.log(`${colors.bold}Page: ${url}${colors.reset}`);
    console.log(
      `  Perf: ${getScoreColor(scores.performance)}${scores.performance}%${colors.reset} | ` +
        `A11y: ${getScoreColor(scores.accessibility)}${scores.accessibility}%${colors.reset} | ` +
        `Best: ${getScoreColor(scores.bestPractices)}${scores.bestPractices}%${colors.reset} | ` +
        `SEO:  ${getScoreColor(scores.seo)}${scores.seo}%${colors.reset}`,
    );

    // Highlight critical issues (score < 0.9)
    const issues = [];
    Object.values(report.audits).forEach((audit) => {
      if (
        audit.score !== null &&
        audit.score < 0.9 &&
        audit.details?.type !== "debugdata"
      ) {
        // Filter for high impact audits
        if (
          [
            "lcp-lazy-loaded",
            "largest-contentful-paint",
            "cls",
            "interactive",
            "total-blocking-time",
            "image-alt",
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
      `  ${colors.red}Error parsing ${file}: ${e.message}${colors.reset}`,
    );
  }
});
