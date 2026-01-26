/**
 * generate-html-validation-report.mjs
 *
 * Converts the html-validate JSON report into a premium HTML dashboard
 * for inclusion in the CI dashboard.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIST_DIR = "dist";
const REPORT_FILE = "html-validation.json";
const OUTPUT_FILE = "html-validation-report.html";
const CONFIG_FILE = ".htmlvalidate.json";

/**
 * Recursively find all HTML files in a directory
 */
const getAllHtmlFiles = (dir, fileList = []) => {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllHtmlFiles(filePath, fileList);
    } else if (file.endsWith(".html")) {
      fileList.push(filePath);
    }
  });
  return fileList;
};

/**
 * Gets the active rules from html-validate configuration
 */
const getActiveRules = () => {
  try {
    const allFiles = getAllHtmlFiles(DIST_DIR);
    const firstHtml = allFiles[0];
    if (!firstHtml) return {};

    // Print the effective config for the first file found
    // Using execFileSync with arguments array prevents shell injection
    const configJson = execFileSync(
      "pnpm",
      ["exec", "html-validate", "-c", CONFIG_FILE, "--print-config", firstHtml],
      { encoding: "utf-8" },
    ); // NOSONAR
    const config = JSON.parse(configJson);
    return config.rules || {};
  } catch (error) {
    console.warn("⚠️ Could not retrieve active rules list:", error.message);
    return {};
  }
};

/**
 * Loads and parses the validation report JSON
 */
const loadReport = () => {
  if (!fs.existsSync(REPORT_FILE)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
  } catch (error) {
    console.error("❌ Error reading report:", error.message);
    return null;
  }
};

/**
 * Renders the HTML report
 */
const generateHtml = (results, activeRules) => {
  const totalFiles = results.length;
  const invalidFiles = results.filter((r) => !r.valid).length;
  const totalErrors = results.reduce((acc, r) => acc + r.errorCount, 0);
  const totalWarnings = results.reduce((acc, r) => acc + r.warningCount, 0);

  const statusClass = invalidFiles === 0 ? "status-success" : "status-danger";
  const statusText = invalidFiles === 0 ? "PASSED" : "FAILED";

  // Group errors by rule
  const ruleStats = {};
  results.forEach((r) => {
    r.messages.forEach((m) => {
      ruleStats[m.ruleId] = (ruleStats[m.ruleId] || 0) + 1;
    });
  });

  const sortedRules = Object.entries(ruleStats).sort((a, b) => b[1] - a[1]);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HTML5 Validation Report</title>
    <style>
        :root {
            --bg: #f8f9fa;
            --card-bg: #ffffff;
            --text: #1a1a1a;
            --text-muted: #666;
            --primary: #2563eb;
            --danger: #dc2626;
            --warning: #d97706;
            --success: #16a34a;
            --border: #e5e7eb;
            --font: system-ui, -apple-system, sans-serif;
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg: #0f172a;
                --card-bg: #1e293b;
                --text: #f8fafc;
                --text-muted: #94a3b8;
                --border: #334155;
            }
        }

        body {
            font-family: var(--font);
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 2rem;
            line-height: 1.5;
        }

        .container { max-width: 1200px; margin: 0 auto; }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--border);
        }

        .status-badge {
            padding: 0.5rem 1.5rem;
            border-radius: 9999px;
            font-weight: 800;
            letter-spacing: 0.05em;
        }

        .status-danger { background: #fee2e2; color: #991b1b; }
        .status-success { background: #dcfce7; color: #166534; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            background: var(--card-bg);
            padding: 1.5rem;
            border-radius: 12px;
            border: 1px solid var(--border);
            text-align: center;
        }

        .stat-value { font-size: 2rem; font-weight: 800; display: block; }
        .stat-label { color: var(--text-muted); font-size: 0.875rem; text-transform: uppercase; font-weight: 600; }

        .grid-main {
            display: grid;
            grid-template-columns: 1fr 350px;
            gap: 2rem;
        }

        @media (max-width: 1000px) {
            .grid-main { grid-template-columns: 1fr; }
        }

        .section-title {
            font-size: 1.25rem;
            margin-bottom: 1rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }

        .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 12px;
            overflow: hidden;
        }

        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { background: rgba(0,0,0,0.02); padding: 1rem; font-size: 0.875rem; color: var(--text-muted); border-bottom: 1px solid var(--border); }
        td { padding: 1rem; border-bottom: 1px solid var(--border); font-size: 0.875rem; }

        .file-link { color: var(--primary); text-decoration: none; font-weight: 500; }
        .file-link:hover { text-decoration: underline; }

        .count-badge {
            padding: 0.2rem 0.5rem;
            border-radius: 6px;
            font-weight: 700;
            font-size: 0.75rem;
        }
        .count-error { background: #fee2e2; color: #991b1b; }
        .count-warning { background: #fef3c7; color: #92400e; }
        .count-zero { background: #f3f4f6; color: #4b5563; }

        .rule-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.75rem 1rem;
            border-bottom: 1px solid var(--border);
        }
        .rule-item:last-child { border-bottom: none; }
        .rule-name { font-family: monospace; font-size: 0.85rem; }
        .rule-count { font-weight: 700; color: var(--danger); }

        .active-rules-list {
            padding: 1rem;
            font-size: 0.75rem;
            max-height: 400px;
            overflow-y: auto;
        }
        .active-rule {
            display: inline-block;
            margin: 0.2rem;
            padding: 0.2rem 0.4rem;
            background: rgba(0,0,0,0.05);
            border-radius: 4px;
            color: var(--text-muted);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div>
                <h1 style="margin:0">🏗️ HTML5 Validation Report</h1>
                <p style="margin:0.5rem 0 0; color:var(--text-muted)">Project-wide structural and accessibility standards audit</p>
            </div>
            <div class="status-badge ${statusClass}">${statusText}</div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <span class="stat-value">${totalFiles}</span>
                <span class="stat-label">Files Scanned</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: ${invalidFiles > 0 ? "var(--danger)" : "var(--success)"}">${invalidFiles}</span>
                <span class="stat-label">Invalid Files</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: var(--danger)">${totalErrors}</span>
                <span class="stat-label">Total Errors</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: var(--warning)">${totalWarnings}</span>
                <span class="stat-label">Total Warnings</span>
            </div>
        </div>

        <div class="grid-main">
            <div class="results-area">
                <h2 class="section-title">📄 File Details</h2>
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th>File Path</th>
                                <th>Status</th>
                                <th>Errors</th>
                                <th>Warnings</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${results
                              .map(
                                (r) => `
                                <tr>
                                    <td><a href="#" class="file-link">${r.filePath.replace(DIST_DIR + "/", "")}</a></td>
                                    <td>${r.valid ? "✅ Valid" : "❌ Invalid"}</td>
                                    <td><span class="count-badge ${r.errorCount > 0 ? "count-error" : "count-zero"}">${r.errorCount}</span></td>
                                    <td><span class="count-badge ${r.warningCount > 0 ? "count-warning" : "count-zero"}">${r.warningCount}</span></td>
                                </tr>
                            `,
                              )
                              .join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="sidebar">
                <h2 class="section-title">🚨 Top Issues</h2>
                <div class="card" style="margin-bottom: 2rem;">
                    ${
                      sortedRules.length > 0
                        ? sortedRules
                            .map(
                              ([rule, count]) => `
                        <div class="rule-item">
                            <span class="rule-name">${rule}</span>
                            <span class="rule-count">${count}</span>
                        </div>
                    `,
                            )
                            .join("")
                        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">No issues found!</div>'
                    }
                </div>

                <h2 class="section-title">⚙️ Active Rules</h2>
                <div class="card">
                    <div class="active-rules-list">
                        ${Object.keys(activeRules)
                          .map(
                            (rule) => `
                            <span class="active-rule">${rule}</span>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            </div>
        </div>

        <footer style="margin-top: 3rem; text-align: center; color: var(--text-muted); font-size: 0.875rem; border-top: 1px solid var(--border); padding-top: 1rem;">
            Generated on ${new Date().toLocaleString("en-US", { timeZone: "UTC" })} UTC | html-validate engine
        </footer>
    </div>
</body>
</html>
  `;
};

const main = () => {
  console.log("📊 Generating HTML Validation Report...");

  const report = loadReport();
  if (!report) {
    console.error("❌ No validation results found. Run html-validate first.");
    process.exit(1);
  }

  const activeRules = getActiveRules();
  const html = generateHtml(report.results, activeRules);

  fs.writeFileSync(OUTPUT_FILE, html, "utf-8");
  console.log(`✅ HTML report generated at ${OUTPUT_FILE}`);
};

main();
