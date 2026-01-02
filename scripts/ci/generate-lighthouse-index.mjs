import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "lh-deploy";
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(deployDir)) {
  console.error(`Deploy directory not found at ${deployDir}`);
  process.exit(1);
}

// Helper: Scan for all JSON reports in the directory (recursive or flat)
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
    // Basic validation to ensure it's a Lighthouse report
    if (json.lighthouseVersion && json.finalUrl) {
      reports.push({
        filePath,
        fileName: path.basename(filePath),
        htmlName: path.basename(filePath).replace(".json", ".html"),
        url: json.finalUrl,
        formFactor: json.configSettings?.formFactor || "mobile",
        scores: {
          performance: json.categories.performance?.score || 0,
          accessibility: json.categories.accessibility?.score || 0,
          "best-practices": json.categories["best-practices"]?.score || 0,
          seo: json.categories.seo?.score || 0,
        },
        timestamp: json.fetchTime,
      });
    }
  } catch (e) {
    console.warn(`Skipping invalid JSON file: ${filePath}`);
  }
});

// 1. Group reports by URL and Form Factor
const grouped = {};

reports.forEach((r) => {
  if (!grouped[r.url]) {
    grouped[r.url] = { mobile: [], desktop: [] };
  }
  if (grouped[r.url][r.formFactor]) {
    grouped[r.url][r.formFactor].push(r);
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
  .map(([url, devices]) => {
    let urlDisplay = url;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === "localhost") {
        urlDisplay = parsedUrl.pathname || "/";
      }
    } catch {
      // Keep original
    }

    const cats = ["performance", "accessibility", "best-practices", "seo"];

    // Calculate averages for Mobile
    const mobileAvgs = {};
    cats.forEach((c) => (mobileAvgs[c] = calculateAverage(devices.mobile, c)));
    const hasMobile = devices.mobile.length > 0;

    // Calculate averages for Desktop
    const desktopAvgs = {};
    cats.forEach(
      (c) => (desktopAvgs[c] = calculateAverage(devices.desktop, c)),
    );
    const hasDesktop = devices.desktop.length > 0;

    const renderRunRows = (runList) => {
      return runList
        .map((run, idx) => {
          const badges = cats
            .map(
              (c) =>
                `<span class="mini-score ${getScoreClass(run.scores[c])}">${formatScore(run.scores[c])}</span>`,
            )
            .join("");
          return `
                <a href="${run.htmlName}" class="run-item">
                    <span class="run-name">Run #${idx + 1}</span>
                    <div class="run-scores">${badges}</div>
                    <span class="run-link-text">Open &rarr;</span>
                </a>
            `;
        })
        .join("");
    };

    return `
      <li class="report-card">
        <details>
          <summary>
            <div class="summary-header">
              <div class="url-container">
                <span class="url-path">${escapeHtml(urlDisplay)}</span>
                <span class="url-full">${escapeHtml(url)}</span>
              </div>
              <div class="device-summary">
                ${
                  hasMobile
                    ? `
                    <div class="device-block">
                        <span class="device-label">Mobile</span>
                        <div class="average-scores">
                            ${renderScoreBadge("Perf", mobileAvgs.performance)}
                            ${renderScoreBadge("A11y", mobileAvgs.accessibility)}
                            ${renderScoreBadge("Best", mobileAvgs["best-practices"])}
                            ${renderScoreBadge("SEO", mobileAvgs.seo)}
                        </div>
                    </div>
                `
                    : ""
                }
                ${
                  hasDesktop
                    ? `
                    <div class="device-block desktop-block">
                        <span class="device-label">Desktop</span>
                        <div class="average-scores">
                            ${renderScoreBadge("Perf", desktopAvgs.performance)}
                            ${renderScoreBadge("A11y", desktopAvgs.accessibility)}
                            ${renderScoreBadge("Best", desktopAvgs["best-practices"])}
                            ${renderScoreBadge("SEO", desktopAvgs.seo)}
                        </div>
                    </div>
                `
                    : ""
                }
              </div>
              <div class="toggle-icon">▼</div>
            </div>
          </summary>
          <div class="runs-list">
            <div class="runs-grid-container">
                ${
                  hasMobile
                    ? `
                    <div class="device-column">
                        <h4>Mobile Runs (${devices.mobile.length})</h4>
                        <div class="runs-header">
                            <span>Run</span>
                            <div class="header-scores"><span>P</span><span>A</span><span>B</span><span>S</span></div>
                            <span>Link</span>
                        </div>
                        ${renderRunRows(devices.mobile)}
                    </div>
                `
                    : ""
                }
                
                ${
                  hasDesktop
                    ? `
                    <div class="device-column">
                        <h4>Desktop Runs (${devices.desktop.length})</h4>
                        <div class="runs-header">
                            <span>Run</span>
                            <div class="header-scores"><span>P</span><span>A</span><span>B</span><span>S</span></div>
                            <span>Link</span>
                        </div>
                        ${renderRunRows(devices.desktop)}
                    </div>
                `
                    : ""
                }
            </div>
          </div>
        </details>
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
            --bg-body: #f4f4f9;
            --bg-card: #ffffff;
            --text-main: #333333;
            --text-muted: #666666;
            --border-color: #e0e0e0;
            --primary: #2563eb;
            --score-pass: #0cce6b;
            --score-avg: #ffa400;
            --score-fail: #ff4e42;
            --shadow: 0 2px 5px rgba(0,0,0,0.05);
        }

        @media (prefers-color-scheme: dark) {
            :root {
                --bg-body: #18181b;
                --bg-card: #27272a;
                --text-main: #e4e4e7;
                --text-muted: #a1a1aa;
                --border-color: #3f3f46;
                --primary: #60a5fa;
                --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
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

        .container {
            max-width: 1100px;
            margin: 0 auto;
        }

        h1 {
            text-align: center;
            margin-bottom: 2rem;
            font-weight: 300;
            letter-spacing: -0.5px;
        }

        ul {
            list-style: none;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }

        .report-card {
            background: var(--bg-card);
            border-radius: 12px;
            box-shadow: var(--shadow);
            overflow: hidden;
            border: 1px solid var(--border-color);
        }

        details > summary {
            list-style: none;
            cursor: pointer;
            padding: 1.5rem;
            transition: background 0.2s;
        }

        details > summary::-webkit-details-marker { display: none; }
        details > summary:hover { background-color: rgba(128, 128, 128, 0.05); }

        .summary-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
        }

        .url-container {
            flex: 1;
            min-width: 200px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .url-path {
            font-size: 1.2rem;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .url-full {
            font-size: 0.85rem;
            color: var(--text-muted);
            font-family: monospace;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .device-summary {
            display: flex;
            gap: 2rem;
            align-items: center;
        }

        .device-block {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
        }
        
        .desktop-block {
            border-left: 1px solid var(--border-color);
            padding-left: 2rem;
        }

        .device-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: bold;
            color: var(--text-muted);
            letter-spacing: 1px;
        }

        .average-scores {
            display: flex;
            gap: 1rem;
        }

        /* Increased size as requested */
        .score-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 65px;
            height: 65px;
            border-radius: 50%;
            border: 4px solid transparent;
            font-weight: bold;
            position: relative;
        }

        .score-badge.pass { border-color: var(--score-pass); color: var(--score-pass); }
        .score-badge.avg { border-color: var(--score-avg); color: var(--score-avg); }
        .score-badge.fail { border-color: var(--score-fail); color: var(--score-fail); }

        .score-value { font-size: 1.4rem; line-height: 1; }
        .score-label { font-size: 0.65rem; text-transform: uppercase; margin-top: 4px; color: var(--text-muted); }

        .toggle-icon {
            font-size: 0.8rem;
            color: var(--text-muted);
            transition: transform 0.2s;
            margin-left: 1rem;
        }

        details[open] .toggle-icon { transform: rotate(180deg); }

        .runs-list {
            padding: 0;
            border-top: 1px solid var(--border-color);
            background-color: rgba(128, 128, 128, 0.02);
        }

        .runs-grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 0; 
        }
        
        .device-column {
            padding: 1.5rem;
        }
        
        .device-column:not(:last-child) {
            border-right: 1px solid var(--border-color);
        }

        .device-column h4 {
            margin: 0 0 1rem;
            font-size: 0.9rem;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.5px;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 0.5rem;
            display: inline-block;
        }

        .runs-header {
            display: grid;
            grid-template-columns: 60px 1fr 60px;
            padding: 0.5rem 0;
            font-size: 0.75rem;
            font-weight: bold;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border-color);
            text-transform: uppercase;
        }
        
        .header-scores {
            display: flex;
            justify-content: space-between;
            padding: 0 1rem;
        }

        .run-item {
            display: grid;
            grid-template-columns: 60px 1fr 60px;
            align-items: center;
            padding: 0.75rem 0;
            text-decoration: none;
            color: inherit;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.1s;
        }

        .run-item:last-child { border-bottom: none; }
        .run-item:hover { background-color: rgba(128, 128, 128, 0.05); }

        .run-name { font-weight: 500; font-size: 0.85rem; }
        
        .run-scores {
            display: flex;
            justify-content: space-between;
            padding: 0 1rem;
        }

        .mini-score {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-weight: bold;
            font-size: 0.8rem;
        }
        
        .mini-score.pass { background-color: rgba(12, 206, 107, 0.15); color: var(--score-pass); }
        .mini-score.avg { background-color: rgba(255, 164, 0, 0.15); color: var(--score-avg); }
        .mini-score.fail { background-color: rgba(255, 78, 66, 0.15); color: var(--score-fail); }

        .run-link-text {
            font-size: 0.8rem;
            color: var(--primary);
            text-align: right;
        }

        @media (max-width: 800px) {
            .summary-header {
                flex-direction: column;
                align-items: stretch;
            }
            .device-summary {
                flex-direction: column;
                gap: 1rem;
                align-items: stretch;
            }
            .desktop-block {
                border-left: none;
                padding-left: 0;
                border-top: 1px dashed var(--border-color);
                padding-top: 1rem;
            }
            .device-block {
                flex-direction: row;
                justify-content: space-between;
            }
            .average-scores {
                justify-content: flex-end;
            }
            .score-badge {
                width: 50px;
                height: 50px;
                border-width: 3px;
            }
            .score-value { font-size: 1.1rem; }
            
            .runs-grid-container {
                grid-template-columns: 1fr;
            }
            .device-column:not(:last-child) {
                border-right: none;
                border-bottom: 1px solid var(--border-color);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔭 Lighthouse Reports Dashboard</h1>
        <p style="text-align: center; color: var(--text-muted); margin-top: -1.5rem; margin-bottom: 2rem;">
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
