/**
 * GitHub Comment Poster: Lighthouse
 *
 * Integration script for GitHub Actions (using github-script).
 * Reads the formatted Lighthouse markdown report and posts it as a PR comment.
 */

import fs from "node:fs";

/**
 * Posts a comment on the GitHub Pull Request with the Lighthouse performance report.
 * It reads the generated markdown report file based on the active theme.
 *
 * @param {object} params - The GitHub Action context parameters.
 * @param {object} params.github - The authenticated Octokit client.
 * @param {object} params.context - The GitHub Action context object.
 * @returns {Promise<void>} Resolves when the comment is successfully created.
 */
export default async function postLighthouseComment({ github, context }) {
  const theme = process.env.THEME;
  const surgeUrl = process.env.SURGE_URL;
  const commentFile = `lighthouse_comment_${theme}.md`;

  if (fs.existsSync(commentFile)) {
    let comment = fs.readFileSync(commentFile, "utf-8");

    if (surgeUrl) {
      comment += `\n\n#### 🌐 Live Report\n> 🚀 [**Open Lighthouse Reports Dashboard**](https://${surgeUrl}) for detailed insights.`;
    }

    const header = "### ⚡ Lighthouse Audit Report";
    const { data: comments } = await github.rest.issues.listComments({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.issue.number,
    });

    const existingComment = comments.find((c) => c.body?.includes(header));

    await (existingComment
      ? github.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: existingComment.id,
        body: comment,
      })
      : github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: comment,
      }));
  } else {
    console.log(`Comment file not found: ${commentFile}`);
  }
}
