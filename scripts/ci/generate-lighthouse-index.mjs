/**
 * Generate Lighthouse Reports Dashboard
 *
 * Scans a directory for Lighthouse JSON reports, groups them by URL,
 * Device, and Theme, and generates a unified HTML dashboard index.
 *
 * Usage: node generate-lighthouse-index.mjs <deploy-dir>
 */

import fs from "node:fs";
import path from "node:path";

const deployDir = process.argv[2] || "lh-deploy";
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(deployDir)) {
  console.error(`Deploy directory not found at ${deployDir}`);
  process.exit(1);
}

// Helper: Scan for all JSON reports
function findReports(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findReports(filePath, fileList);
    } else if (
      file.endsWith(".json") &&
      !file.includes("manifest") &&
      !file.includes("links")
    ) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const jsonFiles = findReports(deployDir);
const reports = [];

jsonFiles.forEach((filePath) => {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const json = JSON.parse(content);

    const lowerPath = filePath.toLowerCase();
    let theme = "unknown";
    if (lowerPath.includes("/light/") || lowerPath.includes("\light\ "))
      theme = "light";
    if (lowerPath.includes("/dark/") || lowerPath.includes("\dark\ "))
      theme = "dark";

    if (json.lighthouseVersion && json.finalUrl) {
      let finalUrl = json.finalUrl;
      try {
        const parsed = new URL(finalUrl);
        if (parsed.hostname === "localhost") {
          finalUrl = parsed.pathname;
        }
      } catch (e) {}

      reports.push({
        filePath,
        fileName: path.basename(filePath),
        relativePath: path
          .relative(deployDir, filePath)
          .replace(".json", ".html"),
        url: finalUrl, // Normalized URL
        formFactor: json.configSettings?.formFactor || "mobile",
        theme: theme,
        scores: {
          performance: json.categories.performance?.score || 0,
          accessibility: json.categories.accessibility?.score || 0,
          "best-practices": json.categories["best-practices"]?.score || 0,
          seo: json.categories.seo?.score || 0,
        },
      });
    }
  } catch (e) {
    console.warn(`Skipping: ${filePath}`);
  }
});

// Grouping: URL -> FormFactor -> Theme -> Runs
const grouped = {};

reports.forEach((r) => {
  if (!grouped[r.url])
    grouped[r.url] = {
      mobile: { light: [], dark: [] },
      desktop: { light: [], dark: [] },
    };

  if (grouped[r.url][r.formFactor] && grouped[r.url][r.formFactor][r.theme]) {
    grouped[r.url][r.formFactor][r.theme].push(r);
  }
});

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getScoreClass(score) {
  if (score >= 0.9) return "pass";
  if (score >= 0.5) return "avg";
  return "fail";
}

function formatScore(score) {
  return Math.round(score * 100);
}

function renderScoreBadge(label, score) {
  const cls = getScoreClass(score);
  return `
    <div class="score-badge ${cls}" title="${label}">
      <span class="score-value">${formatScore(score)}</span>
      <span class="score-label">${label}</span>
    </div>
  `;
}

function calculateAverage(runList, category) {
  if (!runList || runList.length === 0) return 0;
  const total = runList.reduce((sum, r) => sum + r.scores[category], 0);
  return total / runList.length;
}

const listItems = Object.entries(grouped)
  .sort()
  .map(([url, devices]) => {
    let urlDisplay = url;
    // url is already normalized path (e.g. "/" or "/blog/")

    const cats = ["performance", "accessibility", "best-practices", "seo"];

    // --- Device Block Renderer ---
    const renderDeviceBlock = (deviceType, label, icon) => {
      const data = devices[deviceType];
      const lightRuns = data.light;
      const darkRuns = data.dark;
      const allRuns = [...lightRuns, ...darkRuns];

      if (allRuns.length === 0) return "";

      // Top-level averages (Combined)
      const avgs = {};
      cats.forEach((c) => (avgs[c] = calculateAverage(allRuns, c)));

      // Sub-list Renderer
      const renderSubList = (title, runs) => {
        if (runs.length === 0) return "";
        const runRows = runs
          .map((run, idx) => {
            const badges = cats
              .map(
                (c) =>
                  `<span class="mini-score ${getScoreClass(run.scores[c])}">${formatScore(run.scores[c])}</span>`,
              )
              .join("");
            return `
                    <a href="${run.relativePath}" class="run-item">
                        <span class="run-name">Run ${idx + 1}</span>
                        <div class="run-scores">${badges}</div>
                        <span class="run-arrow">→</span>
                    </a>
                `;
          })
          .join("");

        return `
                <div class="theme-group">
                    <h5 class="theme-title">${title}</h5>
                    <div class="runs-list">
                        ${runRows}
                    </div>
                </div>
            `;
      };

      return `
            <div class="device-card">
                <details>
                    <summary>
                        <div class="device-header">
                            <span class="device-title">${icon} ${label}</span>
                            <div class="toggle-icon">▼</div>
                        </div>
                        <div class="device-summary">
                            ${renderScoreBadge("Perf", avgs.performance)}
                            ${renderScoreBadge("A11y", avgs.accessibility)}
                            ${renderScoreBadge("Best", avgs["best-practices"])}
                            ${renderScoreBadge("SEO", avgs.seo)}
                        </div>
                        <div class="device-hint">View ${allRuns.length} Tests (Light & Dark)</div>
                    </summary>
                    <div class="device-details-content">
                        ${renderSubList("☀️ Light Mode", lightRuns)}
                        ${renderSubList("🌙 Dark Mode", darkRuns)}
                    </div>
                </details>
            </div>
        `;
    };

    return `
      <li class="report-card">
        <div class="card-header">
            <span class="url-path">${escapeHtml(urlDisplay)}</span>
        </div>
        <div class="devices-grid">
            ${renderDeviceBlock("mobile", "Mobile", "📱")}
            ${renderDeviceBlock("desktop", "Desktop", "🖥️")}
        </div>
      </li>
    `;
  })
  .join("\n");

const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lighthouse Reports Dashboard</title>
    <style>
        :root {
            --bg-body: #f8f9fa;
            --bg-card: #ffffff;
            --text-main: #212529;
            --text-muted: #6c757d;
            --border-color: #e9ecef;
            --primary: #0d6efd;
            --score-pass: #0cce6b;
            --score-avg: #ffa400;
            --score-fail: #ff4e42;
            --shadow: 0 4px 12px rgba(0,0,0,0.08);
            --hover-bg: rgba(0,0,0,0.02);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-body: #121212;
                --bg-card: #1e1e1e;
                --text-main: #e0e0e0;
                --text-muted: #a0a0a0;
                --border-color: #333333;
                --primary: #6ea8fe;
                --shadow: 0 4px 12px rgba(0,0,0,0.4);
                --hover-bg: rgba(255,255,255,0.05);
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

        .container { max-width: 1000px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 2rem; font-weight: 300; letter-spacing: -0.5px; }
        
        ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 2rem; }

        .report-card {
            background: var(--bg-card);
            border-radius: 16px;
            box-shadow: var(--shadow);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        .card-header {
            padding: 1.25rem 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background-color: var(--hover-bg);
            display: flex;
            flex-direction: column;
        }

        .url-path { font-size: 1.4rem; font-weight: 700; color: var(--primary); }
        .url-full { font-size: 0.85rem; color: var(--text-muted); font-family: monospace; opacity: 0.8; }

        .devices-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 1px;
            background-color: var(--border-color);
        }

        .device-card {
            background-color: var(--bg-card);
        }

        details > summary {
            list-style: none;
            cursor: pointer;
            padding: 1.5rem;
            transition: background 0.2s;
            position: relative;
        }
        details > summary::-webkit-details-marker { display: none; }
        details > summary:hover { background-color: var(--hover-bg); }

        .device-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1rem;
        }

        .device-title {
            font-size: 1.1rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-main);
        }

        .device-summary {
            display: flex;
            justify-content: center;
            gap: 1.5rem;
            margin-bottom: 0.5rem;
        }

        .device-hint {
            text-align: center;
            font-size: 0.75rem;
            color: var(--primary);
            font-weight: 500;
            margin-top: 1rem;
            opacity: 0;
            transition: opacity 0.2s;
        }
        details > summary:hover .device-hint { opacity: 1; }

        /* Badges */
        .score-badge {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 60px; height: 60px; border-radius: 50%;
            border: 4px solid transparent; font-weight: bold;
        }
        .score-badge.pass { border-color: var(--score-pass); color: var(--score-pass); }
        .score-badge.avg { border-color: var(--score-avg); color: var(--score-avg); }
        .score-badge.fail { border-color: var(--score-fail); color: var(--score-fail); }
        .score-value { font-size: 1.3rem; line-height: 1; }
        .score-label { font-size: 0.6rem; text-transform: uppercase; margin-top: 3px; color: var(--text-muted); }

        .toggle-icon {
            font-size: 0.8rem;
            color: var(--text-muted);
            transition: transform 0.2s;
        }
        details[open] .toggle-icon { transform: rotate(180deg); }
        details[open] .device-hint { display: none; }

        /* Expanded Content */
        .device-details-content {
            padding: 0 1.5rem 1.5rem;
            border-top: 1px solid var(--border-color);
            background-color: var(--hover-bg);
            animation: slideDown 0.2s ease-out;
        }

        @keyframes slideDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }

        .theme-group { margin-top: 1.5rem; }
        .theme-title {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin: 0 0 0.75rem;
            padding-bottom: 0.25rem;
            border-bottom: 2px solid var(--border-color);
            display: inline-block;
        }

        .runs-list { display: flex; flex-direction: column; gap: 0.5rem; }

        .run-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.75rem 1rem;
            background: var(--bg-card);
            border-radius: 8px;
            text-decoration: none;
            color: inherit;
            border: 1px solid var(--border-color);
            transition: all 0.1s;
        }
        .run-item:hover {
            transform: translateX(4px);
            border-color: var(--primary);
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }

        .run-name { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); width: 60px; }
        .run-scores { display: flex; gap: 0.75rem; flex: 1; justify-content: center; }
        
        .mini-score {
            display: inline-flex; align-items: center; justify-content: center;
            width: 32px; height: 32px; border-radius: 50%;
            font-size: 0.8rem; font-weight: 700;
        }
        .mini-score.pass { background-color: var(--score-pass); color: #fff; }
        .mini-score.avg { background-color: var(--score-avg); color: #fff; }
        .mini-score.fail { background-color: var(--score-fail); color: #fff; }

        .run-arrow { color: var(--primary); font-weight: bold; }

        @media (max-width: 650px) {
            .devices-grid { grid-template-columns: 1fr; }
            .url-path { font-size: 1.2rem; }
            .run-item { padding: 0.5rem; }
            .mini-score { width: 28px; height: 28px; font-size: 0.75rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔭 Lighthouse Reports Dashboard</h1>
        <p style="text-align: center; color: var(--text-muted); margin-top: -1.5rem; margin-bottom: 3rem;">
            Generated on ${new Date().toLocaleString()}
        </p>
        
        ${Object.keys(grouped).length === 0 ? '<p style="text-align: center;">No reports found in ' + deployDir + "</p>" : ""}
        
        <ul>
            ${listItems}
        </ul>
    </div>
</body>
</html>
`;

fs.writeFileSync(indexPath, htmlContent);
console.log(
  `Generated index.html at ${indexPath} with ${Object.keys(grouped).length} URLs.`,
);
