/**
 * Image Optimization Audit
 *
 * This script scans the production 'dist' directory to detect unoptimized images
 * (PNG/JPG) and oversized assets (>500KB). It generates an HTML report
 * to help maintain a lightweight and high-performance site.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * Scans the 'dist' directory and generates an HTML report of image optimizations.
 */
const generateReport = () => {
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
  const jpg = findWithGrep(".jpe?g$");

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

  const totalImages = webp.length + png.length + jpg.length;
  const legacyImages = png.length + jpg.length;
  const optimizationScore =
    totalImages > 0 ? Math.round((webp.length / totalImages) * 100) : 100;

  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Optimization Report</title>
    <style>
        :root {
            --bg-body: #f8f9fa;
            --bg-card: #ffffff;
            --text-main: #212529;
            --text-muted: #6c757d;
            --border-color: #dee2e6;
            --primary: #0d6efd;
            --success: #198754;
            --warning: #ffc107;
            --danger: #dc3545;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-body: #121212;
                --bg-card: #1e1e1e;
                --text-main: #e0e0e0;
                --text-muted: #a0a0a0;
                --border-color: #333333;
                --primary: #6ea8fe;
                --shadow: 0 4px 6px rgba(0,0,0,0.3);
            }
        }

        * { box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: var(--bg-body);
            color: var(--text-main);
            margin: 0;
            padding: 2rem 1rem;
            line-height: 1.5;
        }

        .container { max-width: 1000px; margin: 0 auto; }
        
        header { text-align: center; margin-bottom: 3rem; }
        h1 { margin: 0 0 0.5rem 0; font-weight: 300; letter-spacing: -0.5px; }
        .subtitle { color: var(--text-muted); font-size: 0.9rem; }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .card {
            background: var(--bg-card);
            border-radius: 12px;
            padding: 1.5rem;
            box-shadow: var(--shadow);
            border: 1px solid var(--border-color);
            text-align: center;
        }

        .card-label { text-transform: uppercase; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); letter-spacing: 1px; }
        .card-value { font-size: 2.5rem; font-weight: 800; margin: 0.5rem 0; color: var(--text-main); }
        .card-footer { font-size: 0.85rem; display: inline-block; padding: 0.25rem 0.75rem; border-radius: 99px; font-weight: 500; }
        
        .bg-success-soft { background-color: rgba(25, 135, 84, 0.1); color: var(--success); }
        .bg-warning-soft { background-color: rgba(255, 193, 7, 0.1); color: #856404; }
        .bg-danger-soft { background-color: rgba(220, 53, 69, 0.1); color: var(--danger); }

        .section-title { font-size: 1.2rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid var(--border-color); }

        table { width: 100%; border-collapse: collapse; background: var(--bg-card); border-radius: 12px; overflow: hidden; box-shadow: var(--shadow); }
        th, td { padding: 1rem; text-align: left; border-bottom: 1px solid var(--border-color); }
        th { background-color: rgba(128,128,128,0.05); font-weight: 600; font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); }
        td { font-size: 0.9rem; }
        tr:last-child td { border-bottom: none; }
        
        .path-cell { font-family: monospace; color: var(--primary); }
        .size-cell { font-family: monospace; font-weight: 600; }
        
        .badge { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
        .badge-webp { background-color: rgba(25, 135, 84, 0.1); color: var(--success); }
        .badge-legacy { background-color: rgba(255, 193, 7, 0.15); color: #856404; }
        
        .size-large { color: var(--danger); }

        @media (max-width: 600px) {
            .summary-grid { grid-template-columns: 1fr; }
            th, td { padding: 0.75rem; }
            .path-cell { font-size: 0.8rem; word-break: break-all; }
        }
    </style>
  </head>
  <body>
    <div class="container">
        <header>
            <h1>🖼️ Image Optimization Report</h1>
            <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
        </header>

        <div class="summary-grid">
            <div class="card">
                <div class="card-label">Optimization Score</div>
                <div class="card-value">${optimizationScore}%</div>
                <div class="card-footer ${optimizationScore === 100 ? "bg-success-soft" : "bg-warning-soft"}">
                    ${optimizationScore === 100 ? "Perfect!" : "Needs Work"}
                </div>
            </div>
            <div class="card">
                <div class="card-label">WebP Images</div>
                <div class="card-value">${webp.length}</div>
                <div class="card-footer bg-success-soft">Optimized Format</div>
            </div>
            <div class="card">
                <div class="card-label">Legacy Images</div>
                <div class="card-value">${legacyImages}</div>
                <div class="card-footer ${legacyImages === 0 ? "bg-success-soft" : "bg-danger-soft"}">
                    ${legacyImages === 0 ? "None Found" : "PNG / JPG"}
                </div>
            </div>
        </div>
    
        <h2 class="section-title">Asset Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Path</th>
                    <th>Format</th>
                    <th>Size</th>
                </tr>
            </thead>
            <tbody>
                ${[
                  ...data.webp.map((i) => ({ ...i, f: "WebP" })),
                  ...data.png.map((i) => ({ ...i, f: "PNG" })),
                  ...data.jpg.map((i) => ({ ...i, f: "JPG" })),
                ]
                  .sort((_, b) => (b.size.includes("M") ? 1 : -1))
                  .map(
                    (img) => `
                  <tr>
                    <td class="path-cell">${img.path}</td>
                    <td><span class="badge ${img.f === "WebP" ? "badge-webp" : "badge-legacy"}">${img.f}</span></td>
                    <td class="size-cell ${img.size.includes("K") && Number.parseInt(img.size) > 500 ? "size-large" : ""}"> ${img.size}</td>
                  </tr>
                `,
                  )
                  .join("")}
                ${totalImages === 0 ? '<tr><td colspan="3" style="text-align:center; padding: 2rem;">No images found in dist/</td></tr>' : ""}
            </tbody>
        </table>
    </div>
  </body>
  </html>
  `;

  fs.writeFileSync("image-report.html", html);
  console.log("✅ Image report generated at image-report.html");
};

generateReport();
