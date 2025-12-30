const fs = require('fs');

module.exports = async ({ github, context }) => {
  const theme = process.env.THEME;
  const themeIcon = theme === 'light' ? '☀️' : '🌙';
  const themeName = theme === 'light' ? 'Light' : 'Dark';
  const summaryPath = `accessibility-report/accessibility-summary-${theme}.json`;
  
  let commentBody = '';

  try {
    console.log('Checking for summary file at:', summaryPath);
    
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
      const isSuccess = summary.failed === 0;
      
      const statusIcon = isSuccess ? '✅' : '⚠️';
      const statusText = isSuccess ? '**Passed!**' : '**Violations detected**';
      
      commentBody = `## ♿ Accessibility (${themeIcon} ${themeName})

${statusIcon} ${statusText}

`;
      commentBody += `**Summary:**
- Total Pages: **${summary.totalPages}**
- Failed: ${summary.failed}
- Review Needed: ${summary.incomplete || 0} 🔍

`;
      
      if (!isSuccess) {
        commentBody += `### ❌ Failed Pages
`;
        summary.pages
          .filter((p) => p.violations > 0)
          .forEach((p) => {
            const rules = p.violationIds ? `
   - **Rules:** 
${p.violationIds.join(', ')}
`` : '';
            commentBody += `- **${p.page}** (${p.violations} violations)${rules}
`;
          });
        commentBody += `
📸 **See 'axe-accessibility-report-${theme}' artifact for screenshots.**

`;
      }

      commentBody += `**Standards:** WCAG 2.1/2.2 AA & Best Practices
`;
      commentBody += `📊 [View detailed HTML report](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;
      
    } else {
      throw new Error(`Summary file not found at ${summaryPath}`);
    }
  } catch (error) {
      console.log('Error generating comment:', error);
      commentBody = `## ♿ Accessibility (${themeIcon} ${themeName})

⚠️ **Report not found**

Error: ${error.message}`;
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: commentBody
  });
};
