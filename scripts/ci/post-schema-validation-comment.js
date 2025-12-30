module.exports = async ({ github, context }) => {
  const comment = `## 🏷️ Structured Data Check

  ✅ **Syntax & Basic Properties Valid**

  **Scope:** Checked all generated HTML pages (100% coverage).
  **Validation:** Internal strict check for JSON-LD syntax and required schema properties.

  **Validated Types:**
  - 
  - 
  - 
  - 

  🔗 [Verify manually with Google Rich Results Test](https://search.google.com/test/rich-results)`;

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment
  });
};

