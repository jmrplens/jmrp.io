import { execSync } from "child_process";

export default async ({ github, context }) => {
  const getCount = (pattern) => {
    try {
      return execSync(`find dist -type f ${pattern} 2>/dev/null | wc -l`, {
        encoding: "utf-8",
      }).trim();
    } catch {
      return "0";
    }
  };

  const webpCount = getCount('-name "*.webp"');
  const pngCount = getCount('-name "*.png"');
  const jpgCount = execSync(
    'find dist -type f | grep -iE "\.jpe?g$" | wc -l || echo "0"',
    { encoding: "utf-8" },
  ).trim();

  let largeImagesOutput = "";
  let hasLargeImages = false;

  try {
    const largeImagesRaw = execSync(
      'find dist -type f -size +500k 2>/dev/null | grep -iE "\.(webp|png|jpe?g)$" || echo ""',
      { encoding: "utf-8" },
    ).trim();

    if (largeImagesRaw) {
      const lines = largeImagesRaw.split("\n").filter(Boolean);
      if (lines.length > 0) {
        hasLargeImages = true;
        largeImagesOutput =
          "\n<details>\n<summary><b>⚠️ View Large Images (>500KB)</b></summary>\n\n| Image Path | Size |\n| :--- | :--- |\n";

        const imageDetails = lines.map((img) => {
          const size = execSync(`ls -lh "${img}" | awk '{print $5}'`, {
            encoding: "utf-8",
          }).trim();
          return "| `" + img.replace("dist/", "") + "` | **" + size + "** |";
        });

        largeImagesOutput += imageDetails.join("\n") + "\n</details>\n";
      }
    }
  } catch {
    // Large image check failed or no images found
  }

  const statusIcon = hasLargeImages ? "⚠️" : "✅";
  const statusText = hasLargeImages
    ? "**Action Recommended**"
    : "**Fully Optimized!**";

  const comment = `### 🖼️ Image Optimization Analysis

${statusIcon} ${statusText}

| Format | Count | Status |
| :--- | :---: | :--- |
| 💎 **WebP** | **${webpCount}** | Optimized ✅ |
| 🖼️ **PNG** | **${pngCount}** | Legacy |
| 📸 **JPG/JPEG** | **${jpgCount}** | Legacy |
${largeImagesOutput}
> 📊 [View Full Build Report](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment,
  });
};
