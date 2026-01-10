/**
 * GitHub Comment Poster: Bundle Size
 *
 * Integration script for GitHub Actions.
 * Reads 'bundle-analysis.json' and posts a categorized summary of the
 * build assets size as a PR comment, including a list of the largest files.
 */

import fs from "node:fs";

/**
 * Posts a comment on the GitHub Pull Request with the bundle size analysis report.
 *
 * @param {{ github: { rest: { issues: { createComment: Function } } }, context: { issue: { number: number }, repo: { owner: string, repo: string } } }} params - The GitHub Action context parameters.
 * @returns {Promise<void>} Resolves when the comment is successfully created.
 */
export default async function postBundleSizeComment({ github, context }) {
  const reportPath = "bundle-analysis.json";

  try {
    if (!fs.existsSync(reportPath)) {
      throw new Error("Bundle analysis report not found");
    }

    const stats = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

    let commentBody = "### 📦 Bundle Size Analysis\n\n";

    // Overview Table
    commentBody += "| Category | Size | Files |\n";
    commentBody += "| :--- | :--- | :--- |\n";
    commentBody += `| **Total** | **${stats.readableTotalSize}** | **${stats.fileCount}** |\n`;
    commentBody += `| 📜 JS | ${stats.categories.js.readableSize} | ${stats.categories.js.count} |\n`;
    commentBody += `| 🎨 CSS | ${stats.categories.css.readableSize} | ${stats.categories.css.count} |\n`;
    commentBody += `| 📄 HTML | ${stats.categories.html.readableSize} | ${stats.categories.html.count} |\n`;
    commentBody += `| 🖼️ Images | ${stats.categories.image.readableSize} | ${stats.categories.image.count} |\n`;
    commentBody += `| 📑 PDFs | ${stats.categories.pdf.readableSize} | ${stats.categories.pdf.count} |\n`;
    commentBody += `| 🔤 Fonts | ${stats.categories.font.readableSize} | ${stats.categories.font.count} |\n`;
    if (stats.categories.other.count > 0) {
      commentBody += `| 📦 Other | ${stats.categories.other.readableSize} | ${stats.categories.other.count} |\n`;
    }
    commentBody += "\n";

    // Largest Assets Detail
    commentBody +=
      "<details>\n<summary><b>🔎 View Largest Assets</b></summary>\n\n";

    const printCategory = (name, cat) => {
      if (cat.count === 0) return "";
      let output = `**${name}**\n\n`;
      output += "| File | Size |\n";
      output += "| :--- | :--- |\n";
      for (const f of cat.largestFiles) {
        const sizeStr =
          f.size < 1024 ? f.size + " B" : (f.size / 1024).toFixed(2) + " KB";
        output += "| `" + f.path + "` | " + sizeStr + " |\n";
      }
      output += "\n";
      return output;
    };

    commentBody += printCategory("JavaScript", stats.categories.js);
    commentBody += printCategory("CSS", stats.categories.css);
    commentBody += printCategory("Images", stats.categories.image);
    commentBody += printCategory("PDFs", stats.categories.pdf);
    commentBody += printCategory("Other", stats.categories.other);

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
}
