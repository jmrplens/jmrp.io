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
 * Escapes HTML special characters.
 */
const escapeHtml = (str) =>
  str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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

const getActiveRules = () => {
  try {
    const allFiles = getAllHtmlFiles(DIST_DIR);
    const firstHtml = allFiles[0];
    if (!firstHtml) return {};

    const configJson = execFileSync(
      "pnpm",
      ["exec", "html-validate", "-c", CONFIG_FILE, "--print-config", firstHtml],
      {
        encoding: "utf-8",
        env: { ...process.env, PATH: "/usr/local/bin:/usr/bin:/bin" }, // NOSONAR
      },
    );
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
 * Builds a complete file list merging all HTML files with error-only results.
 * html-validate only reports files with issues, so we fill in passing files.
 * @param {string[]} allFiles - All HTML file paths in dist/
 * @param {Array} errorResults - Validation results (only files with issues)
 * @returns {Array<{filePath: string, valid: boolean, errorCount: number, warningCount: number, messages: Array}>}
 */
const buildCompleteResults = (allFiles, errorResults) => {
  // Index error results by normalized path for fast lookup
  const errorMap = new Map();
  for (const r of errorResults) {
    errorMap.set(r.filePath, r);
  }

  return allFiles
    .map((filePath) => {
      const errorResult = errorMap.get(filePath);
      if (errorResult) return errorResult;
      // File passed validation — synthesize a clean result
      return {
        filePath,
        valid: true,
        errorCount: 0,
        warningCount: 0,
        messages: [],
      };
    })
    .sort((a, b) => {
      // Invalid files first, then alphabetical
      if (a.valid !== b.valid) return a.valid ? 1 : -1;
      return a.filePath.localeCompare(b.filePath);
    });
};

/**
 * Renders the HTML report with complete file listing.
 * @param {Array} allResults - Complete array of all file validation results
 * @param {Record<string, unknown>} activeRules - Map of active rule names
 */
const generateHtml = (allResults, activeRules) => {
  const totalScannedFiles = allResults.length;
  const invalidFiles = allResults.filter((r) => !r.valid).length;
  const validFiles = totalScannedFiles - invalidFiles;
  const totalErrors = allResults.reduce((acc, r) => acc + r.errorCount, 0);
  const totalWarnings = allResults.reduce((acc, r) => acc + r.warningCount, 0);

  const statusClass = invalidFiles === 0 ? "status-success" : "status-danger";
  const statusText = invalidFiles === 0 ? "PASSED" : "FAILED";

  // Group errors by rule
  const ruleStats = {};
  allResults.forEach((r) => {
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

        .filter-bar {
            display: flex;
            gap: 0.75rem;
            margin-bottom: 1rem;
            align-items: center;
            flex-wrap: wrap;
        }
        .filter-bar input {
            flex: 1;
            min-width: 200px;
            padding: 0.5rem 0.75rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--card-bg);
            color: var(--text);
            font-size: 0.875rem;
        }
        .filter-btn {
            padding: 0.4rem 0.8rem;
            border: 1px solid var(--border);
            border-radius: 8px;
            background: var(--card-bg);
            color: var(--text-muted);
            cursor: pointer;
            font-size: 0.8rem;
            font-weight: 600;
            transition: all 0.15s;
        }
        .filter-btn.active, .filter-btn:hover {
            background: var(--primary);
            color: #fff;
            border-color: var(--primary);
        }
        .file-count {
            font-size: 0.8rem;
            color: var(--text-muted);
            margin-left: auto;
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
                <span class="stat-value">${totalScannedFiles}</span>
                <span class="stat-label">Files Scanned</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: var(--success)">${validFiles}</span>
                <span class="stat-label">Valid Files</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: ${invalidFiles > 0 ? "var(--danger)" : "var(--success)"}">${invalidFiles}</span>
                <span class="stat-label">Invalid Files</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: ${totalErrors > 0 ? "var(--danger)" : "var(--success)"}">${totalErrors}</span>
                <span class="stat-label">Total Errors</span>
            </div>
            <div class="stat-card">
                <span class="stat-value" style="color: ${totalWarnings > 0 ? "var(--warning)" : "var(--success)"}">${totalWarnings}</span>
                <span class="stat-label">Total Warnings</span>
            </div>
        </div>

        <div class="grid-main">
            <div class="results-area">
                <h2 class="section-title">📄 File Details</h2>
                <div class="filter-bar">
                    <input type="text" id="fileFilter" placeholder="Filter files..." oninput="filterFiles()">
                    <button class="filter-btn active" data-filter="all" onclick="setFilter('all')">All (${totalScannedFiles})</button>
                    ${invalidFiles > 0 ? `<button class="filter-btn" data-filter="invalid" onclick="setFilter('invalid')">Invalid (${invalidFiles})</button>` : ""}
                    <button class="filter-btn" data-filter="valid" onclick="setFilter('valid')">Valid (${validFiles})</button>
                    <span class="file-count" id="visibleCount">${totalScannedFiles} files</span>
                </div>
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
                        <tbody id="fileTableBody">
                            ${allResults
                              .map(
                                (r) => `
                                <tr data-status="${r.valid ? "valid" : "invalid"}">
                                    <td><span class="file-link">${escapeHtml(r.filePath.replace(DIST_DIR + "/", ""))}</span></td>
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
                            <span class="rule-name">${escapeHtml(rule)}</span>
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
                            <span class="active-rule">${escapeHtml(rule)}</span>
                        `,
                          )
                          .join("")}
                    </div>
                </div>
            </div>
        </div>

        <footer style="margin-top: 3rem; text-align: center; color: var(--text-muted); font-size: 0.875rem; border-top: 1px solid var(--border); padding-top: 1rem;">
            <a href="../" style="color: var(--primary); text-decoration: none; font-weight: 600;">← Back to Dashboard</a>
            <div style="margin-top: 0.5rem;">Generated on ${new Date().toISOString()} | html-validate engine</div>
        </footer>
    </div>
    <script>
        let currentFilter = 'all';
        function filterFiles() {
            const query = document.getElementById('fileFilter').value.toLowerCase();
            const rows = document.querySelectorAll('#fileTableBody tr');
            let visible = 0;
            rows.forEach(row => {
                const text = row.querySelector('.file-link')?.textContent?.toLowerCase() || '';
                const status = row.getAttribute('data-status');
                const matchesFilter = currentFilter === 'all' || status === currentFilter;
                const matchesQuery = !query || text.includes(query);
                const show = matchesFilter && matchesQuery;
                row.style.display = show ? '' : 'none';
                if (show) visible++;
            });
            document.getElementById('visibleCount').textContent = visible + ' files';
        }
        function setFilter(filter) {
            currentFilter = filter;
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
            });
            filterFiles();
        }
    </script>
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

  // Support both array-shaped reports and { results: [...] } objects
  let results;
  if (Array.isArray(report)) {
    results = report;
  } else if (Array.isArray(report.results)) {
    results = report.results;
  } else {
    console.error(
      "❌ Invalid validation report format. Expected an array or an object with a 'results' array.",
    );
    process.exit(1);
  }

  // Get all HTML files in dist/ and merge with error-only results
  // html-validate only includes files with errors/warnings in its JSON output
  const allHtmlFiles = getAllHtmlFiles(DIST_DIR);
  console.log(`📁 Found ${allHtmlFiles.length} HTML files in ${DIST_DIR}/`);
  console.log(
    `📊 ${results.length} files with issues, ${allHtmlFiles.length - results.length} clean`,
  );

  const allResults = buildCompleteResults(allHtmlFiles, results);
  const activeRules = getActiveRules();
  const html = generateHtml(allResults, activeRules);

  fs.writeFileSync(OUTPUT_FILE, html, "utf-8");
  console.log(`✅ HTML report generated at ${OUTPUT_FILE}`);
};

main();
