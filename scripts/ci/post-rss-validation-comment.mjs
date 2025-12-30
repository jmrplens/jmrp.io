import fs from "fs";

export default async ({ github, context }) => {
  let comment = "";

  try {
    if (fs.existsSync("rss-validation.json")) {
      const report = JSON.parse(fs.readFileSync("rss-validation.json", "utf8"));

      const icon = report.valid ? "✅" : "❌";
      const status = report.valid ? "**Passed!**" : "**Validation failed**";

      comment = `### 📡 RSS Feed Validation\n\n${icon} ${status}\n\n`;

      comment += "| Property | Detail |\n";
      comment += "| :--- | :--- |\n";
      comment += `| 📄 File | 
`;
      comment += `| 📦 Size | **${report.size} KB** |\n`;
      comment += `| 📝 Items | **${report.metadata.items}** posts |\n`;

      if (report.metadata.latestItem) {
        comment += `| 🆕 Latest | "${report.metadata.latestItem.title}" |\n`;
      }
      comment += "\n";

      if (report.errors.length > 0 || report.warnings.length > 0) {
        comment +=
          "<details>\n<summary><b>🔍 View Issues & Alerts</b></summary>\n\n";

        if (report.errors.length > 0) {
          comment += "#### ❌ Errors\n";
          report.errors.forEach((e) => (comment += `- ${e}\n`));
        }

        if (report.warnings.length > 0) {
          comment += "\n#### ⚠️ Warnings\n";
          report.warnings.forEach((w) => (comment += `- ${w}\n`));
        }
        comment += "</details>\n\n";
      }

      comment += "#### 🖼️ Visual Verification\n";
      comment +=
        "> A visual preview of the RSS content has been generated. ✨\n";
      comment +=
        "> 📥 **Download `rss-preview` artifact** from the build logs to verify component styles.\n\n";
      comment += `--- \n🔗 [Live RSS Feed](https://jmrp.io/rss.xml)`;
    } else {
      comment =
        "### 📡 RSS Validation\n\n⚠️ **Report file not found.**\n\n> Please check the build logs for details.";
    }
  } catch (e) {
    comment = "### 📡 RSS Validation\n\n❌ **Error processing report.**";
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
