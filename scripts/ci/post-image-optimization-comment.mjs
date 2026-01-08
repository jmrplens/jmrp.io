/**
 * GitHub Comment Poster: Image Optimization
 *
 * Integration script for GitHub Actions.
 * Summarizes the image optimization status (WebP coverage) and flags
 * any oversized assets (>500KB) directly in the PR.
 */

import { execSync } from "node:child_process";

/**
 * Posts a comment on the GitHub Pull Request with the image optimization analysis report.
 * It checks for WebP conversion coverage and flags large image files.
 *
 * @param {object} params - The GitHub Action context parameters.
 * @param {object} params.github - The authenticated Octokit client.
 * @param {object} params.context - The GitHub Action context object.
 * @returns {Promise<void>} Resolves when the comment is successfully created.
 */
export default async function postImageOptimizationComment({
  github,
  context,
}) {
  const getCount = (pattern) => {
    try {
      return execSync(`find dist -type f ${pattern} 2>/dev/null | wc -l`, {
        encoding: "utf8",
      }).trim();
    } catch {
      return "0";
    }
  };

  const webpCount = getCount('-name "*.webp"');
  const pngCount = getCount('-name "*.png"');
  const jpgCount = execSync(
    'find dist -type f | grep -iE ".jpe?g$" | wc -l || echo "0"',
    { encoding: "utf8" },
  ).trim();

  const surgeUrl = process.env.SURGE_URL;
  let largeImagesOutput = "";
  let hasLargeImages = false;

  try {
    const largeImagesRaw = execSync(
      'find dist -type f -size +500k 2>/dev/null | grep -iE ".(webp|png|jpe?g)$" || echo ""',
      { encoding: "utf8" },
    ).trim();

    if (largeImagesRaw) {
      const lines = largeImagesRaw.split("\n").filter(Boolean);
      if (lines.length > 0) {
        hasLargeImages = true;
        largeImagesOutput =
          "\n<details>\n<summary><b>⚠️ View Large Images (>500KB)</b></summary>\n\n| Image Path | Size |\n| :--- | :--- |\n";

        const imageDetails = lines.map((img) => {
          const size = execSync(`ls -lh "${img}" | awk '{print $5}'`, {
            encoding: "utf8",
          }).trim();
          return "| `" + img.replace("dist/", "") + "` | **" + size + "** |";
        });

        largeImagesOutput += imageDetails.join("\n") + "\n</details>\n";
      }
    }
  } catch {
    // Silent
  }

  const statusIcon = hasLargeImages ? "⚠️" : "✅";
  const statusText = hasLargeImages
    ? "**Action Recommended**"
    : "**Fully Optimized!**";

  let comment = `### 🖼️ Image Optimization Analysis\n\n${statusIcon} ${statusText}\n\n`;
  comment += "| Format | Count | Status |\n";
  comment += "| :--- | :---: | :--- |\n";
  comment += `| 💎 **WebP** | **${webpCount}** | Optimized ✅ |\n`;
  comment += `| 🖼️ **PNG** | **${pngCount}** | Legacy |\n`;
  comment += `| 📸 **JPG/JPEG** | **${jpgCount}** | Legacy |\n`;

  if (surgeUrl) {
    comment += `| 🌐 Full Report | [**Open Image Audit**](https://${surgeUrl}) 🚀 |\n`;
  }

  comment += largeImagesOutput;
  comment += `\n> 📊 [View Build Logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
}
