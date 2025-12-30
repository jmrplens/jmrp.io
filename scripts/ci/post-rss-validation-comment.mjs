import fs from "fs";

export default async ({ github, context }) => {
  let comment = "";

  try {
    if (fs.existsSync("rss-validation.json")) {
      const report = JSON.parse(fs.readFileSync("rss-validation.json", "utf8"));

      const icon = report.valid ? "✅" : "❌";
      const status = report.valid ? "Valid" : "Failed";

      comment = "## 📡 RSS Feed Validation\n\n";
      comment += "**Status: " + icon + " " + status + "**\n\n";

      comment += "**Feed Details:**\n";
      comment += "- **File:** `rss.xml` (" + report.size + " KB)\n";
      comment += "- **Items:** " + report.metadata.items + " posts\n";

      if (report.metadata.latestItem) {
        comment +=
          '- **Latest:** "' +
          report.metadata.latestItem.title +
          '" (' +
          report.metadata.latestItem.date +
          ")\n";
      }

      if (report.errors.length > 0) {
        comment += "\n### ❌ Errors\n";
        report.errors.forEach((e) => (comment += "- " + e + "\n"));
      }

      if (report.warnings.length > 0) {
        comment += "\n### ⚠️ Warnings\n";
        report.warnings.forEach((w) => (comment += "- " + w + "\n"));
      }

      comment += "\n### 🖼️ Visual Preview\n";
      comment += "A visual preview of the RSS content has been generated.\n";
      comment += "📥 **Download `rss-preview` artifact** to verify styles.\n\n";
      comment += "[View Feed](https://jmrp.io/rss.xml)";
    } else {
      comment = "## 📡 RSS Validation\n\n⚠️ Report file not found.";
    }
  } catch (e) {
    comment = "## 📡 RSS Validation\n\n⚠️ Error processing report.";
  }

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
