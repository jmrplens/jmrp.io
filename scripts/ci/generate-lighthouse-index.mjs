import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "lh-deploy";
const manifestPath = path.join(deployDir, "manifest.json");
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found at ${manifestPath}`);
  process.exit(1);
}

import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "lh-deploy";
const manifestPath = path.join(deployDir, "manifest.json");
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found at ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  manifest = JSON.parse(manifestContent);
} catch (error) {
  console.error(
    `Failed to parse manifest JSON at ${manifestPath}: ${error.message}`,
  );
  process.exit(1);
}

// Group by URL to handle multiple runs if needed, though usually we display representative runs.
// LHCI manifest usually has one entry per run. If 'isRepresentativeRun' is true, we prioritize it?
// The manifest structure is array of objects.
// Let's just list all representative runs or unique URLs.

const reports = manifest.filter((entry) => entry.isRepresentativeRun);

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const listItems =
  reports.length === 0
    ? `<li><div style="text-align: center; color: #666;">No reports found.</div></li>`
    : reports
        .map((report) => {
          // report.htmlPath is absolute path from LHCI. We need relative filename.
          const filename = path.basename(report.htmlPath);
          let urlDisplay = report.url;

          try {
            const parsedUrl = new URL(report.url);
            if (parsedUrl.hostname === "localhost") {
              urlDisplay = parsedUrl.pathname || "/";
            }
          } catch {
            // Keep original URL if parsing fails
          }

          // Calculate average score if available (summary object)
          // manifest entries might look like: { url, isRepresentativeRun, htmlPath, jsonPath, summary: { performance: 0.9, ... } }
          let scoreBadge = "";
          if (report.summary) {
            const scores = Object.values(report.summary);
            if (scores.length > 0) {
              const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
              const scoreClass =
                avg >= 0.9 ? "pass" : avg >= 0.5 ? "avg" : "fail";
              scoreBadge = `<span class="score ${scoreClass}">Avg: ${Math.round(avg * 100)}%</span>`;
            }
          }

          return `<li>
                <a href="${escapeHtml(filename)}">
                    <span>${escapeHtml(urlDisplay)}</span>
                    ${scoreBadge}
                    <div class="url">${escapeHtml(report.url)}</div>
                </a>
            </li>`;
        })
        .join("\n");

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Reports Index</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
        h1 { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
        ul { list-style: none; padding: 0; }
        li { margin: 0.5rem 0; padding: 1rem; background: #f4f4f5; border-radius: 8px; }
        li:hover { background: #e4e4e7; }
        a { text-decoration: none; color: #000; font-weight: 500; display: block; }
        .url { font-family: monospace; color: #666; font-size: 0.9em; }
        .score { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 4px; color: white; font-weight: bold; font-size: 0.8em; margin-left: 10px;}
        .score.pass { background-color: #0cce6b; }
        .score.avg { background-color: #ffa400; }
        .score.fail { background-color: #ff4e42; }
    </style>
</head>
<body>
    <h1>🔭 Lighthouse Reports</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    <ul>
        ${listItems}
    </ul>
</body>
</html>
`;

fs.writeFileSync(indexPath, htmlContent);
console.log(
  `Generated index.html at ${indexPath} with ${reports.length} reports.`,
);
