/**
 * Generate Accessibility Reports Dashboard
 *
 * Scans a directory for Axe HTML reports, groups them by Theme,
 * and generates a unified HTML dashboard index.
 *
 * Usage: node generate-accessibility-index.mjs <deploy-dir>
 */

import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "a11y-deploy";
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(deployDir)) {
  console.error(`Deploy directory not found at ${deployDir}`);
  process.exit(1);
}

// Helper: Escape HTML characters
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Helper: Scan for all HTML reports
function findReports(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findReports(filePath, fileList);
    } else if (file.endsWith(".html") && file !== "index.html") {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const htmlFiles = findReports(deployDir);
const reports = [];

htmlFiles.forEach((filePath) => {
  const lowerPath = filePath.toLowerCase();
  let theme = "unknown";
  
  // Prioritize checks to avoid ambiguity
  if (lowerPath.includes("/light/") || lowerPath.includes("\\light\\")) {
    theme = "light";
  } else if (lowerPath.includes("/dark/") || lowerPath.includes("\\dark\\")) {
    theme = "dark";
  }

  reports.push({
    filePath,
    fileName: path.basename(filePath),
    relativePath: path.relative(deployDir, filePath),
    theme: theme,
  });
});

const grouped = { light: [], dark: [], unknown: [] };
reports.forEach(r => {
    if (grouped[r.theme]) grouped[r.theme].push(r);
    else grouped.unknown.push(r);
});

function renderReportList(theme, list) {
    if (list.length === 0) return '';
    
    const icon = theme === 'light' ? '☀️' : (theme === 'dark' ? '🌙' : '❓');
    const title = theme.charAt(0).toUpperCase() + theme.slice(1);
    
    const items = list.map(r => `
        <li>
            <a href="${escapeHtml(r.relativePath)}" class="report-link">
                <span class="report-name">${escapeHtml(r.fileName)}</span>
                <span class="report-arrow">→</span>
            </a>
        </li>
    `).join("");

    return `
        <div class="theme-card ${theme}-theme">
            <h3>${icon} ${title} Mode</h3>
            <ul class="report-list">
                ${items}
            </ul>
        </div>
    `;
}

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Accessibility Reports Dashboard</title>
    <style>
        :root {
            --bg-body: #f8f9fa;
            --bg-card: #ffffff;
            --text-main: #212529;
            --text-muted: #6c757d;
            --border-color: #dee2e6;
            --primary: #0d6efd;
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
        body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg-body); color: var(--text-main); margin: 0; padding: 2rem; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 2rem; font-weight: 300; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; }
        .theme-card { background: var(--bg-card); border-radius: 12px; padding: 1.5rem; box-shadow: var(--shadow); border: 1px solid var(--border-color); }
        h3 { margin-top: 0; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem; }
        ul { list-style: none; padding: 0; margin: 0; }
        li { margin-bottom: 0.5rem; }
        .report-link { display: flex; justify-content: space-between; padding: 0.75rem; background: rgba(128,128,128,0.05); border-radius: 6px; text-decoration: none; color: inherit; transition: background 0.2s; }
        .report-link:hover { background: rgba(128,128,128,0.1); }
        .report-arrow { color: var(--primary); font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>♿ Accessibility Reports</h1>
        <p style="text-align: center; color: var(--text-muted); margin-bottom: 3rem;">Generated on ${new Date().toLocaleString()}</p>
        <div class="grid">
            ${renderReportList('light', grouped.light)}
            ${renderReportList('dark', grouped.dark)}
            ${grouped.unknown.length > 0 ? renderReportList('unknown', grouped.unknown) : ''}
        </div>
    </div>
</body>
</html>
`;

fs.writeFileSync(indexPath, htmlContent);
console.log(`Generated accessibility index at ${indexPath}`);