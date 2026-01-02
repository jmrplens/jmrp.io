/**
 * GitHub Comment Poster: HTML5 Validation
 *
 * Integration script for GitHub Actions.
 * Reads 'html-validation.json' and posts a summary of HTML5 compliance
 * for all generated pages as a PR comment.
 */

import fs from "node:fs";

export default async ({ github, context }) => {
  let comment = "";
  const surgeUrl = process.env.SURGE_URL;

  try {
    if (fs.existsSync("html-validation.json")) {
      let rawContent = fs.readFileSync("html-validation.json", "utf8").trim();

      if (!rawContent || rawContent === "undefined") {
        comment =
          "### ⚠️ HTML5 Validation\n\n> Report is empty or undefined. Check build logs.";
      } else {
        try {
          const report = JSON.parse(rawContent);
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

          comment = `### ${icon} HTML5 Validation\n\n${status}\n\n`;
          comment += "| Metric | Value |\n";
          comment += "| :--- | :--- |\n";
          comment += "| 📄 Files Checked | **All generated HTML** |\n";
          comment += `| 🔴 Errors | **${totalErrors}** |\n`;
          comment += `| ⚠️ Warnings | **${totalWarnings}** |\n`;

          if (surgeUrl) {
            comment += `| 🌐 Full Report | [**Open Interactive Report**](https://${surgeUrl}) 🚀 |\n`;
          }
          comment += "\n";

          if (filesWithErrors.length > 0) {
            comment +=
              "<details>\n<summary><b>🔍 View Detailed Issues (Top 10)</b></summary>\n\n";
            filesWithErrors.slice(0, 10).forEach((f) => {
              const fileName = f.filePath.replace("dist/", "").split("/").pop();
              comment += `#### 📄 **${fileName}**\n`;
              f.messages.forEach((m) => {
                const severity = m.severity === 2 ? "🔴" : "⚠️";
                comment += `- ${severity} [${m.ruleId}] ${m.message} (Line ${m.line})\n`;
              });
              comment += "\n---\n";
            });

            if (filesWithErrors.length > 10) {
              comment += `\n*...and ${filesWithErrors.length - 10} more files with issues (see build logs for full list).* \n`;
            }
            comment += "</details>\n\n";
          } else {
            comment += "> All pages are valid HTML5 compliant. ✨\n";
          }
        } catch (parseError) {
          comment =
            "### ⚠️ HTML5 Validation\n\n❌ **Error parsing report JSON**";
        }
      }
    } else {
      comment =
        "### ⚠️ HTML5 Validation\n\n> ⚠️ Report file not found. Check build logs.";
    }
  } catch (e) {
    comment = "### ⚠️ HTML5 Validation\n\n> ❌ Error processing report.";
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
