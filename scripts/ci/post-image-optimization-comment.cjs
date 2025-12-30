const { execSync } = require("child_process");

module.exports = async ({ github, context }) => {
  // Using grep to avoid parenthesis escaping issues in shell
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
  try {
    const largeImages = execSync(
      'find dist -type f -size +500k 2>/dev/null | grep -iE "\.(webp|png|jpe?g)$" || echo ""',
      {
        encoding: "utf-8",
      },
    ).trim();

    if (largeImages) {
      largeImagesOutput =
        "\n\n⚠️ **Large images detected (>500KB)**\n\nConsider further optimization for:\n";
      const lines = largeImages.split("\n");
      lines.forEach((img) => {
        if (img) {
          // Correctly escaped awk command
          const size = execSync("ls -lh '" + img + "' | awk '{print $5}'", {
            encoding: "utf-8",
          }).trim();
          largeImagesOutput +=
            "- `" + img.replace("dist/", "") + "` (" + size + ")\n";
        }
      });
    } else {
      largeImagesOutput =
        "\n\n✅ **No large images found** - all images are under 500KB";
    }
  } catch (e) {
    largeImagesOutput = "\n\n✅ **No large images found**";
  }

  const comment =
    "## 🖼️ Image Optimization Analysis\n\n**Format Distribution:**\n- WebP: " +
    webpCount +
    " images ✅\n- PNG: " +
    pngCount +
    " images\n- JPG/JPEG: " +
    jpgCount +
    " images" +
    largeImagesOutput +
    "\n\n[View full report](https://github.com/" +
    context.repo.owner +
    "/" +
    context.repo.repo +
    "/actions/runs/" +
    context.runId +
    ")";

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
