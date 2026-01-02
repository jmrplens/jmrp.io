/**
 * Generate Schema.org Validation Report (HTML)
 */

import fs from "fs";

const REPORT_FILE = "schema-report.json";
const OUTPUT_FILE = "schema-report.html";

if (!fs.existsSync(REPORT_FILE)) {
  console.error("Schema report JSON not found.");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
const { summary, results } = data;

function syntaxHighlight(json) {
  if (typeof json !== "string") {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return json.replace(
    /("(\u[a-zA-Z0-9]{4}|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = "number";
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = "key";
        } else {
          cls = "string";
        }
      } else if (/true|false/.test(match)) {
        cls = "boolean";
      } else if (/null/.test(match)) {
        cls = "null";
      }
      return '<span class="' + cls + '">' + match + "</span>";
    },
  );
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Schema.org Validation Report</title>
    <style>
        :root {
            --bg-body: #f8f9fa;
            --bg-card: #ffffff;
            --text-main: #212529;
            --text-muted: #6c757d;
            --border-color: #dee2e6;
            --success: #198754;
            --warning: #ffc107;
            --danger: #dc3545;
            --primary: #0d6efd;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
            --code-bg: #f1f3f5;
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
                --code-bg: #2d2d30;
            }
        }
        body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg-body); color: var(--text-main); margin: 0; padding: 2rem 1rem; line-height: 1.5; }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 2rem; font-weight: 300; }
        
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; }
        .card { background: var(--bg-card); padding: 1.5rem; border-radius: 12px; box-shadow: var(--shadow); border: 1px solid var(--border-color); text-align: center; }
        .card-label { text-transform: uppercase; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); }
        .card-value { font-size: 2.5rem; font-weight: 800; margin: 0.5rem 0; }
        
        .results-list { display: flex; flex-direction: column; gap: 1rem; }
        .result-item { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
        
        .result-header { padding: 1rem; display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: rgba(128,128,128,0.02); transition: background 0.2s; }
        .result-header:hover { background: rgba(128,128,128,0.05); }
        .page-name { font-weight: 600; font-family: monospace; font-size: 0.9rem; }
        .status-badge { padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; }
        .status-pass { background-color: rgba(25, 135, 84, 0.1); color: var(--success); }
        .status-fail { background-color: rgba(220, 53, 69, 0.1); color: var(--danger); }
        .status-warn { background-color: rgba(255, 193, 7, 0.1); color: #856404; }

        .details { padding: 1.5rem; border-top: 1px solid var(--border-color); display: none; animation: fadeIn 0.3s ease; }
        details[open] .details { display: block; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        
        .issue { margin-bottom: 0.75rem; padding: 0.75rem; border-radius: 6px; background: rgba(255,0,0,0.05); border-left: 4px solid var(--danger); }
        .issue-warning { background: rgba(255,193,7,0.05); border-left-color: var(--warning); }
        .issue-type { font-weight: 700; font-size: 0.85rem; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem; }
        .issue-msg { font-size: 0.9rem; color: var(--text-main); margin-left: 1.5rem; }

        .schema-viewer { margin-top: 1.5rem; }
        .schema-title { font-size: 0.9rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.25rem; display: inline-block; }
        
        pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; border: 1px solid var(--border-color); margin: 0; }
        
        /* Syntax Highlighting */
        .string { color: #22863a; }
        .number { color: #005cc5; }
        .boolean { color: #005cc5; }
        .null { color: #005cc5; }
        .key { color: #d73a49; }

        @media (prefers-color-scheme: dark) {
            .string { color: #7ee787; }
            .number { color: #79c0ff; }
            .boolean { color: #79c0ff; }
            .null { color: #79c0ff; }
            .key { color: #ff7b72; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏷️ Schema.org Report</h1>
        <p style="text-align: center; color: var(--text-muted); margin-bottom: 2rem;">Generated on ${new Date().toLocaleString()}</p>
        
        <div class="summary-grid">
            <div class="card">
                <div class="card-label">Total Pages</div>
                <div class="card-value">${summary.totalPages}</div>
            </div>
            <div class="card">
                <div class="card-label">Schemas Found</div>
                <div class="card-value">${summary.totalSchemas}</div>
            </div>
            <div class="card">
                <div class="card-label">Errors</div>
                <div class="card-value" style="color: ${summary.totalErrors > 0 ? "var(--danger)" : "var(--success)"}">${summary.totalErrors}</div>
            </div>
            <div class="card">
                <div class="card-label">Warnings</div>
                <div class="card-value" style="color: ${summary.totalWarnings > 0 ? "#ffc107" : "inherit"}">${summary.totalWarnings}</div>
            </div>
        </div>

        <div class="results-list">
            ${results
              .map((r) => {
                const status =
                  r.valid && r.warnings.length === 0
                    ? "pass"
                    : r.errors.length > 0
                      ? "fail"
                      : "warn";
                const label =
                  status === "pass"
                    ? "Valid"
                    : status === "fail"
                      ? "Invalid"
                      : "Warning";
                const badgeClass = `status-${status}`;

                let detailsHtml = "";

                // Issues Section
                if (status !== "pass") {
                  detailsHtml += '<div class="issues-section">';
                  r.errors.forEach((e) => {
                    detailsHtml += `
                            <div class="issue issue-error">
                                <div class="issue-type">❌ Error (Schema ${e.index + 1}: ${e.type})</div>
                                ${e.errors.map((msg) => `<div class="issue-msg">${msg}</div>`).join("")}
                            </div>`;
                  });
                  r.warnings.forEach((w) => {
                    detailsHtml += `
                            <div class="issue issue-warning">
                                <div class="issue-type">⚠️ Warning (Schema ${w.index + 1}: ${w.type})</div>
                                ${w.warnings.map((msg) => `<div class="issue-msg">${msg}</div>`).join("")}
                            </div>`;
                  });
                  detailsHtml += "</div>";
                }

                // Schemas View
                if (r.schemas && r.schemas.length > 0) {
                  detailsHtml += '<div class="schema-viewer">';
                  r.schemas.forEach((schema, i) => {
                    detailsHtml += `
                            <div class="schema-block" style="margin-bottom: 1.5rem;">
                                <div class="schema-title">Schema ${i + 1}: ${schema["@type"] || "Unknown"}</div>
                                <pre>${syntaxHighlight(schema)}</pre>
                            </div>
                        `;
                  });
                  detailsHtml += "</div>";
                }

                return `
                    <details class="result-item">
                        <summary class="result-header">
                            <span class="page-name">${r.file}</span>
                            <span class="status-badge ${badgeClass}">${label}</span>
                        </summary>
                        <div class="details">${detailsHtml}</div>
                    </details>
                `;
              })
              .join("")}
        </div>
    </div>
</body>
</html>
`;

fs.writeFileSync(OUTPUT_FILE, html);
console.log(`✅ Generated ${OUTPUT_FILE}`);
