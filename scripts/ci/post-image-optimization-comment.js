const { execSync } = require('child_process');

module.exports = async ({ github, context }) => {
  // Count images
  const webpCount = execSync('find dist -type f -name "*.webp" 2>/dev/null | wc -l || echo "0"', { encoding: 'utf-8' }).trim();
  const pngCount = execSync('find dist -type f -name "*.png" 2>/dev/null | wc -l || echo "0"', { encoding: 'utf-8' }).trim();
  const jpgCount = execSync('find dist -type f \( -name "*.jpg" -o -name "*.jpeg" \) 2>/dev/null | wc -l || echo "0"', { encoding: 'utf-8' }).trim();

  // Check for large images
  let largeImagesOutput = '';
  try {
    const largeImages = execSync('find dist -type f \( -name "*.webp" -o -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) -size +500k 2>/dev/null || echo ""', { encoding: 'utf-8' }).trim();
    if (largeImages) {
      largeImagesOutput = '\n\n⚠️ **Large images detected (>500KB)**\n\nConsider further optimization for:\n';
      const lines = largeImages.split('\n');
      lines.forEach(img => {
        if (img) {
          const size = execSync(`ls -lh "${img}" | awk '{print $5}'`, { encoding: 'utf-8' }).trim();
          largeImagesOutput += `- `${img.replace('dist/', '')}` (${size})\n`;
        }
      });
    } else {
      largeImagesOutput = '\n\n✅ **No large images found** - all images are under 500KB';
    }
  } catch (e) {
    largeImagesOutput = '\n\n✅ **No large images found**';
  }

  const comment = `## 🖼️ Image Optimization Analysis

  **Format Distribution:**
  - WebP: ${webpCount} images ✅
  - PNG: ${pngCount} images
  - JPG/JPEG: ${jpgCount} images
  ${largeImagesOutput}

  [View full report](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

  await github.rest.issues.createComment({
    issue_number: context.issue.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: comment
  });
};
