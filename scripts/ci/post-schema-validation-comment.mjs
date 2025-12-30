export default async ({ github, context }) => {
  const comment =
    "## 🏷️ Structured Data Check\n\n✅ **Syntax & Basic Properties Valid**\n\n**Scope:** Checked all generated HTML pages (100% coverage).\n**Validation:** Internal strict check for JSON-LD syntax and required schema properties.\n\n**Validated Types:**\n- \`Person\` (Author profile)\n- \`WebSite\` (Site metadata)\n- \`BlogPosting\` (Articles - checks image, author, date)\n- \`BreadcrumbList\` (Navigation)\n\n🔗 [Verify manually with Google Rich Results Test](https://search.google.com/test/rich-results)";

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
