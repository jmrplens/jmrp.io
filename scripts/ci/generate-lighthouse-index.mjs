import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "lh-deploy";
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(deployDir)) {
  console.error(`Deploy directory not found at ${deployDir}`);
  process.exit(1);
}

// Helper: Scan for all JSON reports in the directory (recursive)
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

    // Detect theme from path
    const lowerPath = filePath.toLowerCase();
    let theme = "unknown";
    if (lowerPath.includes("/light/") || lowerPath.includes("\\light\\"))
      theme = "light";
    if (lowerPath.includes("/dark/") || lowerPath.includes("\\dark\\"))
      theme = "dark";

    // Basic validation
    if (json.lighthouseVersion && json.finalUrl) {
      reports.push({
        filePath,
        fileName: path.basename(filePath),
        htmlName: path.basename(filePath).replace(".json", ".html"),
        // If the HTML file is in a subdirectory, we need the relative path from index.html
        // We assume index.html is at deployDir root.
        relativePath: path
          .relative(deployDir, filePath)
          .replace(".json", ".html"),
        url: json.finalUrl,
        formFactor: json.configSettings?.formFactor || "mobile",
        theme: theme,
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

// Grouping: URL -> Theme -> FormFactor -> Runs
const grouped = {};

reports.forEach((r) => {
  if (!grouped[r.url]) grouped[r.url] = {};
  if (!grouped[r.url][r.theme])
    grouped[r.url][r.theme] = { mobile: [], desktop: [] };

  if (grouped[r.url][r.theme][r.formFactor]) {
    grouped[r.url][r.theme][r.formFactor].push(r);
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
  .map(([url, themes]) => {
    let urlDisplay = url;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === "localhost") {
        urlDisplay = parsedUrl.pathname || "/";
      }
    } catch {} // Keep original

    const cats = ["performance", "accessibility", "best-practices", "seo"];

    // We render sections for each theme present
    const themeSections = Object.entries(themes)
      .sort()
      .map(([themeName, devices]) => {
        // Calculate averages
        const mobileAvgs = {};
        cats.forEach(
          (c) => (mobileAvgs[c] = calculateAverage(devices.mobile, c)),
        );
        const hasMobile = devices.mobile.length > 0;

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
                    <a href="${run.relativePath}" class="run-item">
                        <span class="run-name">Run #${idx + 1}</span>
                        <div class="run-scores">${badges}</div>
                        <span class="run-link-text">Open &rarr;</span>
                    </a>
                `;
            })
            .join("");
        };

        const themeIcon =
          themeName === "light" ? "☀️" : themeName === "dark" ? "🌙" : "❓";
        const themeLabel =
          themeName.charAt(0).toUpperCase() + themeName.slice(1);

        return `
            <div class="theme-section ${themeName}-theme">
                <div class="theme-header">
                    <span class="theme-title">${themeIcon} ${themeLabel} Mode</span>
                </div>
                <div class="device-summary-row">
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
                
                <div class="runs-list-collapsible">
                    <details>
                        <summary>View Individual Runs</summary>
                        <div class="runs-grid-container">
                            ${
                              hasMobile
                                ? `
                                <div class="device-column">
                                    <h4>Mobile Runs</h4>
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
                                    <h4>Desktop Runs</h4>
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
                    </details>
                </div>
            </div>
        `;
      })
      .join("");

    return `
      <li class="report-card">
        <div class="card-header">
            <div class="url-container">
                <span class="url-path">${escapeHtml(urlDisplay)}</span>
                <span class="url-full">${escapeHtml(url)}</span>
            </div>
        </div>
        <div class="themes-container">
            ${themeSections}
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
            --bg-theme-light: #fafafa;
            --bg-theme-dark: #2d2d30;
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
                --bg-theme-light: #3f3f46;
                --bg-theme-dark: #18181b;
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
        h1 { text-align: center; margin-bottom: 2rem; font-weight: 300; letter-spacing: -0.5px; }
        ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 2rem; }

        .report-card {
            background: var(--bg-card);
            border-radius: 12px;
            box-shadow: var(--shadow);
            overflow: hidden;
            border: 1px solid var(--border-color);
        }

        .card-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background-color: rgba(128, 128, 128, 0.02);
        }

        .url-path { font-size: 1.3rem; font-weight: 700; display: block; margin-bottom: 0.25rem; }
        .url-full { font-size: 0.85rem; color: var(--text-muted); font-family: monospace; word-break: break-all; }

        .themes-container { display: flex; flex-direction: column; }

        .theme-section {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
        }
        .theme-section:last-child { border-bottom: none; }

        .theme-header { margin-bottom: 1rem; }
        .theme-title { font-weight: bold; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); display: flex; align-items: center; gap: 0.5rem; }

        .device-summary-row {
            display: flex;
            gap: 3rem;
            flex-wrap: wrap;
            margin-bottom: 1.5rem;
        }

        .device-block { display: flex; flex-direction: column; gap: 0.75rem; }
        
        .device-label {
            font-size: 0.75rem; text-transform: uppercase; font-weight: bold;
            color: var(--text-muted); letter-spacing: 1px; border-left: 3px solid var(--primary);
            padding-left: 0.5rem;
        }

        .average-scores { display: flex; gap: 1rem; }

        .score-badge {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 60px; height: 60px; border-radius: 50%;
            border: 4px solid transparent; font-weight: bold;
        }
        .score-badge.pass { border-color: var(--score-pass); color: var(--score-pass); }
        .score-badge.avg { border-color: var(--score-avg); color: var(--score-avg); }
        .score-badge.fail { border-color: var(--score-fail); color: var(--score-fail); }
        .score-value { font-size: 1.3rem; line-height: 1; }
        .score-label { font-size: 0.6rem; text-transform: uppercase; margin-top: 2px; color: var(--text-muted); }

        .runs-list-collapsible details summary {
            cursor: pointer;
            color: var(--primary);
            font-size: 0.9rem;
            font-weight: 500;
            margin-bottom: 1rem;
            outline: none;
        }
        
        .runs-grid-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 2rem;
            background-color: rgba(128, 128, 128, 0.03);
            padding: 1rem;
            border-radius: 8px;
        }

        .device-column h4 { margin: 0 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; color: var(--text-muted); }
        .runs-header, .run-item {
            display: grid; grid-template-columns: 50px 1fr 50px; 
            padding: 0.5rem 0; font-size: 0.8rem; align-items: center;
            border-bottom: 1px solid var(--border-color);
        }
        .runs-header { font-weight: bold; color: var(--text-muted); border-bottom: 2px solid var(--border-color); }
        .run-item { text-decoration: none; color: inherit; }
        .run-item:last-child { border-bottom: none; }
        .run-item:hover { background-color: rgba(128, 128, 128, 0.05); }
        
        .header-scores, .run-scores { display: flex; justify-content: space-between; padding: 0 0.5rem; }
        .mini-score {
            display: inline-flex; align-items: center; justify-content: center;
            width: 28px; height: 28px; border-radius: 50%; font-weight: bold; font-size: 0.75rem;
        }
        .mini-score.pass { background-color: rgba(12, 206, 107, 0.15); color: var(--score-pass); }
        .mini-score.avg { background-color: rgba(255, 164, 0, 0.15); color: var(--score-avg); }
        .mini-score.fail { background-color: rgba(255, 78, 66, 0.15); color: var(--score-fail); }
        .run-link-text { color: var(--primary); text-align: right; }

        @media (max-width: 768px) {
            .device-summary-row { flex-direction: column; gap: 1.5rem; }
            .runs-grid-container { grid-template-columns: 1fr; }
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
