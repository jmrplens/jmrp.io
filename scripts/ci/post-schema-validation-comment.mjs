export default async ({ github, context }) => {
  let comment = "### 🏷️ Structured Data Check\n\n";
  comment += "✅ **Passed!**\n\n";
  comment += "**Scope:** 100% coverage of generated HTML pages.\n";
  comment +=
    "**Validation:** Internal logic check for JSON-LD syntax and required schema.org properties.\n\n";
  comment += "| Type | Validated Aspect |\n";
  comment += "| :--- | :--- |\n";
  comment += "| 👤 `Person` | Author profile & Social links |\n";
  comment += "| 🌐 `WebSite` | Site metadata & Publisher info |\n";
  comment += "| 📰 `BlogPosting` | Article metadata (Image, Author, Dates) |\n";
  comment += "| 🧭 `BreadcrumbList` | Navigation hierarchy |\n\n";
  comment += "---\n";
  comment +=
    "> 🔗 [Verify manually with Google Rich Results Test](https://search.google.com/test/rich-results)";

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
