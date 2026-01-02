/**
 * Generate Accessibility Reports Dashboard
 *
 * Scans a directory for Axe HTML reports, groups them by Theme,
 * and generates a unified HTML dashboard index.
 *
 * Usage: node generate-accessibility-index.mjs <deploy-dir>
 */

import fs from "node:fs";
import path from "node:path";

const deployDir = process.argv[2] || "a11y-deploy";
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(deployDir)) {
    console.error(`Deploy directory not found at ${deployDir}`);
    process.exit(1);
}

// Helper: Escape HTML characters
function escapeHtml(unsafe) {
    return unsafe
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
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
reports.forEach((r) => {
    if (grouped[r.theme]) grouped[r.theme].push(r);
    else grouped.unknown.push(r);
});

function renderReportList(theme, list) {
    if (list.length === 0) return "";

    const icon = theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "❓";
    const title = theme.charAt(0).toUpperCase() + theme.slice(1);

    // Sort logic could be added here if filenames contain timestamps
    const items = list
        .map(
            (r) => `
        <a href="${escapeHtml(r.relativePath)}" class="report-card">
            <div class="card-icon">${icon}</div>
            <div class="card-content">
                <span class="report-name">${escapeHtml(r.fileName)}</span>
                <span class="report-meta">Full Page Audit</span>
            </div>
            <div class="card-action">View Report &rarr;</div>
        </a>
    `,
        )
        .join("");

    return `
        <div class="theme-section">
            <div class="section-header">
                <h2>${icon} ${title} Mode</h2>
                <span class="badge">${list.length} Reports</span>
            </div>
            <div class="reports-grid">
                ${items}
            </div>
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
            --bg-body: #f4f4f9;
            --bg-card: #ffffff;
            --text-main: #333333;
            --text-muted: #666666;
            --border-color: #e0e0e0;
            --primary: #2563eb;
            --hover-bg: #f8f9fa;
            --shadow: 0 2px 8px rgba(0,0,0,0.06);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-body: #18181b;
                --bg-card: #27272a;
                --text-main: #e4e4e7;
                --text-muted: #a1a1aa;
                --border-color: #3f3f46;
                --primary: #60a5fa;
                --hover-bg: #303036;
                --shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
        }

        * { box-sizing: border-box; }
        body {
            font-family: system-ui, -apple-system, sans-serif;
            background-color: var(--bg-body);
            color: var(--text-main);
            margin: 0;
            padding: 3rem 1rem;
            line-height: 1.5;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        header {
            text-align: center;
            margin-bottom: 4rem;
        }

        h1 {
            font-size: 2.5rem;
            margin: 0 0 0.5rem 0;
            letter-spacing: -1px;
        }

        .subtitle {
            color: var(--text-muted);
            font-size: 1rem;
        }

        .theme-section {
            margin-bottom: 3rem;
        }

        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 0.75rem;
        }

        h2 {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 600;
        }

        .badge {
            background-color: var(--primary);
            color: white;
            font-size: 0.75rem;
            font-weight: bold;
            padding: 0.25rem 0.75rem;
            border-radius: 999px;
        }

        .reports-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1rem;
        }

        .report-card {
            background-color: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.25rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            text-decoration: none;
            color: inherit;
            transition: all 0.2s ease;
            box-shadow: var(--shadow);
        }

        .report-card:hover {
            transform: translateY(-2px);
            border-color: var(--primary);
            box-shadow: 0 6px 16px rgba(0,0,0,0.1);
        }

        .card-icon {
            font-size: 2rem;
            background-color: var(--hover-bg);
            width: 50px;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
        }

        .card-content {
            flex: 1;
            overflow: hidden;
        }

        .report-name {
            display: block;
            font-weight: 600;
            font-size: 1rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 0.25rem;
        }

        .report-meta {
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .card-action {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--primary);
            white-space: nowrap;
        }

        .empty-state {
            text-align: center;
            padding: 4rem;
            color: var(--text-muted);
            background: var(--bg-card);
            border-radius: 12px;
            border: 1px dashed var(--border-color);
        }

        @media (max-width: 600px) {
            h1 { font-size: 2rem; }
            .reports-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>♿ Accessibility Reports</h1>
            <div class="subtitle">Generated on ${new Date().toLocaleString()}</div>
        </header>
        
        ${Object.values(grouped).every((l) => l.length === 0)
        ? '<div class="empty-state">No accessibility reports found.</div>'
        : ""
    }

        ${renderReportList("light", grouped.light)}
        ${renderReportList("dark", grouped.dark)}
        ${grouped.unknown.length > 0 ? renderReportList("unknown", grouped.unknown) : ""}
    </div>
</body>
</html>
`;

fs.writeFileSync(indexPath, htmlContent);
console.log(`Generated accessibility index at ${indexPath}`);
