import fs from "fs";
import path from "path";

const JSON_REPORT = "html-validation.json";
const OUTPUT_FILE = "html-report.html";

function generateReport() {
  if (!fs.existsSync(JSON_REPORT)) {
    console.warn(`⚠️  ${JSON_REPORT} not found. Skipping HTML report generation.`);
    return;
  }

  let report;
  try {
    const content = fs.readFileSync(JSON_REPORT, "utf-8");
    if (!content.trim()) {
      // Empty file means no errors if the tool didn't crash, but usually it outputs an empty array or similar.
      // If we used `> file`, empty means no output?
      // html-validate json output is usually an object or array.
      // If it's truly empty, assume success (or handled elsewhere).
      report = []; 
    } else {
        report = JSON.parse(content);
    }
  } catch (e) {
    console.error("❌ Error parsing JSON report:", e);
    return;
  }

  // html-validate JSON format is typically an array of objects (one per file) or an object with "files" key.
  // We need to handle both just in case, but usually it's array of { filePath, messages, ... }
  // Actually, checking docs/output, it might be an array of result objects.
  
  const files = Array.isArray(report) ? report : (report.files || []);
  
  const totalErrors = files.reduce((acc, f) => acc + f.errorCount, 0);
  const totalWarnings = files.reduce((acc, f) => acc + f.warningCount, 0);
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
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px; background: #f9f9f9; color: #333; }
    header { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; text-align: center; }
    h1 { margin: 0 0 10px 0; }
    .summary { display: flex; justify-content: center; gap: 20px; font-size: 1.2em; }
    .badge { padding: 5px 10px; border-radius: 4px; font-weight: bold; }
    .failed { color: #dc2626; background: #fee2e2; }
    .warning { color: #d97706; background: #fef3c7; }
    .passed { color: #16a34a; background: #dcfce7; }
    
    .file-card { background: white; margin-bottom: 15px; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .file-header { padding: 15px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
    .file-header:hover { background: #e5e7eb; }
    .file-path { font-family: monospace; font-weight: bold; }
    .file-stats { font-size: 0.9em; }
    
    .messages { padding: 0; margin: 0; list-style: none; }
    .message { padding: 15px; border-bottom: 1px solid #f3f4f6; display: flex; gap: 15px; }
    .message:last-child { border-bottom: none; }
    .severity { font-weight: bold; text-transform: uppercase; font-size: 0.8em; padding: 2px 6px; border-radius: 4px; height: fit-content; }
    .severity.error { background: #fee2e2; color: #dc2626; }
    .severity.warning { background: #fef3c7; color: #d97706; }
    .content { flex: 1; }
    .rule-link { color: #666; text-decoration: none; font-size: 0.9em; margin-left: 10px; }
    .rule-link:hover { text-decoration: underline; }
    .location { font-family: monospace; color: #666; margin-bottom: 5px; display: block; }
    .code-snippet { background: #1f2937; color: #e5e7eb; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: monospace; margin-top: 10px; font-size: 0.9em; }
    
    details > summary { list-style: none; }
    details[open] .file-header { border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <header>
    <h1>HTML Validation Report</h1>
    <div class="summary">
      <span class="badge ${statusClass}">${statusEmoji} ${statusText}</span>
      <span>${totalErrors} Errors</span>
      <span>${totalWarnings} Warnings</span>
      <span>${files.length} Files Checked</span>
    </div>
  </header>

  ${files.length === 0 ? '<div class="file-card"><div class="file-header" style="justify-content:center">No files checked or report empty.</div></div>' : ''}

  ${files.map(file => {
    if (file.messages.length === 0) return '';
    const fileStatus = file.errorCount > 0 ? "failed" : "warning";
    const fileEmoji = file.errorCount > 0 ? "🔴" : "⚠️";
    
    return `
    <details class="file-card" open>
      <summary class="file-header">
        <span class="file-path">${fileEmoji} ${file.filePath}</span>
        <span class="file-stats badge ${fileStatus}">${file.errorCount}E / ${file.warningCount}W</span>
      </summary>
      <ul class="messages">
        ${file.messages.map(msg => `
          <li class="message">
            <span class="severity ${msg.severity === 2 ? 'error' : 'warning'}">
              ${msg.severity === 2 ? 'ERR' : 'WARN'}
            </span>
            <div class="content">
              <span class="location">Line ${msg.line}, Col ${msg.column}</span>
              <strong class="message-text">${msg.message}</strong>
              <a href="https://html-validate.org/rules/${msg.ruleId}.html" target="_blank" class="rule-link">${msg.ruleId}</a>
              ${msg.context ? `<div class="code-snippet">${escapeHtml(msg.context)}</div>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </details>
    `;
  }).join('')}
  
  ${files.every(f => f.messages.length === 0) ? 
    `<div class="file-card"><div class="file-header" style="justify-content:center; color:green">✅ No issues found in ${files.length} files!</div></div>` 
    : ''}

</body>
</html>
  `;

  fs.writeFileSync(OUTPUT_FILE, html);
  console.log(`✅ HTML Report generated at: ${OUTPUT_FILE}`);
}

function escapeHtml(unsafe) {
    if (unsafe == null) return "";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

generateReport();
