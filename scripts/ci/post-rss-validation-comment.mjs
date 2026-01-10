/**
 * GitHub Comment Poster: RSS Validation
 *
 * Integration script for GitHub Actions.
 * Reads 'rss-validation.json' and posts a summary of the RSS feed status,
 * including its size, item count, and any specification violations.
 */

import fs from "node:fs";

const HEADER = "### 📡 RSS Feed Validation";

/**
 * Builds the summary table for the RSS report
 */
function buildSummaryTable(report, surgeUrl) {
  let table = "| Property | Detail |\n";
  table += "| :--- | :--- |\n";
  table += "| 📄 File | `rss.xml` |\n";
  table += `| 📦 Size | **${report.size} KB** |\n`;
  table += `| 📝 Items | **${report.metadata.items}** posts |\n`;

  if (report.metadata.latestItem) {
    table += `| 🆕 Latest | "${report.metadata.latestItem.title}" |\n`;
  }

  if (surgeUrl) {
    table += `| 🌐 Full Preview | [**Open Live RSS Preview**](https://${surgeUrl}) 🚀 |\n`;
  }

  return table + "\n";
}

/**
 * Builds the issues section if there are errors or warnings
 */
function buildIssuesSection(report) {
  if (report.errors.length === 0 && report.warnings.length === 0) {
    return "";
  }

  let section =
    "<details>\n<summary><b>🔍 View Issues & Alerts</b></summary>\n\n";

  if (report.errors.length > 0) {
    section += "#### ❌ Errors\n";
    for (const e of report.errors) section += `- ${e}\n`;
  }

  if (report.warnings.length > 0) {
    section += "\n#### ⚠️ Warnings\n";
    for (const w of report.warnings) section += `- ${w}\n`;
  }

  return section + "</details>\n\n";
}

/**
 * Builds the complete comment from the RSS validation report
 */
function buildCommentFromReport(report, surgeUrl) {
  const icon = report.valid ? "✅" : "❌";
  const status = report.valid ? "**Passed!**" : "**Validation failed**";

  let comment = `${HEADER}\n\n${icon} ${status}\n\n`;
  comment += buildSummaryTable(report, surgeUrl);
  comment += buildIssuesSection(report);
  comment += "---\n";

  return comment;
}

/**
 * Posts a comment on the GitHub Pull Request with the RSS feed validation report.
 *
 * @param {object} params - The GitHub Action context parameters.
 * @param {object} params.github - The authenticated Octokit client.
 * @param {object} params.context - The GitHub Action context object.
 * @returns {Promise<void>} Resolves when the comment is successfully created or updated.
 */
export default async function postRssValidationComment({ github, context }) {
  let comment;

  try {
    if (fs.existsSync("rss-validation.json")) {
      const report = JSON.parse(
        fs.readFileSync("rss-validation.json", "utf-8"),
      );
      const surgeUrl = process.env.SURGE_URL;
      comment = buildCommentFromReport(report, surgeUrl);
    } else {
      comment = `${HEADER}\n\n⚠️ **Report file not found.**\n\n> Please check the build logs for details.`;
    }
  } catch (error) {
    comment = `${HEADER}\n\n❌ **Error processing report.**`;
    console.error("RSS validation comment error:", error);
  }

  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  const existingComment = comments.find((c) => c.body?.includes(HEADER));

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
}
