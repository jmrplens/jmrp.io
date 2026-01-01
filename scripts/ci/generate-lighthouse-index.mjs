import fs from "fs";
import path from "path";

const deployDir = process.argv[2] || "lh-deploy";
const manifestPath = path.join(deployDir, "manifest.json");
const indexPath = path.join(deployDir, "index.html");

if (!fs.existsSync(manifestPath)) {
  console.error(`Manifest not found at ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  const manifestContent = fs.readFileSync(manifestPath, "utf8");
  manifest = JSON.parse(manifestContent);
} catch (error) {
  console.error(
    `Failed to parse manifest JSON at ${manifestPath}: ${error.message}`,
  );
  process.exit(1);
}

// 1. Group reports by URL
const groupedReports = {};
manifest.forEach((entry) => {
  if (!groupedReports[entry.url]) {
    groupedReports[entry.url] = [];
  }
  groupedReports[entry.url].push(entry);
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

const listItems = Object.entries(groupedReports)
  .map(([url, runs]) => {
    // 2. Calculate Averages
    let urlDisplay = url;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === "localhost") {
        urlDisplay = parsedUrl.pathname || "/";
      }
    } catch {
      // Keep original URL
    }

    // Categories to track
    const categories = [
      "performance",
      "accessibility",
      "best-practices",
      "seo",
    ];
    const totals = {
      performance: 0,
      accessibility: 0,
      "best-practices": 0,
      seo: 0,
    };
    const counts = {
      performance: 0,
      accessibility: 0,
      "best-practices": 0,
      seo: 0,
    };

    runs.forEach((run) => {
      if (run.summary) {
        categories.forEach((cat) => {
          if (typeof run.summary[cat] === "number") {
            totals[cat] += run.summary[cat];
            counts[cat]++;
          }
        });
      }
    });

    const averages = {};
    categories.forEach((cat) => {
      averages[cat] = counts[cat] > 0 ? totals[cat] / counts[cat] : 0;
    });

    // 3. Render Individual Runs List
    const runsHtml = runs
      .map((run, index) => {
        const filename = path.basename(run.htmlPath);
        const date = new Date().toLocaleTimeString(); // Start time isn't in manifest usually, so we just list them.

        let runBadges = "";
        if (run.summary) {
          runBadges = categories
            .map((cat) => {
              const val = run.summary[cat] || 0;
              return `<span class="mini-score ${getScoreClass(val)}">${formatScore(val)}</span>`;
            })
            .join("");
        }

        return `
          <a href="${escapeHtml(filename)}" class="run-item">
            <span class="run-name">Run #${index + 1}</span>
            <div class="run-scores">${runBadges}</div>
            <span class="run-link-text">Open Report &rarr;</span>
          </a>
        `;
      })
      .join("");

    // 4. Render Main Card
    return `
      <li class="report-card">
        <details>
          <summary>
            <div class="summary-header">
              <div class="url-container">
                <span class="url-path">${escapeHtml(urlDisplay)}</span>
                <span class="url-full">${escapeHtml(url)}</span>
              </div>
              <div class="average-scores">
                ${renderScoreBadge("Perf", averages.performance)}
                ${renderScoreBadge("A11y", averages.accessibility)}
                ${renderScoreBadge("Best", averages["best-practices"])}
                ${renderScoreBadge("SEO", averages.seo)}
              </div>
              <div class="toggle-icon">▼</div>
            </div>
          </summary>
          <div class="runs-list">
            <h4>Individual Runs (${runs.length})</h4>
            <div class="runs-grid">
                <div class="runs-header">
                    <span>Run</span>
                    <div class="header-scores">
                        <span>Perf</span><span>A11y</span><span>Best</span><span>SEO</span>
                    </div>
                    <span>Link</span>
                </div>
                ${runsHtml}
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
            max-width: 900px;
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
            gap: 1rem;
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
            padding: 1.25rem;
            transition: background 0.2s;
        }

        details > summary::-webkit-details-marker {
            display: none;
        }

        details > summary:hover {
            background-color: rgba(128, 128, 128, 0.05);
        }

        .summary-header {
            display: grid;
            grid-template-columns: 1fr auto auto;
            align-items: center;
            gap: 1rem;
        }

        .url-container {
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .url-path {
            font-size: 1.1rem;
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

        .average-scores {
            display: flex;
            gap: 0.75rem;
        }

        .score-badge {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            border: 3px solid transparent;
            font-weight: bold;
            position: relative;
        }

        .score-badge.pass { border-color: var(--score-pass); color: var(--score-pass); }
        .score-badge.avg { border-color: var(--score-avg); color: var(--score-avg); }
        .score-badge.fail { border-color: var(--score-fail); color: var(--score-fail); }

        .score-value { font-size: 1.1rem; line-height: 1; }
        .score-label { font-size: 0.6rem; text-transform: uppercase; margin-top: 2px; color: var(--text-muted); }

        .toggle-icon {
            font-size: 0.8rem;
            color: var(--text-muted);
            transition: transform 0.2s;
        }

        details[open] .toggle-icon {
            transform: rotate(180deg);
        }

        .runs-list {
            padding: 0 1.25rem 1.25rem;
            border-top: 1px solid var(--border-color);
            background-color: rgba(128, 128, 128, 0.02);
        }

        .runs-list h4 {
            margin: 1rem 0 0.5rem;
            font-size: 0.9rem;
            text-transform: uppercase;
            color: var(--text-muted);
            letter-spacing: 0.5px;
        }

        .runs-header {
            display: grid;
            grid-template-columns: 80px 1fr 100px;
            padding: 0.5rem;
            font-size: 0.8rem;
            font-weight: bold;
            color: var(--text-muted);
            border-bottom: 1px solid var(--border-color);
        }
        
        .header-scores {
            display: flex;
            justify-content: space-around;
            padding: 0 1rem;
        }

        .run-item {
            display: grid;
            grid-template-columns: 80px 1fr 100px;
            align-items: center;
            padding: 0.75rem 0.5rem;
            text-decoration: none;
            color: inherit;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.1s;
        }

        .run-item:last-child { border-bottom: none; }
        .run-item:hover { background-color: rgba(128, 128, 128, 0.05); }

        .run-name { font-weight: 500; font-size: 0.9rem; }
        
        .run-scores {
            display: flex;
            justify-content: space-around;
            padding: 0 1rem;
        }

        .mini-score {
            display: inline-block;
            width: 30px;
            text-align: center;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.85rem;
            padding: 2px 0;
        }
        
        .mini-score.pass { background-color: rgba(12, 206, 107, 0.15); color: var(--score-pass); }
        .mini-score.avg { background-color: rgba(255, 164, 0, 0.15); color: var(--score-avg); }
        .mini-score.fail { background-color: rgba(255, 78, 66, 0.15); color: var(--score-fail); }

        .run-link-text {
            font-size: 0.85rem;
            color: var(--primary);
            text-align: right;
        }

        @media (max-width: 600px) {
            .summary-header {
                grid-template-columns: 1fr auto;
            }
            .average-scores {
                grid-column: 1 / -1;
                justify-content: space-between;
                margin-top: 0.5rem;
            }
            .score-badge {
                width: 40px;
                height: 40px;
            }
            .score-value { font-size: 0.9rem; }
            .score-label { font-size: 0.5rem; }
            
            .runs-header { display: none; }
            .run-item {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 0.5rem;
            }
            .run-scores { width: 100%; justify-content: space-between; padding: 0; }
            .run-link-text { display: none; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔭 Lighthouse Reports Dashboard</h1>
        <p style="text-align: center; color: var(--text-muted); margin-top: -1.5rem; margin-bottom: 2rem;">
            Generated on ${new Date().toLocaleString()}
        </p>
        
        ${Object.keys(groupedReports).length === 0 ? '<p style="text-align: center;">No reports found.</p>' : ""}
        
        <ul>
            ${listItems}
        </ul>
    </div>
</body>
</html>
`;

fs.writeFileSync(indexPath, htmlContent);
console.log(
  `Generated index.html at ${indexPath} with ${Object.keys(groupedReports).length} URL groups.`,
);
