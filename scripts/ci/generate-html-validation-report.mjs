/**
 * HTML Validation Report Generator
 *
 * This script parses the JSON output from html-validate and generates a
 * user-friendly, modern HTML report. It provides high-level statistics,
 * aggregates common issue types, and lists detailed errors per file.
 *
 * It is used in the CI pipeline to provide visual feedback on HTML quality.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { escapeHtml } from "../utils/html.mjs";

const JSON_REPORT = "html-validation.json";
const OUTPUT_FILE = "html-report.html";
const DIST_DIR = "dist";
const CONFIG_FILE = ".htmlvalidate.json";

/**
 * Recursively find all HTML files in a directory to ensure 100% coverage reporting.
 * @param {string} dir - Directory to scan.
 * @param {string[]} fileList - Accumulated list of files.
 * @returns {string[]} List of relative paths to HTML files.
 */
function getAllHtmlFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllHtmlFiles(name, fileList);
    } else if (name.endsWith(".html")) {
      // Use relative paths for consistency across environments
      fileList.push(path.relative(process.cwd(), name));
    }
  });
  return fileList;
}

/**
 * Retrieves the active rules from html-validate for documentation in the report.
 * @returns {Object} Map of active rules and their configurations.
 */
function getActiveRules() {
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
    );
    const config = JSON.parse(configJson);
    return config.rules || {};
  } catch (e) {
    console.warn("⚠️ Could not retrieve active rules list:", e.message);
    return {};
  }
}

/**
 * Main function to generate the HTML report.
 */
function generateReport() {
  if (!fs.existsSync(JSON_REPORT)) {
    console.error(`❌ Error: ${JSON_REPORT} not found!`);
    process.exit(1);
  }

  let report;
  try {
    const content = fs.readFileSync(JSON_REPORT, "utf-8");
    if (!content.trim()) {
      console.warn(
        "⚠️ HTML validation JSON report is empty. Assuming no issues found.",
      );
      report = [];
    } else {
      report = JSON.parse(content);
    }
  } catch (e) {
    console.error("❌ Error parsing JSON report:", e.message);
    process.exit(1);
  }

  const results = Array.isArray(report)
    ? report
    : report.results || report.files || [];
  const allFiles = getAllHtmlFiles(DIST_DIR);
  const activeRules = getActiveRules();
  const ruleCount = Object.keys(activeRules).length;

  // Create lookup map for files with validation messages
  const resultMap = new Map();
  results.forEach((res) => {
    const relPath = path.relative(process.cwd(), res.filePath);
    resultMap.set(relPath, res);
  });

  // Merge scan results with overall file list
  const files = allFiles.map((filePath) => {
    const res = resultMap.get(filePath);
    return {
      filePath,
      messages: res ? res.messages : [],
      errorCount: res ? res.errorCount : 0,
      warningCount: res ? res.warningCount : 0,
    };
  });

  const totalErrors = files.reduce((acc, f) => acc + (f.errorCount ?? 0), 0);
  const totalWarnings = files.reduce(
    (acc, f) => acc + (f.warningCount ?? 0),
    0,
  );

  // Aggregate rule triggers for the "Analysis Overview" section
  const ruleCounts = new Map();
  files.forEach((file) => {
    (file.messages || []).forEach((msg) => {
      if (!msg.ruleId) return;
      const count = ruleCounts.get(msg.ruleId) || 0;
      ruleCounts.set(msg.ruleId, count + 1);
    });
  });

  const sortedRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const statusClass =
    totalErrors > 0 ? "failed" : totalWarnings > 0 ? "warning" : "passed";
  const statusEmoji = totalErrors > 0 ? "❌" : totalWarnings > 0 ? "⚠️" : "✅";
  const statusText =
    totalErrors > 0 ? "Failed" : totalWarnings > 0 ? "Warnings" : "Passed";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HTML Validation Report</title>
  <style>
    :root {
      --primary: #4f46e5;
      --bg: #f3f4f6;
      --card-bg: #ffffff;
      --text: #1f2937;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --success: #059669;
      --success-bg: #ecfdf5;
      --error: #dc2626;
      --error-bg: #fef2f2;
      --warning: #d97706;
      --warning-bg: #fffbeb;
      --info: #2563eb;
      --info-bg: #eff6ff;
    }

    body { 
      font-family: system-ui, -apple-system, sans-serif; 
      line-height: 1.5;
      margin: 0; 
      padding: 0; 
      background: var(--bg); 
      color: var(--text); 
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    header { 
      background: var(--card-bg); 
      padding: 40px 0; 
      border-bottom: 1px solid var(--border);
      text-align: center;
    }

    .status-banner {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      padding: 12px 32px;
      border-radius: 9999px;
      font-weight: 800;
      font-size: 1.25rem;
      margin-bottom: 24px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-banner.passed { color: var(--success); background: var(--success-bg); border: 2px solid #10b981; }
    .status-banner.failed { color: var(--error); background: var(--error-bg); border: 2px solid #ef4444; }
    .status-banner.warning { color: var(--warning); background: var(--warning-bg); border: 2px solid #f59e0b; }

    h1 { margin: 0; font-size: 2.25rem; font-weight: 900; color: #111827; }
    .subtitle { color: var(--text-muted); margin-top: 8px; font-size: 1.1rem; }

    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 40px 0;
    }

    .card {
      background: var(--card-bg);
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      border: 1px solid var(--border);
      text-align: center;
    }
    .card .value { display: block; font-size: 2.5rem; font-weight: 800; line-height: 1; margin-bottom: 8px; }
    .card .label { color: var(--text-muted); font-weight: 600; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.05em; }
    
    .card.failed .value { color: var(--error); }
    .card.warning .value { color: var(--warning); }
    .card.passed .value { color: var(--success); }

    .section-title { font-size: 1.5rem; font-weight: 800; margin: 40px 0 20px; color: #111827; display: flex; align-items: center; gap: 12px; }
    .section-title::after { content: ""; flex: 1; height: 1px; background: var(--border); }

    .analysis-info {
      background: #fff;
      padding: 24px;
      border-radius: 12px;
      border: 1px solid var(--border);
      margin-bottom: 40px;
    }
    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px; }
    .info-item h4 { margin: 0 0 12px 0; font-size: 0.9rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; }
    .rule-list { display: flex; flex-wrap: wrap; gap: 8px; list-style: none; padding: 0; margin: 0; }
    .rule-tag { background: #f3f4f6; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-family: ui-monospace, monospace; font-weight: 600; color: #4b5563; border: 1px solid var(--border); }

    .file-item {
      background: var(--card-bg);
      border-radius: 12px;
      margin-bottom: 16px;
      border: 1px solid var(--border);
      overflow: hidden;
    }
    .file-header {
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      user-select: none;
      transition: background 0.2s;
    }
    .file-header:hover { background: #f9fafb; }
    .file-name { font-weight: 700; font-family: ui-monospace, monospace; font-size: 0.95rem; display: flex; align-items: center; gap: 12px; }
    .file-status-icon { font-size: 1.2rem; }
    .file-badges { display: flex; gap: 8px; }
    .badge-mini { padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .badge-mini.err { background: var(--error-bg); color: var(--error); }
    .badge-mini.warn { background: var(--warning-bg); color: var(--warning); }
    .badge-mini.ok { background: var(--success-bg); color: var(--success); }

    .issue-list { list-style: none; padding: 0; margin: 0; background: #fff; }
    .issue-item { padding: 24px; border-top: 1px solid var(--border); display: flex; gap: 20px; }
    .issue-severity { flex-shrink: 0; }
    .severity-pill { padding: 4px 12px; border-radius: 6px; font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
    .severity-pill.error { background: var(--error-bg); color: var(--error); border: 1px solid #fecaca; }
    .severity-pill.warning { background: var(--warning-bg); color: var(--warning); border: 1px solid #fde68a; }

    .issue-content { flex: 1; min-width: 0; }
    .issue-meta { display: flex; gap: 16px; font-family: ui-monospace, monospace; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
    .issue-selector { color: var(--primary); font-weight: 700; background: #eef2ff; padding: 2px 6px; border-radius: 4px; }
    .issue-message { font-size: 1.1rem; font-weight: 700; display: block; margin-bottom: 12px; color: #111827; }
    .issue-rule { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); text-decoration: none; font-size: 0.8rem; font-weight: 600; padding: 4px 8px; background: #f9fafb; border-radius: 6px; border: 1px solid var(--border); transition: all 0.2s; }
    .issue-rule:hover { border-color: var(--primary); color: var(--primary); background: #f5f3ff; }
    
    .issue-context { margin-top: 16px; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 12px; font-size: 0.85rem; }
    .context-row { margin-bottom: 4px; }
    .context-key { font-weight: 700; color: var(--text-muted); margin-right: 8px; }
    .code-extract { margin-top: 16px; background: #1e293b; color: #f1f5f9; padding: 16px; border-radius: 8px; font-family: ui-monospace, monospace; font-size: 0.85rem; overflow-x: auto; border-left: 4px solid var(--primary); }

    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    
    footer { text-align: center; padding: 60px 0; color: var(--text-muted); font-size: 0.9rem; border-top: 1px solid var(--border); background: #fff; margin-top: 60px; }
    
    @media (max-width: 640px) {
      .summary-cards { grid-template-columns: 1fr 1fr; }
      .issue-item { flex-direction: column; gap: 12px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="status-banner ${statusClass}">${statusEmoji} Validation ${statusText}</div>
      <h1>HTML Validation Report</h1>
      <p class="subtitle">Generated for project <strong>jmrp.io</strong> on ${new Date().toUTCString()}</p>
    </div>
  </header>

  <div class="container">
    <div class="summary-cards">
      <div class="card ${totalErrors > 0 ? "failed" : "passed"}">
        <span class="value">${totalErrors}</span>
        <span class="label">Errors</span>
      </div>
      <div class="card ${totalWarnings > 0 ? "warning" : "passed"}">
        <span class="value">${totalWarnings}</span>
        <span class="label">Warnings</span>
      </div>
      <div class="card">
        <span class="value">${files.length}</span>
        <span class="label">Files Checked</span>
      </div>
      <div class="card">
        <span class="value">${ruleCount}</span>
        <span class="label">Rules Active</span>
      </div>
    </div>

    <h2 class="section-title">📊 Analysis Overview</h2>
    <div class="analysis-info">
      <div class="info-grid">
        <div class="info-item">
          <h4>Top Issue Types</h4>
          ${
            sortedRules.length > 0
              ? `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${sortedRules
                .map(
                  ([rule, count]) => `
                <div style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                  <code style="font-weight: 600;">${escapeHtml(rule)}</code>
                  <span style="font-weight: 800; color: var(--error);">${count}</span>
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : '<p style="margin:0; color: var(--success); font-weight: 600;">No issues found!</p>'
          }
        </div>
        <div class="info-item">
          <h4>Rules Analyzed</h4>
          <ul class="rule-list">
            ${Object.keys(activeRules)
              .map((rule) => `<li class="rule-tag">${escapeHtml(rule)}</li>`)
              .join("")}
          </ul>
        </div>
      </div>
    </div>

    <h2 class="section-title">📂 Detailed Results</h2>
    <div class="file-list">
      ${files
        .map((file) => {
          const isClean = !file.messages || file.messages.length === 0;
          const fileEmoji =
            (file.errorCount ?? 0) > 0
              ? "🔴"
              : (file.warningCount ?? 0) > 0
                ? "⚠️"
                : "✅";

          return `
          <details class="file-item" ${isClean ? "" : "open"}>
            <summary class="file-header">
              <span class="file-name">
                <span class="file-status-icon">${fileEmoji}</span>
                ${escapeHtml(file.filePath)}
              </span>
              <div class="file-badges">
                ${file.errorCount > 0 ? `<span class="badge-mini err">${file.errorCount} E</span>` : ""}
                ${file.warningCount > 0 ? `<span class="badge-mini warn">${file.warningCount} W</span>` : ""}
                ${isClean ? `<span class="badge-mini ok">PASSED</span>` : ""}
              </div>
            </summary>
            
            ${
              isClean
                ? `
              <div style="padding: 24px; text-align: center; color: var(--success); font-weight: 600; background: var(--success-bg);">
                ✨ No validation issues found in this file.
              </div>
            `
                : `
              <ul class="issue-list">
                ${(file.messages || [])
                  .map((msg) => {
                    const severityLabel =
                      msg.severity === 2 ? "Error" : "Warning";
                    const severityClass =
                      msg.severity === 2 ? "error" : "warning";

                    return `
                    <li class="issue-item">
                      <div class="issue-severity">
                        <span class="severity-pill ${severityClass}">${severityLabel}</span>
                      </div>
                      <div class="issue-content">
                        <div class="issue-meta">
                          <span>Line ${msg.line ?? "?"}, Col ${msg.column ?? "?"}</span>
                          ${msg.selector ? `<span>Selector: <span class="issue-selector">${escapeHtml(msg.selector)}</span></span>` : ""}
                        </div>
                        <strong class="issue-message">${escapeHtml(msg.message)}</strong>
                        
                        <div style="margin-top: 12px;">
                          <a href="${msg.ruleUrl || `https://html-validate.org/rules/${escapeHtml(msg.ruleId)}.html`}" target="_blank" class="issue-rule">
                            <span>Rule: <strong>${escapeHtml(msg.ruleId)}</strong></span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                          </a>
                        </div>

                        ${
                          msg.context
                            ? `
                          <div class="issue-context">
                            ${
                              typeof msg.context === "object"
                                ? Object.entries(msg.context)
                                    .map(
                                      ([k, v]) => `
                                <div class="context-row"><span class="context-key">${escapeHtml(k)}:</span> <code>${escapeHtml(String(v))}</code></div>
                              `,
                                    )
                                    .join("")
                                : escapeHtml(msg.context)
                            }
                          </div>
                        `
                            : ""
                        }

                        ${msg.extract ? `<div class="code-extract">${escapeHtml(msg.extract)}</div>` : ""}
                      </div>
                    </li>
                  `;
                  })
                  .join("")}
              </ul>
            `
            }
          </details>
        `;
        })
        .join("")}
    </div>
  </div>

  <footer>
    <div class="container">
      <p>Report generated by <code>html-validate</code> CI script.</p>
      <p>&copy; 2025 José Manuel Requena Plens</p>
    </div>
  </footer>
</body>
</html>
  `;

  fs.writeFileSync(OUTPUT_FILE, html);
  console.log(`✅ HTML Report generated at: ${OUTPUT_FILE}`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

generateReport();
