/**
 * Accessibility Report Formatter
 *
 * Reads accessibility-report.json and generates a GitHub comment
 * with test results from Axe-core analysis.
 */

import fs from "node:fs";

if (!fs.existsSync("accessibility-report.json")) {
  console.log("⚠️ accessibility-report.json not found.");
  process.exit(0);
}

/**
 * Determines the status text based on test results
 */
function getStatusText(result) {
  if (!result) {
    return "—";
  }
  return result.failed === 0 ? "✅ Passed" : "❌ Failed";
}

const report = JSON.parse(
  fs.readFileSync("accessibility-report.json", "utf-8"),
);
const results = {
  light: report.find((r) => r.theme === "light"),
  dark: report.find((r) => r.theme === "dark"),
};

// Generate Comment
console.log("### ♿ Accessibility Report");
console.log("");

// Status Header
const statusLight = getStatusText(results.light);
const statusDark = getStatusText(results.dark);

console.log("| Theme | Status | Passed | Failed | Incomplete |");
console.log("| :--- | :--- | :---: | :---: | :---: |");

if (results.light) {
  console.log(
    `| ☀️ Light | ${statusLight} | ${results.light.passed} | ${results.light.failed} | ${results.light.incompleteCount} |`,
  );
}

if (results.dark) {
  console.log(
    `| 🌙 Dark | ${statusDark} | ${results.dark.passed} | ${results.dark.failed} | ${results.dark.incompleteCount} |`,
  );
}

console.log("");

// Details for each theme
[results.light, results.dark].forEach((themeResult) => {
  if (!themeResult) return;

  const emoji = themeResult.theme === "light" ? "☀️" : "🌙";
  const themeName =
    themeResult.theme.charAt(0).toUpperCase() + themeResult.theme.slice(1);

  if (themeResult.violations.length > 0 || themeResult.incomplete.length > 0) {
    console.log(`<details>`);
    console.log(
      `<summary><b>${emoji} ${themeName} Theme Details</b></summary>`,
    );
    console.log("");

    if (themeResult.violations.length > 0) {
      console.log("#### ❌ Violations");
      themeResult.violations.forEach((v) => {
        console.log(`- **${v.id}**: ${v.impact} - ${v.description}`);
        console.log(`  - Affected: ${v.nodes} node(s)`);
      });
      console.log("");
    }

    if (themeResult.incomplete.length > 0) {
      console.log("#### ⚠️ Incomplete");
      themeResult.incomplete.forEach((i) => {
        console.log(`- **${i.id}**: ${i.description}`);
        console.log(`  - Manual review needed: ${i.nodes} node(s)`);
      });
    }

    console.log("</details>");
    console.log("");
  }
});

console.log("---");

const totalPassed = (results.light?.passed || 0) + (results.dark?.passed || 0);
const totalFailed = (results.light?.failed || 0) + (results.dark?.failed || 0);
const totalIncomplete =
  (results.light?.incompleteCount || 0) + (results.dark?.incompleteCount || 0);

console.log(
  `**Total**: ${totalPassed} passed, ${totalFailed} failed, ${totalIncomplete} incomplete`,
);
