/**
 * Format Schema Report for PR Comment
 */

import fs from "node:fs";

const REPORT_FILE = process.argv[2] || "schema-report.json";

if (!fs.existsSync(REPORT_FILE)) {
  console.log("Schema report not found.");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
const { summary, results } = data;

const isSuccess = summary.totalErrors === 0;
const icon = isSuccess ? "✅" : "❌";

console.log(`### 🏷️ Schema.org Validation`);
console.log("");
console.log(
  `${icon} **${isSuccess ? "Passed" : "Failed"}** (${summary.totalSchemas} schemas in ${summary.totalPages} pages)`,
);
console.log("");

if (summary.totalErrors > 0 || summary.totalWarnings > 0) {
  console.log("| Page | Errors | Warnings |");
  console.log("| :--- | :---: | :---: |");
  for (const r of results.filter(
    (r) => r.errors.length > 0 || r.warnings.length > 0,
  )) {
    const errorCount = r.errors.reduce((acc, s) => acc + s.errors.length, 0);
    const warningCount = r.warnings.reduce(
      (acc, s) => acc + s.warnings.length,
      0,
    );

    const errorsCol = errorCount > 0 ? `🔴 ${errorCount}` : "-";
    const warningsCol = warningCount > 0 ? `⚠️ ${warningCount}` : "-";
    console.log(`| \`${r.file}\` | ${errorsCol} | ${warningsCol} |`);
  }
} else {
  console.log("> All pages have valid structured data.");
}
