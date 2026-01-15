/**
 * Common GitHub Actions utilities for CI scripts.
 */

/**
 * Posts a new comment or updates an existing one on a Pull Request.
 *
 * @param {object} github - The octokit client instance.
 * @param {object} context - The GitHub context object.
 * @param {string} header - The unique header text to identify the comment.
 * @param {string} body - The markdown content of the comment.
 */
export async function postOrUpdateComment(github, context, header, body) {
  if (!context.payload.pull_request) {
    console.log("Not a pull request, skipping comment.");
    return;
  }

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    per_page: 100,
  });

  const existingComment = comments.find(
    (c) =>
      c.body?.includes(header) &&
      c.user?.type === "Bot" &&
      c.user?.login === "github-actions[bot]",
  );
  // Find the bot's own comments to be safe?
  // For now, header match is standard across this repo.

  // Ensure header is always included for future identification
  const finalBody = body.includes(header) ? body : `${header}\n\n${body}`;

  if (existingComment) {
    console.log(`Updating existing comment ${existingComment.id}...`);
    await github.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingComment.id,
      body: finalBody,
    });
  } else {
    console.log("Creating new comment...");
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body: finalBody,
    });
  }
}
