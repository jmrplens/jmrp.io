import fs from "fs";
import path from "path";

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
    if (lowerPath.includes("/light/") || lowerPath.includes("\\light\\"))
      theme = "light";
    if (lowerPath.includes("/dark/") || lowerPath.includes("\\dark\\"))
      theme = "dark";

    if (json.lighthouseVersion && json.finalUrl) {
      reports.push({
        filePath,
        fileName: path.basename(filePath),
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
      });
    }
  } catch (e) {
    console.warn(`Skipping: ${filePath}`);
  }
});

// Group by URL -> Env Key (e.g. "light-mobile")
const grouped = {};

reports.forEach((r) => {
  if (!grouped[r.url])
    grouped[r.url] = {
      "light-mobile": [],
      "light-desktop": [],
      "dark-mobile": [],
      "dark-desktop": [],
    };

  const key = `${r.theme}-${r.formFactor}`;
  if (grouped[r.url][key]) {
    grouped[r.url][key].push(r);
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
  .map(([url, envs]) => {
    let urlDisplay = url;
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.hostname === "localhost") {
        urlDisplay = parsedUrl.pathname || "/";
      }
    } catch {} // Keep original

    const cats = ["performance", "accessibility", "best-practices", "seo"];
    const envKeys = [
      "light-mobile",
      "light-desktop",
      "dark-mobile",
      "dark-desktop",
    ];
    const envLabels = {
      "light-mobile": "📱 Light Mobile",
      "light-desktop": "🖥️ Light Desktop",
      "dark-mobile": "📱 Dark Mobile",
      "dark-desktop": "🖥️ Dark Desktop",
    };

    const envBlocks = envKeys
      .map((key) => {
        const runs = envs[key];
        if (runs.length === 0) return "";

        const avgs = {};
        cats.forEach((c) => (avgs[c] = calculateAverage(runs, c)));

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
            <div class="env-card">
                <div class="env-header">
                    <span class="env-title">${envLabels[key]}</span>
                </div>
                <div class="env-summary">
                    ${renderScoreBadge("Perf", avgs.performance)}
                    ${renderScoreBadge("A11y", avgs.accessibility)}
                    ${renderScoreBadge("Best", avgs["best-practices"])}
                    ${renderScoreBadge("SEO", avgs.seo)}
                </div>
                <details class="runs-details">
                    <summary>Show Runs (${runs.length})</summary>
                    <div class="runs-list">
                        ${runRows}
                    </div>
                </details>
            </div>
        `;
      })
      .join("");

    return `
      <li class="report-card">
        <div class="card-header">
            <span class="url-path">${escapeHtml(urlDisplay)}</span>
            <span class="url-full">${escapeHtml(url)}</span>
        </div>
        <div class="envs-grid">
            ${envBlocks}
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
            --border-color: #dee2e6;
            --primary: #0d6efd;
            --score-pass: #0cce6b;
            --score-avg: #ffa400;
            --score-fail: #ff4e42;
            --shadow: 0 4px 6px rgba(0,0,0,0.05);
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

        .container { max-width: 1200px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 2rem; font-weight: 300; letter-spacing: -0.5px; }
        
        ul { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 2.5rem; }

        .report-card {
            background: var(--bg-card);
            border-radius: 16px;
            box-shadow: var(--shadow);
            border: 1px solid var(--border-color);
            overflow: hidden;
        }

        .card-header {
            padding: 1.5rem;
            border-bottom: 1px solid var(--border-color);
            background-color: rgba(128,128,128,0.03);
            display: flex;
            flex-direction: column;
            gap: 0.25rem;
        }

        .url-path { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
        .url-full { font-size: 0.85rem; color: var(--text-muted); font-family: monospace; }

        .envs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 1px; /* Borders via gap */
            background-color: var(--border-color); /* Lines between cells */
        }

        .env-card {
            background-color: var(--bg-card);
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.25rem;
        }

        .env-header { width: 100%; text-align: center; border-bottom: 2px solid rgba(128,128,128,0.1); padding-bottom: 0.75rem; margin-bottom: 0.5rem; }
        .env-title { font-weight: 700; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 1px; color: var(--text-muted); }

        .env-summary {
            display: flex;
            gap: 1rem;
            justify-content: center;
        }

        /* Large Badges */
        .score-badge {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            width: 65px; height: 65px; border-radius: 50%;
            border: 4px solid transparent; font-weight: bold;
        }
        .score-badge.pass { border-color: var(--score-pass); color: var(--score-pass); }
        .score-badge.avg { border-color: var(--score-avg); color: var(--score-avg); }
        .score-badge.fail { border-color: var(--score-fail); color: var(--score-fail); }
        .score-value { font-size: 1.4rem; line-height: 1; }
        .score-label { font-size: 0.6rem; text-transform: uppercase; margin-top: 3px; color: var(--text-muted); }

        .runs-details {
            width: 100%;
            margin-top: auto; /* Push to bottom */
        }

        .runs-details summary {
            cursor: pointer;
            text-align: center;
            color: var(--primary);
            font-size: 0.85rem;
            font-weight: 500;
            padding: 0.5rem;
            border-radius: 6px;
            transition: background 0.2s;
            list-style: none;
        }
        .runs-details summary:hover { background-color: rgba(128,128,128,0.05); }
        .runs-details summary::-webkit-details-marker { display: none; }

        .runs-list {
            margin-top: 1rem;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }

        .run-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.6rem 0.8rem;
            background: rgba(128,128,128,0.03);
            border-radius: 8px;
            text-decoration: none;
            color: inherit;
            transition: transform 0.1s, background 0.1s;
            border: 1px solid transparent;
        }
        
        .run-item:hover {
            background: rgba(128,128,128,0.06);
            transform: scale(1.01);
            border-color: rgba(128,128,128,0.1);
        }

        .run-name { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); }
        
        .run-scores { display: flex; gap: 0.5rem; }
        
        .mini-score {
            display: inline-flex; align-items: center; justify-content: center;
            width: 26px; height: 26px; border-radius: 50%;
            font-size: 0.75rem; font-weight: 700;
        }
        .mini-score.pass { background-color: var(--score-pass); color: #fff; }
        .mini-score.avg { background-color: var(--score-avg); color: #fff; }
        .mini-score.fail { background-color: var(--score-fail); color: #fff; }

        .run-arrow { font-size: 1rem; color: var(--text-muted); opacity: 0.5; }

        @media (max-width: 600px) {
            .envs-grid { grid-template-columns: 1fr; }
            .url-path { font-size: 1.2rem; }
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
