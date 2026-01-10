/**
 * Generate Schema.org Validation Report (HTML)
 */

import fs from "node:fs";

import { escapeHtml } from "../utils/html.mjs";

const REPORT_FILE = "schema-report.json";
const OUTPUT_FILE = "schema-report.html";

if (!fs.existsSync(REPORT_FILE)) {
  console.error("Schema report JSON not found.");
  process.exit(1);
}

let data;
try {
  data = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8"));
} catch (error) {
  console.error(
    `Failed to parse schema report JSON: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
const { summary, results } = data;

/**
 * Applies syntax highlighting to a JSON string or object for HTML display.
 *
 * @param json - The JSON content to highlight.
 * @returns HTML string with highlighted JSON.
 */
function syntaxHighlight(json) {
  if (typeof json !== "string") {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const strPattern = /("(\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/.source;
  const boolPattern = /\b(true|false|null)\b/.source;
  const numPattern = /-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?/.source;
  const jsonTokenRegex = new RegExp(
    `(${strPattern}|${boolPattern}|${numPattern})`,
    "g",
  );

  return json.replaceAll(jsonTokenRegex, function (match) {
    let cls = "number";
    if (match.startsWith('"')) {
      cls = match.endsWith(":") ? "key" : "string";
    } else if (/true|false/.test(match)) {
      cls = "boolean";
    } else if (/null/.test(match)) {
      cls = "null";
    }
    return '<span class="' + cls + '">' + match + "</span>";
  });
}

/**
 * Renders JSON data into a nested visual HTML structure.
 *
 * @param data - The data object to render.
 * @returns HTML string representing the data visually.
 */
function renderVisual(data) {
  if (data === null || data === undefined)
    return '<span class="v-null">null</span>';

  if (Array.isArray(data)) {
    if (data.length === 0) return '<span class="v-empty">[]</span>';

    const listItems = data
      .map((item) => `<div class="v-list-item">${renderVisual(item)}</div>`)
      .join("");
    return `<div class="v-list">${listItems}</div>`;
  }

  if (typeof data === "object") {
    const type = data["@type"];
    let html = '<div class="v-object">';

    if (type) {
      html += `<div class="v-type-badge">${escapeHtml(type)}</div>`;
    }

    const keys = Object.keys(data).filter(
      (k) => k !== "@context" && k !== "@type",
    );
    if (keys.length === 0) return html + "</div>";

    html += '<div class="v-props">';
    for (const key of keys) {
      html += `
                <div class="v-row">
                    <div class="v-key">${escapeHtml(key)}:</div>
                    <div class="v-val">${renderVisual(data[key])}</div>
                </div>`;
    }
    html += "</div></div>";
    return html;
  }

  // Primitive values
  if (typeof data === "string") {
    if (data.startsWith("http")) {
      const escapedUrl = escapeHtml(data);
      if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(data)) {
        return `<a href="${escapedUrl}" target="_blank"><img src="${escapedUrl}" class="v-img" loading="lazy" /></a>`;
      }
      return `<a href="${escapedUrl}" target="_blank" class="v-link">${escapedUrl}</a>`;
    }
    return `<span class="v-string">"${escapeHtml(data)}"</span>`;
  }

  return `<span class="v-prim">${escapeHtml(String(data))}</span>`;
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
            --warning-dark: #856404;
            --danger: #dc3545;
            --primary: #0d6efd;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
            --code-bg: #f1f3f5;
            
            /* Visual Schema Styles */
            --v-border: #e9ecef;
            --v-bg-obj: #ffffff;
            --v-key: #6c757d;
            --v-string: #212529;
            --v-prim: #0d6efd;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-body: #121212;
                --bg-card: #1e1e1e;
                --text-main: #e0e0e0;
                --text-muted: #a0a0a0;
                --border-color: #333333;
                --primary: #6ea8fe;
                --warning-dark: #ffc107; /* Brighter in dark mode */
                --shadow: 0 4px 6px rgba(0,0,0,0.3);
                --code-bg: #2d2d30;
                
                --v-border: #333;
                --v-bg-obj: #252526;
                --v-key: #a0a0a0;
                --v-string: #e0e0e0;
                --v-prim: #6ea8fe;
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
        
        .result-header { padding: 1rem; display: flex; align-items: center; justify-content: space-between; cursor: pointer; background: rgba(128,128,128,0.02); transition: background 0.2s; outline: none; }
        .result-header:hover { background: rgba(128,128,128,0.05); }
        .result-header:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
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
        
        .schema-tabs { display: flex; gap: 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-color); }
        .tab-btn { padding: 0.5rem 1rem; cursor: pointer; border: none; background: none; font-weight: 600; color: var(--text-muted); border-bottom: 2px solid transparent; }
        .tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
        
        pre { background: var(--code-bg); padding: 1rem; border-radius: 8px; overflow-x: auto; font-size: 0.85rem; border: 1px solid var(--border-color); margin: 0; }
        
        .visual-view { font-size: 0.9rem; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .v-object { border: 1px solid var(--v-border); background: var(--v-bg-obj); border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem; min-width: min-content; }
        .v-type-badge { display: inline-block; background: var(--primary); color: white; font-size: 0.7rem; font-weight: bold; padding: 0.1rem 0.4rem; border-radius: 4px; margin-bottom: 0.5rem; }
        .v-row { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
        .v-key { font-weight: 600; color: var(--v-key); min-width: 80px; flex-shrink: 0; }
        .v-val { flex: 1; overflow-wrap: break-word; word-break: break-all; color: var(--v-string); }
        .v-list { display: flex; flex-direction: column; gap: 0.5rem; padding-left: 0.5rem; border-left: 2px solid var(--v-border); overflow-x: auto; }
        .v-link { color: var(--primary); text-decoration: none; }
        .v-link:hover { text-decoration: underline; }
        .v-img { max-width: 100px; max-height: 100px; border-radius: 4px; border: 1px solid var(--v-border); display: block; margin-top: 0.25rem; }
        .v-prim { color: var(--v-prim); font-weight: 500; }

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
    <script>
        function switchTab(id, mode) {
            document.getElementById(id + '-visual').style.display = mode === 'visual' ? 'block' : 'none';
            document.getElementById(id + '-code').style.display = mode === 'code' ? 'block' : 'none';
            document.getElementById(id + '-btn-visual').classList.toggle('active', mode === 'visual');
            document.getElementById(id + '-btn-code').classList.toggle('active', mode === 'code');
        }
    </script>
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
                <div class="card-value" style="color: ${summary.totalWarnings > 0 ? "var(--warning-dark)" : "inherit"}">${summary.totalWarnings}</div>
            </div>
        </div>

        <div class="results-list">
            ${results
              .map((r, idx) => {
                let status = "warn";
                if (r.valid && r.warnings.length === 0) {
                  status = "pass";
                } else if (r.errors.length > 0) {
                  status = "fail";
                }

                let label = "Warning";
                if (status === "pass") {
                  label = "Valid";
                } else if (status === "fail") {
                  label = "Invalid";
                }

                const badgeClass = `status-${status}`;
                const uniqueId = `schema-${idx}`;

                let detailsHtml = "";

                // Issues Section
                if (status !== "pass") {
                  detailsHtml += '<div class="issues-section">';
                  for (const e of r.errors) {
                    detailsHtml += `
                            <div class="issue issue-error">
                                <div class="issue-type">❌ Error (Schema ${e.index + 1}: ${escapeHtml(e.type || "Unknown")})</div>
                                ${e.errors.map((msg) => `<div class="issue-msg">${escapeHtml(msg)}</div>`).join("")}
                            </div>`;
                  }
                  for (const w of r.warnings) {
                    detailsHtml += `
                            <div class="issue issue-warning">
                                <div class="issue-type">⚠️ Warning (Schema ${w.index + 1}: ${escapeHtml(w.type || "Unknown")})</div>
                                ${w.warnings.map((msg) => `<div class="issue-msg">${escapeHtml(msg)}</div>`).join("")}
                            </div>`;
                  }
                  detailsHtml += "</div>";
                }

                // Schemas View
                if (r.schemas && r.schemas.length > 0) {
                  detailsHtml += '<div class="schema-container">';
                  for (const [i, schema] of r.schemas.entries()) {
                    const schemaId = uniqueId + "-" + i;
                    detailsHtml += `
                            <div class="schema-block" style="margin-bottom: 2rem;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                                    <div style="font-weight:700; color:var(--text-muted);">Schema ${i + 1}: ${escapeHtml(schema["@type"] || "Unknown")}</div>
                                    <div class="schema-tabs" style="margin-bottom:0; border-bottom:none;">
                                        <button id="${schemaId}-btn-visual" class="tab-btn active" onclick="switchTab('${schemaId}', 'visual')">Visual</button>
                                        <button id="${schemaId}-btn-code" class="tab-btn" onclick="switchTab('${schemaId}', 'code')">JSON</button>
                                    </div>
                                </div>
                                
                                <div id="${schemaId}-visual" class="visual-view">
                                    ${renderVisual(schema)}
                                </div>
                                <div id="${schemaId}-code" style="display:none;">
                                    <pre>${syntaxHighlight(schema)}</pre>
                                </div>
                            </div>
                        `;
                  }
                  detailsHtml += "</div>";
                }

                return `
                    <details class="result-item">
                        <summary class="result-header">
                            <span class="page-name">${escapeHtml(r.file)}</span>
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
