import fs from "fs";

export default async ({ github, context }) => {
  const theme = process.env.THEME;
  const themeIcon = theme === "light" ? "☀️" : "🌙";
  const themeName = theme === "light" ? "Light" : "Dark";
  const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;
  const surgeUrl = process.env.SURGE_URL;

  let commentBody = "";

  try {
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      const isSuccess = summary.failed === 0;

      const statusIcon = isSuccess ? "✅" : "⚠️";
      const statusText = isSuccess ? "**Passed!**" : "**Violations detected**";

      commentBody = `### ♿ Accessibility (${themeIcon} ${themeName})\n\n`;
      commentBody += `${statusIcon} ${statusText}\n\n`;

      commentBody += "| Metric | Value |\n";
      commentBody += "| :--- | :--- |\n";
      commentBody += `| 📄 Total Pages | **${summary.totalPages}** |\n`;
      commentBody += `| ✅ Passed | **${summary.passed}** |\n`;
      commentBody += `| ❌ Failed | **${summary.failed}** |\n`;
      commentBody += `| 🔍 Review Needed | **${summary.incomplete || 0}** |\n`;

      if (surgeUrl) {
        commentBody += `| 🌐 Full Report | [**Open Interactive Report**](https://${surgeUrl}) 🚀 |\n`;
      }
      commentBody += "\n";

      if (!isSuccess) {
        commentBody +=
          "<details>\n<summary><b>🔍 View Failed Pages & Rules</b></summary>\n\n";
        commentBody += "#### ❌ Issues Found\n\n";
        summary.pages
          .filter((p) => p.violations > 0)
          .forEach((p) => {
            const rulesText = p.violationIds
              ? "\n   - **Violated Rules:** `" + p.violationIds.join(", ") + "`"
              : "";
            commentBody += `- **${p.page}** (${p.violations} violations)${rulesText}\n`;
          });
        commentBody +=
          "\n---\n📸 *Screenshots are available in the build artifacts.*\n";
        commentBody += "</details>\n\n";
      }

      commentBody += `> **Standards:** WCAG 2.1/2.2 AA & Best Practices\n`;

      if (!surgeUrl) {
        commentBody += `> 📊 [View Build Logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})
`;
      }
    } else {
      throw new Error(`Summary file not found at ${summaryPath}`);
    }
  } catch (error) {
    commentBody = `### ♿ Accessibility (${themeIcon} ${themeName})\n\n⚠️ **Report not found**\n\n> Error: ${error.message}`;
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: commentBody,
  });
};
