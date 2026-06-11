/**
 * Generate Accessibility Reports Dashboard
 *
 * Reads accessibility summary JSONs and per-page Axe HTML reports to generate
 * a visual dashboard with summary cards, per-page status tables, and issue
 * breakdowns — then links to individual detailed reports.
 *
 * Usage: node generate-accessibility-index.mjs <deploy-dir>
 */

import fs from "node:fs";
import path from "node:path";

import { escapeHtml } from "../utils/html.mjs";

const inputDir = process.argv[2] || "a11y-deploy";
const deployDir = path.resolve(process.cwd(), inputDir);

if (!deployDir.startsWith(process.cwd())) {
  console.error(
    `Error: Invalid deploy directory ${deployDir}. Must be within project root.`,
  );
  process.exit(1);
}

if (!fs.existsSync(deployDir)) {
  console.error(`Deploy directory not found at ${deployDir}`);
  process.exit(1);
}

const indexPath = path.join(deployDir, "index.html");

/**
 * Recursively scans a directory for files matching a predicate.
 * Skips symbolic links.
 *
 * @param {string} dir - Directory to scan.
 * @param {(file: string) => boolean} predicate - Function to filter files.
 * @param {string[]} fileList - Accumulator.
 * @returns {string[]} Matching file paths.
 */
function findFiles(dir, predicate, fileList = []) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) continue;
        if (stat.isDirectory()) {
          findFiles(filePath, predicate, fileList);
        } else if (predicate(file)) {
          fileList.push(filePath);
        }
      } catch (error) {
        console.warn(
          `⚠️  Error processing file ${file} in ${dir}:`,
          error.message,
        );
      }
    }
  } catch (error) {
    console.warn(`⚠️  Error reading directory ${dir}:`, error.message);
  }
  return fileList;
}

// ─── Load summary JSONs ────────────────────────────────────────────────────────

/** @typedef {{ id: string, impact: string, description: string, help: string, helpUrl: string, tags: string[], nodes: number }} A11yIssue */

/**
 * @typedef {{
 *   theme: string,
 *   totalPages: number,
 *   passed: number,
 *   failed: number,
 *   incomplete: number,
 *   violations: A11yIssue[],
 *   incompleteList: A11yIssue[],
 *   pages: Array<{ page: string, name: string, url: string, violations: number, incomplete: number, violationIds: string[], reportPath: string }>
 * }} A11ySummary
 */

/** @type {A11ySummary[]} */
const summaries = [];
const summaryFiles = findFiles(
  deployDir,
  (f) => f.startsWith("accessibility-summary-") && f.endsWith(".json"),
);

for (const sf of summaryFiles) {
  try {
    summaries.push(JSON.parse(fs.readFileSync(sf, "utf-8")));
  } catch (error) {
    console.warn(`⚠️  Error parsing ${sf}: ${error.message}`);
  }
}

/** @type {Record<string, A11ySummary>} */
const themeData = {};
for (const s of summaries) {
  themeData[s.theme] = s;
}
const themes = Object.keys(themeData).sort((a, b) => a.localeCompare(b));
const totalPages =
  summaries.reduce((max, s) => Math.max(max, s.totalPages), 0) || 0;
const totalViolationRules = summaries.reduce(
  (sum, s) => sum + (s.violations?.length || 0),
  0,
);
const totalViolationNodes = summaries.reduce(
  (sum, s) =>
    sum + (s.violations || []).reduce((n, v) => n + (v.nodes || 0), 0),
  0,
);
const totalIncompleteRules = summaries.reduce(
  (sum, s) => sum + (s.incompleteList?.length || 0),
  0,
);
const totalIncompleteNodes = summaries.reduce(
  (sum, s) =>
    sum + (s.incompleteList || []).reduce((n, v) => n + (v.nodes || 0), 0),
  0,
);
const pagesWithIssues = summaries.reduce(
  (sum, s) => sum + (s.pages || []).filter((p) => p.violations > 0).length,
  0,
);
const allPassed = summaries.every((s) => s.failed === 0);

// ─── Helper functions ──────────────────────────────────────────────────────────

/**
 * Returns status emoji for a page.
 *
 * @param {number} violations - Number of violations.
 * @param {number} incomplete - Number of incomplete checks.
 * @returns {string} Status emoji.
 */
const statusIcon = (violations, incomplete) => {
  if (violations > 0) return "❌";
  if (incomplete > 0) return "⚠️";
  return "✅";
};

/**
 * Generates an impact severity badge.
 *
 * @param {string} impact - Impact level.
 * @returns {string} HTML badge.
 */
const impactBadge = (impact) => {
  const colors = {
    critical: "#dc2626",
    serious: "#ea580c",
    moderate: "#d97706",
    minor: "#65a30d",
  };
  const color = colors[impact] || "#6b7280";
  return `<span class="impact-badge" style="background:${color};">${escapeHtml(impact)}</span>`;
};

/** Impact sort order (critical first). */
const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

/**
 * Renders a table of accessibility issues (violations or incomplete checks).
 *
 * @param {string} title - Section title.
 * @param {A11yIssue[]} items - List of issues.
 * @param {"violation"|"incomplete"} type - Issue type.
 * @returns {string} HTML string.
 */
const renderIssueTable = (title, items, type) => {
  if (!items || items.length === 0) return "";
  const icon = type === "violation" ? "🚨" : "⚠️";
  const totalNodes = items.reduce((s, i) => s + (i.nodes || 0), 0);

  const rows = [...items]
    .sort(
      (a, b) => (IMPACT_ORDER[a.impact] ?? 4) - (IMPACT_ORDER[b.impact] ?? 4),
    )
    .map(
      (item) => `
          <tr>
            <td class="cell-rule">${item.helpUrl ? `<a href="${escapeHtml(item.helpUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.id)}</a>` : escapeHtml(item.id)}</td>
            <td>${impactBadge(item.impact)}</td>
            <td class="cell-desc">${escapeHtml(item.description || item.help || "")}</td>
            <td class="cell-count">${item.nodes}</td>
          </tr>`,
    )
    .join("");

  return `
    <div class="issue-section">
      <h3>${icon} ${escapeHtml(title)} <span class="issue-count">${items.length} rules · ${totalNodes} nodes</span></h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Impact</th>
              <th>Description</th>
              <th class="cell-count">Nodes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
};

/**
 * Renders theme section with page table and issue details.
 *
 * @param {string} theme - Theme name (light/dark).
 * @returns {string} HTML for the theme section.
 */
const renderThemeSection = (theme) => {
  const data = themeData[theme];
  if (!data?.pages) return "";

  const themeIcon = theme === "light" ? "☀️" : "🌙";
  const themeDir = theme;
  const passRate =
    data.totalPages > 0 ? Math.round((data.passed / data.totalPages) * 100) : 0;

  const rows = [...data.pages]
    .sort((a, b) => {
      if (a.violations !== b.violations) return b.violations - a.violations;
      if (a.incomplete !== b.incomplete) return b.incomplete - a.incomplete;
      return a.name.localeCompare(b.name);
    })
    .map(
      (p) => `
        <tr>
          <td class="cell-status">${statusIcon(p.violations, p.incomplete)}</td>
          <td>${p.reportPath ? `<a href="${themeDir}/${escapeHtml(p.reportPath)}">${escapeHtml(p.name)}</a>` : escapeHtml(p.name)}</td>
          <td class="cell-url">${escapeHtml(p.url)}</td>
          <td class="cell-count" style="color:${p.violations > 0 ? "#dc2626" : "var(--text-muted)"};">${p.violations}</td>
          <td class="cell-count" style="color:${p.incomplete > 0 ? "#d97706" : "var(--text-muted)"};">${p.incomplete}</td>
        </tr>`,
    )
    .join("");

  return `
    <section class="theme-section">
      <div class="section-header">
        <h2>${themeIcon} ${theme.charAt(0).toUpperCase() + theme.slice(1)} Mode</h2>
        <div class="header-badges">
          <span class="badge" style="background:${data.failed === 0 ? "#16a34a" : "#dc2626"};">${passRate}% pass</span>
          <span class="badge badge-outline">${data.totalPages} pages</span>
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="cell-status"></th>
              <th>Page</th>
              <th class="cell-url">URL</th>
              <th class="cell-count">Violations</th>
              <th class="cell-count">Incomplete</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      ${renderIssueTable(`Violations — ${theme}`, data.violations, "violation")}
      ${renderIssueTable(`Incomplete checks — ${theme}`, data.incompleteList, "incomplete")}
    </section>`;
};

// ─── Generate HTML ─────────────────────────────────────────────────────────────

const htmlContent = `<!DOCTYPE html>
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
            --font-mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
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
            padding: 2rem 1rem;
            line-height: 1.5;
        }

        .container { max-width: 1100px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 2rem; }
        h1 { font-size: 2.2rem; margin: 0 0 0.5rem 0; letter-spacing: -1px; }
        .subtitle { color: var(--text-muted); font-size: 0.9rem; }

        .back-link {
            display: inline-block;
            margin-bottom: 1.5rem;
            color: var(--primary);
            text-decoration: none;
            font-size: 0.9rem;
        }
        .back-link:hover { text-decoration: underline; }

        /* ── Summary cards ── */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
            gap: 0.75rem;
            margin-bottom: 2.5rem;
        }
        .summary-card {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.25rem 1rem;
            text-align: center;
            box-shadow: var(--shadow);
        }
        .summary-card .value {
            font-size: 1.8rem;
            font-weight: 800;
            line-height: 1.1;
        }
        .summary-card .label {
            font-size: 0.72rem;
            color: var(--text-muted);
            margin-top: 0.25rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        /* ── Theme sections ── */
        .theme-section {
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            border-radius: 12px;
            padding: 1.5rem;
            margin-bottom: 2rem;
            box-shadow: var(--shadow);
        }
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 0.5rem;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 0.75rem;
            margin-bottom: 1rem;
        }
        .section-header h2 { margin: 0; font-size: 1.3rem; font-weight: 700; }
        .header-badges { display: flex; gap: 0.5rem; align-items: center; }
        .badge {
            color: #fff;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }
        .badge-outline {
            background: transparent !important;
            border: 1px solid var(--border-color);
            color: var(--text-muted);
        }

        /* ── Tables ── */
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        thead tr { border-bottom: 2px solid var(--border-color); text-align: left; }
        th { padding: 0.5rem; font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
        td { padding: 0.5rem; }
        tbody tr { border-bottom: 1px solid var(--border-color); }
        tbody tr:last-child { border-bottom: none; }
        tbody tr:hover { background: var(--hover-bg); }

        .cell-status { width: 2rem; text-align: center; }
        .cell-count { text-align: center; font-weight: 600; }
        .cell-url { font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted); }
        .cell-rule { font-family: var(--font-mono); font-size: 0.82rem; }
        .cell-desc { font-size: 0.82rem; }

        a { color: var(--primary); text-decoration: none; font-weight: 500; }
        a:hover { text-decoration: underline; }

        /* ── Issue sections ── */
        .issue-section { margin-top: 1.5rem; }
        .issue-section h3 {
            margin: 0 0 0.75rem 0;
            font-size: 1.05rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .issue-count {
            font-size: 0.75rem;
            font-weight: 400;
            color: var(--text-muted);
        }

        .impact-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 0.68rem;
            font-weight: 700;
            color: #fff;
            text-transform: uppercase;
            letter-spacing: 0.03em;
        }

        .empty-state {
            text-align: center;
            padding: 3rem;
            color: var(--text-muted);
            background: var(--bg-card);
            border-radius: 12px;
            border: 1px dashed var(--border-color);
        }

        @media (max-width: 600px) {
            h1 { font-size: 1.8rem; }
            .summary-grid { grid-template-columns: repeat(2, 1fr); }
            .cell-url { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <a href="../" class="back-link">← Back to Dashboard</a>
        <header>
            <h1>♿ Accessibility Report</h1>
            <div class="subtitle">WCAG 2.1 AA — axe-core audit · Generated ${new Date().toISOString().split("T", 1)[0]}</div>
        </header>

        <!-- Summary Cards -->
        <div class="summary-grid">
            <div class="summary-card">
                <div class="value" style="color:${allPassed ? "#16a34a" : "#dc2626"};">${allPassed ? "PASS" : "FAIL"}</div>
                <div class="label">Overall Status</div>
            </div>
            <div class="summary-card">
                <div class="value">${totalPages}</div>
                <div class="label">Pages / Theme</div>
            </div>
            <div class="summary-card">
                <div class="value">${themes.length}</div>
                <div class="label">Themes Tested</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color:${totalViolationRules > 0 ? "#dc2626" : "#16a34a"};">${totalViolationRules}</div>
                <div class="label">Violation Rules</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color:${totalViolationNodes > 0 ? "#dc2626" : "#16a34a"};">${totalViolationNodes}</div>
                <div class="label">Violation Nodes</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color:${totalIncompleteRules > 0 ? "#d97706" : "#16a34a"};">${totalIncompleteRules}</div>
                <div class="label">Incomplete Rules</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color:${totalIncompleteNodes > 0 ? "#d97706" : "#16a34a"};">${totalIncompleteNodes}</div>
                <div class="label">Incomplete Nodes</div>
            </div>
            <div class="summary-card">
                <div class="value" style="color:${pagesWithIssues > 0 ? "#dc2626" : "#16a34a"};">${pagesWithIssues}</div>
                <div class="label">Pages w/ Issues</div>
            </div>
        </div>

        <!-- Per-theme sections -->
        ${themes.length > 0 ? themes.map((t) => renderThemeSection(t)).join("") : '<div class="empty-state">No accessibility data found. Run tests first.</div>'}
    </div>
</body>
</html>`;

fs.writeFileSync(indexPath, htmlContent);
console.log(
  `Generated accessibility dashboard at ${indexPath} (${themes.length} themes, ${totalPages} pages)`,
);

// ─── Aggregation for CI comment ────────────────────────────────────────────────

const aggregatedSummaryFiles = findFiles(
  deployDir,
  (f) => f.startsWith("accessibility-summary-") && f.endsWith(".json"),
);

if (aggregatedSummaryFiles.length > 0) {
  const aggregatedReport = aggregatedSummaryFiles
    .map((file) => {
      try {
        return JSON.parse(fs.readFileSync(file, "utf-8"));
      } catch (error) {
        console.error(`Error parsing summary ${file}:`, error);
        return null;
      }
    })
    .filter(Boolean);

  const compatibilityReport = aggregatedReport.map((report) => ({
    ...report,
    incompleteCount: report.incomplete ?? 0,
    incomplete: report.incompleteList || [],
  }));

  fs.writeFileSync(
    "accessibility-report.json",
    JSON.stringify(compatibilityReport, null, 2),
  );
  console.log("Generated aggregated accessibility-report.json");
} else {
  console.warn(
    "No accessibility-summary-*.json files found. Comment generation might fail.",
  );
}
