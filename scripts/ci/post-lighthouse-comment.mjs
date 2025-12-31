import fs from "fs";

export default async ({ github, context }) => {
  const theme = process.env.THEME;
  const surgeUrl = process.env.SURGE_URL;
  const commentFile = `lighthouse_comment_${theme}.md`;

  if (fs.existsSync(commentFile)) {
    let comment = fs.readFileSync(commentFile, "utf8");

    if (surgeUrl) {
      comment += `\n\n#### 🌐 Live Report\n> 🚀 [**Open Full Lighthouse Audit**](https://${surgeUrl}) for detailed insights.`;
    }

    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: comment,
    });
  } else {
    console.log(`Comment file not found: ${commentFile}`);
  }
};
