/**
 * Format Accessibility Report for PR Comment
 *
 * Scans for accessibility summaries (Light/Dark) and generates a Markdown table.
 */

import fs from "node:fs";
import path from "node:path";

const deployDir = process.argv[2] || "a11y-deploy";

const themes = ["light", "dark"];
const results = {};

themes.forEach((theme) => {
  const themeDir = path.join(deployDir, theme);
  if (fs.existsSync(themeDir)) {
    const files = fs.readdirSync(themeDir);
    const summaryFile = files.find(
      (f) => f.includes("summary") && f.endsWith(".json"),
    );
    if (summaryFile) {
      try {
        const content = fs.readFileSync(
          path.join(themeDir, summaryFile),
          "utf8",
        );
        results[theme] = JSON.parse(content);
      } catch (e) {
        console.error(`Error reading ${theme} summary:`, e);
      }
    }
  }
});

if (!results.light && !results.dark) {
  console.log("No accessibility summaries found.");
  process.exit(0);
}

// Generate Comment
console.log("### ♿ Accessibility Report");
console.log("");

// Status Header
const statusLight = results.light
  ? results.light.failed === 0
    ? "✅ Passed"
    : "❌ Failed"
  : "—";
const statusDark = results.dark
  ? results.dark.failed === 0
    ? "✅ Passed"
    : "❌ Failed"
  : "—";

console.log("| Theme | Status | Passed | Failed | Incomplete |");
console.log("| :--- | :--- | :---: | :---: | :---: |");

if (results.light) {
  console.log(
    `| ☀️ Light | ${statusLight} | ${results.light.passed} | ${results.light.failed} | ${results.light.incomplete} |`,
  );
}
if (results.dark) {
  console.log(
    `| 🌙 Dark | ${statusDark} | ${results.dark.passed} | ${results.dark.failed} | ${results.dark.incomplete} |`,
  );
}

console.log("");

// Details if failures
const hasFailures = results.light?.failed > 0 || results.dark?.failed > 0;

if (hasFailures) {
  console.log("<details>");
  console.log("<summary><b>🔍 View Violations</b></summary>\n");

  themes.forEach((theme) => {
    const res = results[theme];
    if (res && res.failed > 0) {
      console.log(
        `#### ${theme === "light" ? "☀️" : "🌙"} ${theme.charAt(0).toUpperCase() + theme.slice(1)} Mode Violations`,
      );

      const pages = Array.isArray(res.pages) ? res.pages : [];
      pages
        .filter((p) => p.violations > 0)
        .forEach((p) => {
          // Sanitize page name to prevent markdown injection
          const pageName = (p.page || "Unknown Page").replaceAll(/[[\\]*`]/g, "");
          console.log(`- **${pageName}**: ${p.violations} violations`);
          if (p.violationIds) {
            console.log("  - Rules: `" + p.violationIds.join(", ") + "`");
          }
        });
      console.log("");
    }
  });

  console.log("</details>\n");
}

console.log("> **Standards:** WCAG 2.1/2.2 AA & Best Practices");
