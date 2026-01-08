/**
 * GitHub Comment Poster: HTML5 Validation
 *
 * Integration script for GitHub Actions.
 * Reads 'html-validation.json' and posts a summary of HTML5 compliance
 * for all generated pages as a PR comment.
 */

import fs from "node:fs";

/**
 * Builds the summary table for validation metrics
 */
function buildSummaryTable(totalErrors, totalWarnings, surgeUrl) {
  let table = "| Metric | Value |\n";
  table += "| :--- | :--- |\n";
  table += "| 📄 Files Checked | **All generated HTML** |\n";
  table += `| 🔴 Errors | **${totalErrors}** |\n`;
  table += `| ⚠️ Warnings | **${totalWarnings}** |\n`;

  if (surgeUrl) {
    table += `| 🌐 Full Report | [**Open Interactive Report**](https://${surgeUrl}) 🚀 |\n`;
  }

  return table + "\n";
}

/**
 * Builds the detailed issues section
 */
function buildIssuesSection(filesWithErrors) {
  if (filesWithErrors.length === 0) {
    return "> All pages are valid HTML5 compliant. ✨\n";
  }

  let section =
    "<details>\n<summary><b>🔍 View Detailed Issues (Top 10)</b></summary>\n\n";

  for (const f of filesWithErrors.slice(0, 10)) {
    const fileName = f.filePath.replace("dist/", "").split("/").pop();
    section += `#### 📄 **${fileName}**\n`;
    for (const m of f.messages) {
      const severity = m.severity === 2 ? "🔴" : "⚠️";
      section += `- ${severity} [${m.ruleId}] ${m.message} (Line ${m.line})\n`;
    }
    section += "\n---\n";
  }

  if (filesWithErrors.length > 10) {
    section += `\n*...and ${filesWithErrors.length - 10} more files with issues (see build logs for full list).* \n`;
  }

  section += "</details>\n\n";
  return section;
}

/**
 * Builds the complete comment from the validation report
 */
function buildCommentFromReport(report, surgeUrl) {
  const filesWithErrors = report.filter((f) => f.messages.length > 0);
  const totalErrors = filesWithErrors.reduce(
    (acc, f) => acc + f.messages.filter((m) => m.severity === 2).length,
    0,
  );
  const totalWarnings = filesWithErrors.reduce(
    (acc, f) => acc + f.messages.filter((m) => m.severity === 1).length,
    0,
  );

  const isSuccess = totalErrors === 0;
  const icon = isSuccess ? "✅" : "❌";
  const status = isSuccess ? "**Passed!**" : "**Errors found**";

  let comment = `### ${icon} HTML5 Validation\n\n${status}\n\n`;
  comment += buildSummaryTable(totalErrors, totalWarnings, surgeUrl);
  comment += buildIssuesSection(filesWithErrors);

  return comment;
}

/**
 * Posts a comment on the GitHub Pull Request with the HTML5 validation report.
 *
 * @param {object} params - The GitHub Action context parameters.
 * @param {object} params.github - The authenticated Octokit client.
 * @param {object} params.context - The GitHub Action context object.
 * @returns {Promise<void>} Resolves when the comment is successfully created.
 */
export default async function postHtmlValidationComment({ github, context }) {
  let comment;
  const surgeUrl = process.env.SURGE_URL;

  try {
    if (fs.existsSync("html-validation.json")) {
      const rawContent = fs.readFileSync("html-validation.json", "utf8").trim();

      if (!rawContent || rawContent === "undefined") {
        comment =
          "### ⚠️ HTML5 Validation\n\n> Report is empty or undefined. Check build logs.";
      } else {
        try {
          const report = JSON.parse(rawContent);
          comment = buildCommentFromReport(report, surgeUrl);
        } catch (parseError) {
          comment =
            "### ⚠️ HTML5 Validation\n\n❌ **Error parsing report JSON**";
          console.error("HTML validation parse error:", parseError);
        }
      }
    } else {
      comment =
        "### ⚠️ HTML5 Validation\n\n> ⚠️ Report file not found. Check build logs.";
    }
  } catch (error) {
    comment = "### ⚠️ HTML5 Validation\n\n> ❌ Error processing report.";
    console.error("HTML validation comment error:", error);
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
}
