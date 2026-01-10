/**
 * build-report-dashboard.mjs
 *
 * Consolidates all CI reports into a single folder structure and
 * generates a premium 'index.html' dashboard to navigate them.
 */

import fs from "node:fs";
import path from "node:path";

const DIST_REPORTS = "dist-reports";

// Ensure the target directory exists
if (fs.existsSync(DIST_REPORTS)) fs.rmSync(DIST_REPORTS, { recursive: true });
fs.mkdirSync(DIST_REPORTS);

/**
 * Safely copies a file or directory
 */
function copy(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`⚠️ Warning: Source not found for copy: ${src}`);
    return false;
  }
  const parent = path.dirname(dest);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
  return true;
}

// 1. Move Reports to structured folders
console.log("📂 Consolidating report files...");

const reports = [
  { id: "a11y", src: "a11y-deploy", dest: "a11y", main: "index.html" },
  {
    id: "html",
    src: "html-report.html",
    dest: "html/index.html",
    main: "index.html",
  },
  {
    id: "lychee",
    src: "lychee-report.html",
    dest: "lychee/index.html",
    main: "index.html",
  },
  {
    id: "rss",
    src: "dist/rss-preview.html",
    dest: "rss/index.html",
    main: "index.html",
  },
  {
    id: "schema",
    src: "schema-report.html",
    dest: "schema/index.html",
    main: "index.html",
  },
  {
    id: "images",
    src: "image-report.html",
    dest: "images/index.html",
    main: "index.html",
  },
  {
    id: "lighthouse",
    src: "lh-deploy",
    dest: "lighthouse",
    main: "index.html",
  },
];

const status = {};

for (const r of reports) {
  const success = copy(r.src, path.join(DIST_REPORTS, r.dest));
  status[r.id] = success;
}

// 1.5. Move Logs & Graph
if (fs.existsSync("logs")) {
  copy("logs", path.join(DIST_REPORTS, "logs"));
}
if (fs.existsSync("workflow-graph.png")) {
  fs.copyFileSync(
    "workflow-graph.png",
    path.join(DIST_REPORTS, "workflow-graph.png"),
  );
}

// 1.6. Load Workflow Data
let workflowData = { nodes: [], links: [] };
if (fs.existsSync("workflow-data.json")) {
  try {
    workflowData = JSON.parse(fs.readFileSync("workflow-data.json", "utf-8"));
  } catch (error) {
    console.error("Error loading workflow-data.json:", error);
  }
}

// 1.7. Tool label to ID mapping for logs
const labelToLogId = {
  "SA: Astro Check": "astro-check",
  "SA: Prettier": "prettier",
  "SA: ESLint": "eslint",
  "SA: Link Checker (Dist)": "lychee",
  "SA: Security Audit": "security-audit",
  "SA: JSDoc Coverage": "jsdoc-coverage",
  "SA: Stylelint": "stylelint",
  "Bundle Size Check": "bundle-size",
  "HTML Validation": "html-validation",
  "RSS Feed Validation": "rss-validation",
  "Schema.org JSON-LD Validation": "schema-validation",
};

// 2. Load JSON data for the dashboard summary
let accessibilityData = [];
if (fs.existsSync("accessibility-report.json")) {
  accessibilityData = JSON.parse(
    fs.readFileSync("accessibility-report.json", "utf-8"),
  );
}

let bundleStats = null;
if (fs.existsSync("bundle-analysis.json")) {
  bundleStats = JSON.parse(fs.readFileSync("bundle-analysis.json", "utf-8"));
}

let htmlValidation = null;
if (fs.existsSync("html-validation.json")) {
  htmlValidation = JSON.parse(fs.readFileSync("html-validation.json", "utf-8"));
}

let rssValidation = null;
if (fs.existsSync("rss-validation.json")) {
  rssValidation = JSON.parse(fs.readFileSync("rss-validation.json", "utf-8"));
}

// 3. Generate the Dashboard HTML
// 3. Health Score Calculation (Synchronized with update-ci-comment.mjs)
const saOutcomes = {
  astro: process.env.OUTCOME_ASTRO,
  prettier: process.env.OUTCOME_PRETTIER,
  eslint: process.env.OUTCOME_ESLINT,
  lychee: process.env.OUTCOME_LYCHEE,
  typos: process.env.OUTCOME_TYPOS,
  security: process.env.OUTCOME_SECURITY,
  snyk: process.env.OUTCOME_SNYK,
  sonar: process.env.OUTCOME_SONAR,
  jsdoc: process.env.OUTCOME_JSDOC,
  stylelint: process.env.OUTCOME_STYLELINT,
};

const qualityOutcomes = {
  a11y: process.env.OUTCOME_A11Y,
  html: process.env.OUTCOME_HTML,
  bundle: process.env.OUTCOME_BUNDLE,
  rss: process.env.OUTCOME_RSS,
  schema: process.env.OUTCOME_SCHEMA,
  image: process.env.OUTCOME_IMAGE,
  functional: process.env.OUTCOME_FUNCTIONAL,
};

const getHealthScore = () => {
  let score = 100;

  // Deduction for SA failures (-5 each)
  for (const key in saOutcomes) {
    if (saOutcomes[key] === "failure") score -= 5;
  }

  // Deduction for Quality failures (-10 each)
  for (const key in qualityOutcomes) {
    if (qualityOutcomes[key] === "failure") score -= 10;
  }

  // Finer deductions from JSON data
  if (accessibilityData.length > 0) {
    const totalViolations = accessibilityData.reduce(
      (acc, r) => acc + (r.violations?.length || 0),
      0,
    );
    score -= Math.min(20, totalViolations * 2);
  }

  if (htmlValidation) {
    const htmlErrors = htmlValidation.reduce(
      (acc, f) => acc + f.messages.filter((m) => m.severity === 2).length,
      0,
    );
    score -= Math.min(15, htmlErrors);
  }

  return Math.max(0, Math.min(100, score));
};

const healthScore = getHealthScore();
const timestamp = new Date().toLocaleString("en-US", {
  dateStyle: "full",
  timeStyle: "short",
});

let scoreColor = "#ef4444";
if (healthScore > 90) {
  scoreColor = "#10b981";
} else if (healthScore > 70) {
  scoreColor = "#f59e0b";
}

let conditionText = "need of maintenance";
if (healthScore > 90) {
  conditionText = "prime condition";
} else if (healthScore > 70) {
  conditionText = "good shape";
}

const getStatusClass = (res) => {
  if (res === "success") return "status-success";
  if (res === "failure") return "status-danger";
  return "status-warning";
};

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>JMRP CI Dashboard</title>
    <style>
        :root {
            --bg: #0f111a;
            --card-bg: rgba(23, 25, 35, 0.7);
            --border: rgba(255, 255, 255, 0.08);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
            --primary: #b389f5;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --font: 'Inter', system-ui, -apple-system, sans-serif;
        }

        /* Job Hit Areas */
        .job-hit-area {
            position: absolute;
            border: 2px solid transparent;
            border-radius: 6px;
            transition: all 0.2s;
            z-index: 10;
        }
        .job-hit-area:hover {
            border-color: var(--primary);
            background: rgba(179, 137, 245, 0.1);
        }

        /* Modal styling */
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.8);
            backdrop-filter: blur(4px);
        }
        .modal-content {
            background-color: #1e293b;
            margin: 5% auto;
            padding: 0;
            border: 1px solid var(--border);
            width: 80%;
            max-width: 1000px;
            border-radius: 12px;
            height: 80vh;
            display: flex;
            flex-direction: column;
        }
        .modal-header {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .modal-body {
            flex: 1;
            padding: 1.5rem;
            overflow-y: auto;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            white-space: pre-wrap;
            color: #e2e8f0;
        }
        .close { color: var(--text-muted); cursor: pointer; font-size: 1.5rem; }
        .close:hover { color: var(--text-main); }

        * { box-sizing: border-box; }
        body {
            background-color: var(--bg);
            color: var(--text-main);
            font-family: var(--font);
            margin: 0;
            display: flex;
            min-height: 100vh;
        }

        /* Sidebar */
        aside {
            width: 260px;
            background: rgba(15, 17, 26, 0.95);
            border-right: 1px solid var(--border);
            padding: 2rem;
            display: flex;
            flex-direction: column;
            gap: 2rem;
        }

        .logo {
            display: flex;
            align-items: center;
            gap: 1rem;
            font-weight: 800;
            font-size: 1.25rem;
            color: var(--primary);
        }

        nav { display: flex; flex-direction: column; gap: 0.5rem; }
        .nav-item {
            padding: 0.75rem 1rem;
            border-radius: 12px;
            text-decoration: none;
            color: var(--text-muted);
            font-size: 0.95rem;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .nav-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: var(--text-main);
        }
        .nav-item.active {
            background: rgba(179, 137, 245, 0.1);
            color: var(--primary);
            font-weight: 600;
        }

        /* Main Content */
        main {
            flex: 1;
            padding: 3rem;
            max-width: 1200px;
            margin: 0 auto;
        }

        header {
            margin-bottom: 3rem;
        }

        h1 { font-size: 2.5rem; margin: 0 0 0.5rem 0; letter-spacing: -1px; }
        .subtitle { color: var(--text-muted); }

        /* Summary Grid */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 2rem;
            margin-bottom: 3rem;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 1.5rem;
            transition: transform 0.2s, border-color 0.2s;
        }
        .card:hover { 
            transform: translateY(-4px); 
            border-color: rgba(179, 137, 245, 0.3);
        }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1.5rem;
        }
        .card-icon {
            font-size: 1.5rem;
            background: rgba(255, 255, 255, 0.03);
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 14px;
        }
        .status-badge {
            padding: 0.25rem 0.75rem;
            border-radius: 99px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .status-success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
        .status-warning { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
        .status-danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); }

        .card-title { font-size: 0.9rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        .card-value { font-size: 2rem; font-weight: 800; margin: 0.5rem 0; }
        
        .card-action {
            display: block;
            margin-top: 1.5rem;
            text-align: center;
            padding: 0.75rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            text-decoration: none;
            color: var(--primary);
            font-size: 0.9rem;
            font-weight: 600;
            transition: background 0.2s;
        }
        .card-action:hover { background: rgba(179, 137, 245, 0.15); }
        .card-action.disabled { opacity: 0.4; pointer-events: none; color: var(--text-muted); }

        /* Health Score Section */
        .health-section {
            background: linear-gradient(135deg, rgba(179, 137, 245, 0.1), rgba(23, 25, 35, 0.7));
            border: 1px solid var(--border);
            border-radius: 32px;
            padding: 3rem;
            display: flex;
            align-items: center;
            gap: 4rem;
            margin-bottom: 3rem;
        }

        .chart-container { position: relative; width: 160px; height: 160px; }
        .chart-svg { transform: rotate(-90deg); }
        .chart-bg { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 12; }
        .chart-progress {
            fill: none;
            stroke: ${scoreColor};
            stroke-width: 12;
            stroke-linecap: round;
            stroke-dasharray: 440;
            stroke-dashoffset: ${440 - (440 * healthScore) / 100};
            transition: stroke-dashoffset 1s ease-out;
        }
        .chart-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 2.5rem;
            font-weight: 900;
        }

        .health-info h2 { font-size: 1.75rem; margin: 0 0 1rem 0; }
        .health-info p { color: var(--text-muted); line-height: 1.6; max-width: 500px; }

        /* Data Tables */
        .details-section { margin-bottom: 3rem; }
        .table-wrapper {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            overflow: hidden;
        }
        table { width: 100%; border-collapse: collapse; text-align: left; }
        th { background: rgba(255,255,255,0.02); padding: 1.25rem 1.5rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; }
        td { padding: 1.25rem 1.5rem; border-top: 1px solid var(--border); font-size: 0.95rem; }
        
        .tag { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: rgba(255,255,255,0.05); }

        footer { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; }

        @media (max-width: 900px) {
            body { flex-direction: column; }
            aside { width: 100%; border-right: none; border-bottom: 1px solid var(--border); }
            .health-section { flex-direction: column; text-align: center; gap: 2rem; }
        }
    </style>
    <script>
        function openLog(job) {
            fetch('logs/' + job + '.log')
                .then(r => r.text())
                .then(t => {
                    document.getElementById('logTitle').innerText = job + ' log output';
                    document.getElementById('logContent').innerText = t;
                    document.getElementById('logModal').style.display = 'block';
                })
                .catch(e => {
                    alert('Log not found for ' + job);
                });
        }
        function closeLog() {
            document.getElementById('logModal').style.display = 'none';
        }
    </script>
</head>
<body>
    <aside>
        <div class="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            JMRP DEVOPS
        </div>
        <nav>
            <a href="#" class="nav-item active">Overview</a>
            <a href="lighthouse/" class="nav-item">Performance</a>
            <a href="a11y/" class="nav-item">Accessibility</a>
            <a href="html/" class="nav-item">Health Scan</a>
        </nav>
        <div style="margin-top: auto;">
             <div class="tag">BUILD #${process.env.GITHUB_RUN_NUMBER || "LOCAL"}</div>
        </div>
    </aside>

    <main>
        <header>
            <h1>CI Health Dashboard</h1>
            <div class="subtitle">Last audit performed on <b>${timestamp}</b></div>
        </header>
        <section class="health-section">
            <div class="chart-container">
                <svg class="chart-svg" width="160" height="160">
                    <circle class="chart-bg" cx="80" cy="80" r="70"></circle>
                    <circle class="chart-progress" cx="80" cy="80" r="70"></circle>
                </svg>
                <div class="chart-text">${healthScore}%</div>
            </div>
            <div class="health-info">
                <h2>Project Health Summary</h2>
                <p>
                    Your project is currently in <b>${conditionText}</b>. 
                    We've scanned performance, accessibility, and code quality across ${bundleStats?.fileCount || "multiple"} assets.
                </p>
            </div>
        </section>

        <div class="summary-grid">
            <!-- Accessibility -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">♿</div>
                    <span class="status-badge ${status.a11y ? "status-success" : "status-danger"}">${status.a11y ? "Audit Run" : "Failed"}</span>
                </div>
                <div class="card-title">Accessibility</div>
                <div class="card-value">${accessibilityData.reduce((a, r) => a + (r.failed || 0), 0) === 0 ? "Passed" : "Issues"}</div>
                <a href="a11y/" class="card-action ${status.a11y ? "" : "disabled"}">Open Detailed Report →</a>
            </div>

            <!-- HTML Validity -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">📄</div>
                    <span class="status-badge ${htmlValidation ? "status-success" : "status-warning"}">${htmlValidation ? "Completed" : "Skipped"}</span>
                </div>
                <div class="card-title">HTML5 Validation</div>
                <div class="card-value">${htmlValidation ? "Scan Done" : "N/A"}</div>
                <a href="html/" class="card-action ${status.html ? "" : "disabled"}">View Source Scan →</a>
            </div>

            <!-- RSS Status -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">📡</div>
                    <span class="status-badge ${rssValidation?.valid ? "status-success" : "status-danger"}">${rssValidation?.valid ? "Valid" : "Invalid"}</span>
                </div>
                <div class="card-title">RSS Feed</div>
                <div class="card-value">${rssValidation?.metadata?.items || 0} Items</div>
                <a href="rss/" class="card-action ${status.rss ? "" : "disabled"}">Preview Feed →</a>
            </div>

            <!-- lighthouse -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">⚡</div>
                    <span class="status-badge ${status.lighthouse ? "status-success" : "status-warning"}">${status.lighthouse ? "Ready" : "In Progress"}</span>
                </div>
                <div class="card-title">Performance (LH)</div>
                <div class="card-value">Core Web Vitals</div>
                <a href="lighthouse/" class="card-action ${status.lighthouse ? "" : "disabled"}">Audit Details →</a>
            </div>
        </div>

        <section class="details-section">
            <h2 style="font-size: 1.25rem; margin-bottom: 1.5rem;">Pipeline Status</h2>
            <div class="summary-grid">
               <!-- SA Status Card -->
               <div class="card" style="grid-column: span 2;">
                  <div class="card-title">Static Analysis Results</div>
                  <div class="table-wrapper" style="margin-top:1rem;">
                    <table>
                      <thead><tr><th>Tool</th><th>Status</th></tr></thead>
                      <tbody>
                        <tr><td>Astro Check</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.astro)}">${saOutcomes.astro || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('astro-check')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                        <tr><td>Prettier</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.prettier)}">${saOutcomes.prettier || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('prettier')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                        <tr><td>ESLint</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.eslint)}">${saOutcomes.eslint || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('eslint')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                        <tr><td>Stylelint</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.stylelint)}">${saOutcomes.stylelint || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('stylelint')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                        <tr><td>Link Checker</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.lychee)}">${saOutcomes.lychee || "Pending"}</span> ${status.lychee ? '<a href="lychee/" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">View Report</a>' : ""}</div></td></tr>
                        <tr><td>Spell Checker</td><td><span class="status-badge ${getStatusClass(saOutcomes.typos)}">${saOutcomes.typos || "Pending"}</span></td></tr>
                        <tr><td>Security Audit</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.security)}">${saOutcomes.security || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('security-audit')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                        <tr><td>Snyk Security</td><td><span class="status-badge ${getStatusClass(saOutcomes.snyk)}">${saOutcomes.snyk || "Pending"}</span></td></tr>
                        <tr><td>SonarQube</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.sonar)}">${saOutcomes.sonar || "Pending"}</span> <a href="https://sonarcloud.io/summary/new_code?id=jmrplens_jmrp.io" target="_blank" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">External</a></div></td></tr>
                        <tr><td>JSDoc Coverage</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(saOutcomes.jsdoc)}">${saOutcomes.jsdoc || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('jsdoc-coverage')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                      </tbody>
                    </table>
                  </div>
               </div>
                              <!-- Performance/Quality List -->
                <div class="card">
                   <div class="card-title">Assets & Build</div>
                   <div class="table-wrapper" style="margin-top:1rem;">
                     <table>
                       <tbody>
                         <tr><td>JS/CSS Size</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><b>${bundleStats?.readableTotalSize || "N/A"}</b> <a href="javascript:void(0)" onclick="openLog('bundle-size')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                         <tr><td>HTML Validation</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(qualityOutcomes.html)}">${qualityOutcomes.html || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('html-validation')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                         <tr><td>RSS Validation</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(qualityOutcomes.rss)}">${qualityOutcomes.rss || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('rss-validation')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                         <tr><td>JSON-LD Schema</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(qualityOutcomes.schema)}">${qualityOutcomes.schema || "Pending"}</span> <a href="javascript:void(0)" onclick="openLog('schema-validation')" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">Log</a></div></td></tr>
                         <tr><td>Image Check</td><td><div style="display:flex; align-items:center; gap:0.5rem;"><span class="status-badge ${getStatusClass(qualityOutcomes.image)}">${qualityOutcomes.image || "Pending"}</span> ${status.images ? '<a href="images/" style="font-size:0.8rem; color:var(--primary); text-decoration:none;">View Report</a>' : ""}</div></td></tr>
                         <tr><td>E2E Tests</td><td><span class="status-badge ${getStatusClass(qualityOutcomes.functional)}">${qualityOutcomes.functional || "Pending"}</span></td></tr>
                       </tbody>
                     </table>
                   </div>
                </div>
            </div>
        </section>

        <section class="details-section">
            <h2 style="font-size: 1.25rem; margin-bottom: 1.5rem;">Visual Workflow Status</h2>
            <div class="card" style="padding: 1.5rem; position: relative; overflow: auto; background: #0d1117; border-radius: 24px; border: 1px solid var(--border);">
                <div class="card-title" style="margin-bottom: 1.5rem;">Dynamic GitHub workflow graph</div>
                
                <div id="workflow-container" style="position: relative; width: ${workflowData.width || 800}px; height: ${workflowData.height || 600}px; margin: 0 auto; min-width: min-content;">
                    ${fs.existsSync(
  path.join(DIST_REPORTS, "workflow-graph.png"),
)
    ? '<img src="workflow-graph.png" style="display: block; width: 100%; height: 100%;" />'
    : '<div style="padding: 5rem; text-align: center; color: var(--text-muted);">Workflow graph image missing</div>'
  }
                    
                    ${(workflowData.nodes || [])
    .map((n) => {
      const logId = labelToLogId[n.label];
      return `
                        <div 
                          class="job-hit-area" 
                          style="left: ${n.x}px; top: ${n.y}px; width: ${n.width}px; height: ${n.height}px; cursor: ${logId ? "pointer" : "default"};"
                          title="${n.label} - Status: ${n.status}"
                          ${logId ? `onclick="openLog('${logId}')"` : ""}
                        ></div>
                      `;
    })
    .join("")}
                </div>
            </div>
        </section>

        <div id="logModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="logTitle" style="margin:0">Job Log</h3>
                    <span class="close" onclick="closeLog()">&times;</span>
                </div>
                <div id="logContent" class="modal-body"></div>
            </div>
        </div>

        <footer>
             Built with ❤️ for <b>jmrp.io</b> &bull; ${timestamp}
        </footer>
    </main>
</body>
</html>
`;

fs.writeFileSync(path.join(DIST_REPORTS, "index.html"), html);
console.log("✅ Dashboard generated at dist-reports/index.html");
