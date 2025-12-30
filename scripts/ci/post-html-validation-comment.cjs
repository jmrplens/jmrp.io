const fs = require("fs");

module.exports = async ({ github, context }) => {
  let comment = "";

  try {
    if (fs.existsSync("html-validation.json")) {
      let rawContent = fs.readFileSync("html-validation.json", "utf8").trim();

      if (!rawContent || rawContent === "undefined") {
        if (fs.existsSync("html-errors.log")) {
          const errors = fs.readFileSync("html-errors.log", "utf8");
          comment = `## ⚠️ HTML5 Validation\n\n**Validation failed to run correctly.**\n\nError log snippet:\n\
${errors.slice(0, 1000)}\n`;
        } else {
          comment = `## ⚠️ HTML5 Validation\n\nReport is empty or undefined. Check build logs.`;
        }
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
          const status = isSuccess ? "Passed" : "Failed";

          comment = `## ${icon} HTML5 Validation\n\n`;
          comment += `**Status: ${status}**\n`;
          comment += `- **Files Checked:** All generated HTML\n`;
          comment += `- **Errors:** ${totalErrors}\n`;
          comment += `- **Warnings:** ${totalWarnings}\n\n`;

          if (filesWithErrors.length > 0) {
            comment += `### ⚠️ Issues Found (Top 5 files)\n\n`;
            filesWithErrors.slice(0, 5).forEach((f) => {
              const fileName = f.filePath.replace("dist/", "").split("/").pop();
              comment += `**${fileName}**\n`;
              f.messages.forEach((m) => {
                const severity = m.severity === 2 ? "🔴" : "⚠️";
                comment += `- ${severity} [${m.ruleId}] ${m.message} (Line ${m.line})\n`;
              });
              comment += `\n`;
            });

            if (filesWithErrors.length > 5) {
              comment += `...and ${filesWithErrors.length - 5} more files with issues.\n`;
            }
          } else {
            comment += `All pages are valid HTML5 compliant.\n`;
          }
        } catch (parseError) {
          comment = `## ⚠️ HTML5 Validation\n\n**Error parsing report JSON**\n\nRaw snippet:\n\
${rawContent.slice(0, 500)}\n`;
        }
      }
    } else {
      comment = `## ⚠️ HTML5 Validation\n\nReport file not found. Check build logs.`;
    }
  } catch (e) {
    console.error(e);
    comment = `## ⚠️ HTML5 Validation\n\nError processing report. Check build logs.`;
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
