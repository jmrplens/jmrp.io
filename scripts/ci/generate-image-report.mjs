/**
 * Image Optimization Audit
 *
 * This script scans the production 'dist' directory to detect unoptimized images
 * (PNG/JPG) and oversized assets (>500KB). It generates an HTML report
 * to help maintain a lightweight and high-performance site.
 */

import fs from "fs";
import { execSync } from "child_process";

const generateReport = () => {
  /**
   * Helper to find files using shell 'find'
   */
  const findFiles = (pattern) => {
    try {
      const output = execSync(
        `find dist -type f ${pattern} 2>/dev/null || echo ""`,
        { encoding: "utf-8" },
      ).trim();
      return output ? output.split("\n") : [];
    } catch {
      return [];
    }
  };

  /**
   * Helper to find files using regex 'grep'
   */
  const findWithGrep = (pattern) => {
    try {
      const output = execSync(
        `find dist -type f 2>/dev/null | grep -iE "${pattern}" || echo ""`,
        { encoding: "utf-8" },
      ).trim();
      return output ? output.split("\n") : [];
    } catch {
      return [];
    }
  };

  const webp = findFiles('-name "*.webp"');
  const png = findFiles('-name "*.png"');
  const jpg = findWithGrep("\.jpe?g$");

  const getDetails = (list) => {
    return list.map((img) => {
      try {
        const size = execSync(`ls -lh "${img}" | awk '{print $5}'`, {
          encoding: "utf-8",
        }).trim();
        return { path: img.replace("dist/", ""), size };
      } catch {
        return { path: img.replace("dist/", ""), size: "N/A" };
      }
    });
  };

  const data = {
    webp: getDetails(webp),
    png: getDetails(png),
    jpg: getDetails(jpg),
  };

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Image Optimization Report</title>
    <style>
      body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.5; color: #333; max-width: 1000px; margin: 40px auto; padding: 0 20px; }
      h1 { border-bottom: 2px solid #eee; padding-bottom: 10px; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
      .card { background: #f8f9fa; padding: 20px; border-radius: 8px; text-align: center; border: 1px solid #eee; }
      .card h3 { margin: 0; color: #666; font-size: 14px; text-transform: uppercase; }
      .card div { font-size: 32px; font-weight: bold; margin: 10px 0; }
      table { width: 100%; border-collapse: collapse; margin-top: 20px; }
      th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
      th { background: #f8f9fa; }
      .size { font-family: monospace; font-weight: bold; }
      .large { color: #d73a49; }
      code { background: #f1f1f1; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>🖼️ Image Optimization Report</h1>
    <div class="summary">
      <div class="card"><h3>WebP</h3><div>${webp.length}</div>✅ Optimized</div>
      <div class="card"><h3>PNG</h3><div>${png.length}</div>${png.length > 0 ? "⚠️ Legacy" : "✅ None"}</div>
      <div class="card"><h3>JPG</h3><div>${jpg.length}</div>${jpg.length > 0 ? "⚠️ Legacy" : "✅ None"}</div>
    </div>
    
    <h2>All Assets</h2>
    <table>
      <thead>
        <tr><th>Path</th><th>Format</th><th>Size</th></tr>
      </thead>
      <tbody>
        ${[
          ...data.webp.map((i) => ({ ...i, f: "WebP" })),
          ...data.png.map((i) => ({ ...i, f: "PNG" })),
          ...data.jpg.map((i) => ({ ...i, f: "JPG" })),
        ]
          .sort((a, b) => (b.size.includes("M") ? 1 : -1))
          .map(
            (img) => `
          <tr>
            <td><code>${img.path}</code></td>
            <td>${img.f}</td>
            <td class="size ${img.size.includes("K") && parseInt(img.size) > 500 ? "large" : ""}">${img.size}</td>
          </tr>
        `,
          )
          .join("")}
        ${webp.length + png.length + jpg.length === 0 ? '<tr><td colspan="3">No images found in dist/</td></tr>' : ""}
      </tbody>
    </table>
  </body>
  </html>
  `;

  fs.writeFileSync("image-report.html", html);
  console.log("✅ Image report generated at image-report.html");
};

generateReport();
