import { execSync } from "child_process";

export default async ({ github, context }) => {
  const webpCount = execSync(
    'find dist -type f -name "*.webp" 2>/dev/null | wc -l || echo "0"',
    { encoding: "utf-8" },
  ).trim();
  const pngCount = execSync(
    'find dist -type f -name "*.png" 2>/dev/null | wc -l || echo "0"',
    { encoding: "utf-8" },
  ).trim();
  const jpgCount = execSync(
    'find dist -type f | grep -iE "\.jpe?g$" | wc -l || echo "0"',
    { encoding: "utf-8" },
  ).trim();

  let largeImagesOutput = "";
  let hasLargeImages = false;

  try {
    const largeImages = execSync(
      'find dist -type f -size +500k 2>/dev/null | grep -iE "\.(webp|png|jpe?g)$" || echo ""',
      { encoding: "utf-8" },
    ).trim();
    if (largeImages) {
      hasLargeImages = true;
      largeImagesOutput =
        "\n<details>\n<summary><b>⚠️ View Large Images (>500KB)</b></summary>\n\n| Image Path | Size |\n| :--- | :--- |\n";
      const lines = largeImages.split("\n");
      lines.forEach((img) => {
        if (img) {
          const size = execSync(`ls -lh "${img}" | awk '{print $5}'`, {
            encoding: "utf-8",
          }).trim();
          largeImagesOutput += `| ${img.replace("dist/", "")} | **${size}** |\n`;
        }
      });
      largeImagesOutput += "\n</details>\n";
    }
  } catch (e) {
    // Silent catch
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

  comment += largeImagesOutput;
  comment += `\n> 📊 [View Full Build Report](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
