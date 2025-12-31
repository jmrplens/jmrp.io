import fs from "fs";

export default async ({ github, context }) => {
  const reportPath = "bundle-analysis.json";

  try {
    if (!fs.existsSync(reportPath)) {
      throw new Error("Bundle analysis report not found");
    }

    const stats = JSON.parse(fs.readFileSync(reportPath, "utf8"));

    let commentBody = "### 📦 Bundle Size Analysis\n\n";

    // Overview Table
    commentBody += "| Category | Size | Files |\n";
    commentBody += "| :--- | :--- | :--- |\n";
    commentBody += `| **Total** | **${stats.readableTotalSize}** | **${stats.fileCount}** |\n`;
    commentBody += `| 📜 JS | ${stats.categories.js.readableSize} | ${stats.categories.js.count} |\n`;
    commentBody += `| 🎨 CSS | ${stats.categories.css.readableSize} | ${stats.categories.css.count} |\n`;
    commentBody += `| 📄 HTML | ${stats.categories.html.readableSize} | ${stats.categories.html.count} |\n`;
    commentBody += `| 🖼️ Images | ${stats.categories.image.readableSize} | ${stats.categories.image.count} |\n`;
    commentBody += `| 🔤 Fonts | ${stats.categories.font.readableSize} | ${stats.categories.font.count} |\n\n`;

    // Warnings
    if (stats.warnings.length > 0) {
      commentBody += "#### ⚠️ Large Files Detected\n\n";
      commentBody += "| File | Size | Limit |\n";
      commentBody += "| :--- | :--- | :--- |\n";
      stats.warnings.forEach((w) => {
        commentBody += `| \`${w.file}\` | **${w.size}** | ${w.limit} |\n`;
      });
      commentBody += "\n";
    }

    // Largest Assets Detail
    commentBody +=
      "<details>\n<summary><b>🔎 View Largest Assets</b></summary>\n\n";

    const printCategory = (name, cat) => {
      if (cat.count === 0) return "";
      let output = `**${name}**\n\n`;
      output += "| File | Size |\n";
      output += "| :--- | :--- |\n";
      cat.largestFiles.forEach((f) => {
        const sizeStr =
          f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(2) + " KB";
        output += `| \`${f.path}\` | ${sizeStr} |\n`;
      });
      output += "\n";
      return output;
    };

    commentBody += printCategory("JavaScript", stats.categories.js);
    commentBody += printCategory("CSS", stats.categories.css);
    commentBody += printCategory("Images", stats.categories.image);

    commentBody += "</details>\n";

    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: commentBody,
    });
  } catch (error) {
    console.error(error);
    const errorBody =
      "### 📦 Bundle Size Analysis\n\n⚠️ **Analysis failed**\n\n> " +
      error.message;
    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: errorBody,
    });
  }
};
