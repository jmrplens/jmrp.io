import fs from "fs";
import path from "path";
import { escapeHtml } from "../utils/html.mjs";

const JSON_REPORT = "html-validation.json";
const OUTPUT_FILE = "html-report.html";
const DIST_DIR = "dist";

/**
 * Recursively find all HTML files in a directory
 */
function getAllHtmlFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getAllHtmlFiles(name, fileList);
    } else if (name.endsWith(".html")) {
      // Use relative paths for consistency
      fileList.push(path.relative(process.cwd(), name));
    }
  });
  return fileList;
}

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

  console.log(
    `🔍 Scanning ${DIST_DIR}... Found ${allFiles.length} HTML files.`,
  );

  // Map results by relative path for easy lookup
  const resultMap = new Map();
  results.forEach((res) => {
    // Normalize path to be relative to root
    const relPath = path.relative(process.cwd(), res.filePath);
    resultMap.set(relPath, res);
  });

  // Create a combined list of all files with their status
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
  const totalWarnings = files.reduce((acc, f) => acc + (f.warningCount ?? 0), 0);
  
  // Aggregate rules
  const ruleCounts = new Map();
  files.forEach(file => {
    (file.messages || []).forEach(msg => {
      if (!msg.ruleId) return;
      const count = ruleCounts.get(msg.ruleId) || 0;
      ruleCounts.set(msg.ruleId, count + 1);
    });
  });

  const sortedRules = Array.from(ruleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  console.log("-----------------------------------------");
  console.log("📊 HTML Validation Summary");
  console.log(`📂 Files Checked: ${files.length}`);
  console.log(`🔴 Errors:        ${totalErrors}`);
  console.log(`⚠️  Warnings:      ${totalWarnings}`);
  if (sortedRules.length > 0) {
    console.log("🔝 Top Rules:");
    sortedRules.forEach(([rule, count]) => console.log(`   - ${rule}: ${count}`));
  }
  console.log("-----------------------------------------");

  if (totalErrors > 0) {
    console.log("❌ Validation failed with errors.");
  } else if (totalWarnings > 0) {
    console.log("⚠️  Validation passed with warnings.");
  } else {
    console.log("✅ Validation passed!");
  }

  const statusClass = totalErrors > 0 ? "failed" : (totalWarnings > 0 ? "warning" : "passed");
  const statusEmoji = totalErrors > 0 ? "❌" : (totalWarnings > 0 ? "⚠️" : "✅");
  const statusText = totalErrors > 0 ? "Failed" : (totalWarnings > 0 ? "Warnings" : "Passed");

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
      --bg: #f9fafb;
      --card-bg: #ffffff;
      --text: #111827;
      --text-muted: #6b7280;
      --border: #e5e7eb;
      --success: #16a34a;
      --success-bg: #dcfce7;
      --error: #dc2626;
      --error-bg: #fee2e2;
      --warning: #d97706;
      --warning-bg: #fef3c7;
      --info: #0284c7;
      --info-bg: #e0f2fe;
    }

    body { 
      font-family: Inter, system-ui, -apple-system, sans-serif; 
      line-height: 1.5;
      max-width: 1200px; 
      margin: 0 auto; 
      padding: 40px 20px; 
      background: var(--bg); 
      color: var(--text); 
    }

    header { 
      background: var(--card-bg); 
      padding: 30px; 
      border-radius: 12px; 
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); 
      margin-bottom: 30px; 
      position: sticky;
      top: 20px;
      z-index: 100;
      border: 1px solid var(--border);
    }

    h1 { margin: 0 0 20px 0; font-weight: 800; letter-spacing: -0.025em; text-align: center; }
    
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 30px;
      align-items: start;
    }

    .summary-stats {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .stats-row {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    .top-rules {
      background: #f8fafc;
      padding: 15px;
      border-radius: 8px;
      border: 1px solid var(--border);
      font-size: 0.85rem;
    }
    .top-rules h3 { margin: 0 0 10px 0; font-size: 0.9rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
    .rule-item { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 4px; }
    .rule-item:last-child { margin-bottom: 0; }
    .rule-name { font-family: ui-monospace, monospace; font-weight: 600; }
    .rule-count { background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-weight: bold; }

    .badge { 
      padding: 6px 12px; 
      border-radius: 9999px; 
      font-weight: 600; 
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .failed { color: var(--error); background: var(--error-bg); }
    .warning { color: var(--warning); background: var(--warning-bg); }
    .passed { color: var(--success); background: var(--success-bg); }
    .info { color: var(--info); background: var(--info-bg); }

    .file-card { 
      background: var(--card-bg); 
      margin-bottom: 20px; 
      border-radius: 12px; 
      overflow: hidden; 
      box-shadow: 0 1px 3px rgba(0,0,0,0.1); 
      border: 1px solid var(--border);
    }

    .file-header { 
      padding: 20px; 
      background: #ffffff; 
      display: flex; 
      justify-content: space-between; 
      align-items: center; 
      cursor: pointer;
      user-select: none;
    }

    .file-header:hover { background: #f9fafb; }
    .file-path { font-family: ui-monospace, monospace; font-weight: 600; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; }
    
    .messages { padding: 0; margin: 0; list-style: none; background: #fff; }
    .message { 
      padding: 24px; 
      border-top: 1px solid var(--border); 
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 20px;
    }

    .severity-col { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .severity-tag { 
      font-weight: 800; 
      font-size: 0.7rem; 
      padding: 4px 8px; 
      border-radius: 6px; 
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .content-col { flex: 1; min-width: 0; }
    
    .location-bar { 
      display: flex; 
      gap: 15px; 
      font-family: ui-monospace, monospace; 
      color: var(--text-muted); 
      font-size: 0.85rem; 
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    .selector { color: var(--primary); font-weight: 600; background: #f5f3ff; padding: 2px 6px; border-radius: 4px; }
    
    .message-text { font-size: 1.1rem; font-weight: 600; display: block; margin-bottom: 12px; color: #111827; }
    
    .rule-box { 
      display: inline-flex; 
      align-items: center; 
      gap: 4px;
      background: #f3f4f6; 
      padding: 4px 10px; 
      border-radius: 6px;
      font-size: 0.8rem;
      color: var(--text-muted);
      text-decoration: none;
      transition: all 0.2s;
    }
    .rule-box:hover { background: var(--border); color: var(--text); }

    .code-snippet { 
      background: #0f172a; 
      color: #e2e8f0; 
      padding: 16px; 
      border-radius: 8px; 
      overflow-x: auto; 
      font-family: ui-monospace, monospace; 
      margin-top: 16px; 
      font-size: 0.9rem;
      border-left: 4px solid var(--primary);
    }

    .context-data {
      margin-top: 12px;
      font-size: 0.85rem;
      background: #f8fafc;
      padding: 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    .context-label { font-weight: bold; color: var(--text-muted); margin-right: 8px; }

    details > summary { list-style: none; }
    details > summary::-webkit-details-marker { display: none; }
    
    footer { text-align: center; margin-top: 50px; color: var(--text-muted); font-size: 0.9rem; }

    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: 1fr; }
      header { position: relative; top: 0; }
    }
  </style>
</head>
<body>
  <header>
    <h1>HTML Validation Report</h1>
    <div class="summary-grid">
      <div class="summary-stats">
        <div class="stats-row">
          <span class="badge ${statusClass}" style="font-size: 1.1rem; padding: 8px 20px;">${statusEmoji} Overall: ${statusText}</span>
        </div>
        <div class="stats-row">
          <span class="badge failed">${totalErrors} Errors</span>
          <span class="badge warning">${totalWarnings} Warnings</span>
          <span class="badge info">${files.length} Files Checked</span>
        </div>
      </div>
      
      ${sortedRules.length > 0 ? `
      <div class="top-rules">
        <h3>Top Rules Triggered</h3>
        ${sortedRules.map(([rule, count]) => `
          <div class="rule-item">
            <span class="rule-name">${escapeHtml(rule)}</span>
            <span class="rule-count">${count}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}
    </div>
  </header>

  <main>
    ${
      files.length === 0
        ? '<div class="file-card"><div class="file-header" style="justify-content:center">No files checked or report empty.</div></div>'
        : ""
    }

    ${files
      .map((file) => {
        const isClean = !file.messages || file.messages.length === 0;
        const fileStatus = (file.errorCount ?? 0) > 0 ? "failed" : ((file.warningCount ?? 0) > 0 ? "warning" : "passed");
        const fileEmoji = (file.errorCount ?? 0) > 0 ? "🔴" : ((file.warningCount ?? 0) > 0 ? "⚠️" : "✅");

        return `
      <details class="file-card" ${isClean ? "" : "open"}>
        <summary class="file-header">
          <span class="file-path">${fileEmoji} ${escapeHtml(file.filePath)}</span>
          <span class="badge ${fileStatus}">${file.errorCount ?? 0}E / ${file.warningCount ?? 0}W</span>
        </summary>
        ${
          isClean
            ? '<div style="padding: 20px; color: var(--success); font-weight: 600;">No validation issues found in this file.</div>'
            : `
        <ul class="messages">
          ${(file.messages || [])
            .map((msg) => {
              const severityClass = msg.severity === 2 ? "failed" : msg.severity === 1 ? "warning" : "info";
              const severityText = msg.severity === 2 ? "Error" : msg.severity === 1 ? "Warning" : "Info";
              
              return `
            <li class="message">
              <div class="severity-col">
                <span class="severity-tag ${severityClass}">${severityText}</span>
              </div>
              <div class="content-col">
                <div class="location-bar">
                  <span>Line ${msg.line ?? "?"}, Col ${msg.column ?? "?"}</span>
                  ${msg.size ? `<span>Size: ${msg.size}</span>` : ""}
                  ${msg.selector ? `<span class="selector" title="CSS Selector">${escapeHtml(msg.selector)}</span>` : ""}
                </div>
                
                <strong class="message-text">${escapeHtml(msg.message)}</strong>
                
                <div style="display: flex; gap: 10px; align-items: center;">
                  ${
                    msg.ruleId
                      ? `<a href="${msg.ruleUrl || `https://html-validate.org/rules/${escapeHtml(msg.ruleId)}.html`}" target="_blank" class="rule-box">
                          <span>Rule: <strong>${escapeHtml(msg.ruleId)}</strong></span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </a>`
                      : ""
                  }
                </div>

                ${
                  msg.context && typeof msg.context === "object"
                    ? `<div class="context-data">
                        ${Object.entries(msg.context)
                          .map(([key, val]) => `<div><span class="context-label">${escapeHtml(key)}:</span> <code>${escapeHtml(String(val))}</code></div>`)
                          .join("")}
                       </div>`
                    : ""
                }

                ${msg.context && typeof msg.context === "string" ? `<div class="context-data">${escapeHtml(msg.context)}</div>` : ""}

                ${msg.extract ? `<div class="code-snippet">${escapeHtml(msg.extract)}</div>` : ""}
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
  </main>

  <footer>
    <p>Report generated on ${new Date().toUTCString()} by <code>generate-html-validation-report.mjs</code></p>
    <p><a href="#" style="color: var(--primary); text-decoration: none;">↑ Back to top</a></p>
  </footer>
</body>
</html>
  `;

  fs.writeFileSync(OUTPUT_FILE, html);
  console.log(`✅ HTML Report generated at: ${OUTPUT_FILE}`);

  // Exit with error if there are validation errors
  if (totalErrors > 0) {
    process.exit(1);
  }
}

generateReport();
