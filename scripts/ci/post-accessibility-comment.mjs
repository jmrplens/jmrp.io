import fs from "fs";

export default async ({ github, context }) => {
  const theme = process.env.THEME;
  const themeIcon = theme === "light" ? "☀️" : "🌙";
  const themeName = theme === "light" ? "Light" : "Dark";
  const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;

  let commentBody = "";

  try {
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
      const isSuccess = summary.failed === 0;

      const statusIcon = isSuccess ? "✅" : "⚠️";
      const statusText = isSuccess ? "**Passed!**" : "**Violations detected**";

      commentBody = `## ♿ Accessibility (${themeIcon} ${themeName})\n\n${statusIcon} ${statusText}\n\n`;
      commentBody += `**Summary:**\n- Total Pages: **${summary.totalPages}**\n- Failed: ${summary.failed}\n- Review Needed: ${summary.incomplete || 0} 🔍\n\n`;

      if (!isSuccess) {
        commentBody += `### ❌ Failed Pages\n`;
        summary.pages
          .filter((p) => p.violations > 0)
          .forEach((p) => {
            const rules = p.violationIds
              ? `\n   - **Rules:** 
${p.violationIds.join(", ")}`
              : "";
            commentBody += `- **${p.page}** (${p.violations} violations)${rules}\n`;
          });
        commentBody += `\n📸 **See 'axe-accessibility-report-${theme}' artifact for screenshots.**\n\n`;
      }

      commentBody += `**Standards:** WCAG 2.1/2.2 AA & Best Practices\n`;
      commentBody += `📊 [View detailed HTML report](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;
    } else {
      throw new Error(`Summary file not found at ${summaryPath}`);
    }
  } catch (error) {
    commentBody = `## ♿ Accessibility (${themeIcon} ${themeName})\n\n⚠️ **Report not found**\n\nError: ${error.message}`;
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: commentBody,
  });
};
