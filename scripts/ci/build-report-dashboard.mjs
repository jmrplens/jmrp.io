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

// Note: workflow-graph.png is kept for fallback, but we now generate dynamic SVG

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

// 2.1 Load Lighthouse Data - FIXED: Load BOTH light AND dark themes
let lighthouseData = [];
const pages = [
  { name: "Home", urlPart: "localhost:40679/$", pathMatch: ":40679/" },
  { name: "Blog", urlPart: "/blog/", pathMatch: "/blog/" },
  { name: "CV", urlPart: "/cv/", pathMatch: "/cv/" },
  {
    name: "Publications",
    urlPart: "/publications/",
    pathMatch: "/publications/",
  },
];

/**
 * Helper to find performance score in manifest
 * @param {string} manifestPath - Path to manifest.json
 * @param {object} p - Page config with name and urlPart
 * @returns {number|null} Performance score 0-100 or null
 */
const findScore = (manifestPath, p) => {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const item = json.find((i) => {
      if (p.name === "Home") {
        return i.url.endsWith(":40679/") || i.url.endsWith(".io/");
      }
      return i.url.includes(p.pathMatch);
    });
    return item ? Math.round(item.summary.performance * 100) : null;
  } catch {
    return null;
  }
};

// Build comprehensive Lighthouse data from all 4 combinations
lighthouseData = pages.map((p) => {
  return {
    page: p.name,
    mobileLight: findScore(
      path.join("lh-deploy", "light", "mobile", "manifest.json"),
      p,
    ),
    mobileDark: findScore(
      path.join("lh-deploy", "dark", "mobile", "manifest.json"),
      p,
    ),
    desktopLight: findScore(
      path.join("lh-deploy", "light", "desktop", "manifest.json"),
      p,
    ),
    desktopDark: findScore(
      path.join("lh-deploy", "dark", "desktop", "manifest.json"),
      p,
    ),
  };
});

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
  if (res && res !== "pending") return "status-warning";
  return "status-neutral";
};

// Helper for LH badges
const getScoreBadge = (score) => {
  if (score === null || score === undefined)
    return '<span class="score-pill" style="background:var(--neutral)"></span>N/A';

  let colorStyle = "var(--success)";
  if (score < 50) colorStyle = "var(--danger)";
  else if (score < 90) colorStyle = "var(--warning)";

  return `<span class="score-pill" style="background-color:${colorStyle}; box-shadow: 0 0 8px ${colorStyle}66;"></span>${score}`;
};

// Workflow metadata from environment
const runNumber = process.env.GITHUB_RUN_NUMBER || "LOCAL";
const runId = process.env.GITHUB_RUN_ID || "";
const repository = process.env.GITHUB_REPOSITORY || "jmrplens/jmrp.io";
const workflowUrl = runId
  ? `https://github.com/${repository}/actions/runs/${runId}`
  : "#";

// Count job outcomes
const countOutcomes = (outcomes) => {
  let success = 0,
    failure = 0,
    other = 0;
  for (const key in outcomes) {
    if (outcomes[key] === "success") success++;
    else if (outcomes[key] === "failure") failure++;
    else other++;
  }
  return { success, failure, other };
};

const saStats = countOutcomes(saOutcomes);
const qualityStats = countOutcomes(qualityOutcomes);

// Load real workflow jobs data if available
let workflowJobs = [];
if (fs.existsSync("workflow-jobs.json")) {
  try {
    workflowJobs = JSON.parse(fs.readFileSync("workflow-jobs.json", "utf-8"));
    console.log(`📊 Loaded ${workflowJobs.length} jobs from workflow-jobs.json`);
  } catch (e) {
    console.warn("⚠️ Could not load workflow-jobs.json:", e.message);
  }
}

// Generate workflow visualization based on real GitHub Actions data
const generateWorkflowSVG = () => {
  // Map job names from GitHub API to short display names
  const jobNameMap = {
    "🚀 Initialize CI Report": { short: "Init", phase: 0 },
    "Build Artifact": { short: "Build", phase: 1 },
    // Phase 2: Static Analysis (needs: build)
    "SA: Astro Check": { short: "Astro", phase: 2 },
    "SA: Prettier": { short: "Prettier", phase: 2 },
    "SA: ESLint": { short: "ESLint", phase: 2 },
    "SA: Stylelint": { short: "Stylelint", phase: 2 },
    "SA: Link Checker (Dist)": { short: "Links", phase: 2 },
    "SA: Security Audit": { short: "Security", phase: 2 },
    "SA: JSDoc Coverage": { short: "JSDoc", phase: 2 },
    "SA: Spell Checker": { short: "Typos", phase: 2 },
    "SA: Snyk Security": { short: "Snyk", phase: 2 },
    "SA: SonarQube": { short: "Sonar", phase: 2 },
    // Phase 2: Quality checks (needs: build)
    "Bundle Size Check": { short: "Bundle", phase: 2 },
    "HTML Validation": { short: "HTML", phase: 2 },
    "RSS Feed Validation": { short: "RSS", phase: 2 },
    "Schema.org JSON-LD Validation": { short: "Schema", phase: 2 },
    "Image Optimization Check": { short: "Images", phase: 2 },
    "Functional Tests": { short: "E2E", phase: 2 },
    "Accessibility Tests (light mode)": { short: "A11y☀", phase: 2 },
    "Accessibility Tests (dark mode)": { short: "A11y🌙", phase: 2 },
    "LH Audit (light - mobile)": { short: "LH Mob☀", phase: 2 },
    "LH Audit (light - desktop)": { short: "LH Desk☀", phase: 2 },
    "LH Audit (dark - mobile)": { short: "LH Mob🌙", phase: 2 },
    "LH Audit (dark - desktop)": { short: "LH Desk🌙", phase: 2 },
    // Phase 3: Report aggregation
    "Static Analysis Report": { short: "SA Report", phase: 3 },
    "Accessibility Report": { short: "A11y Report", phase: 3 },
    "Lighthouse Report": { short: "LH Report", phase: 3 },
    // Phase 4: Deploy
    "🚀 Deploy CI Dashboard": { short: "Deploy", phase: 4 },
  };

  // Process real jobs or use fallback
  let processedJobs = [];

  if (workflowJobs.length > 0) {
    processedJobs = workflowJobs
      .filter(job => jobNameMap[job.name]) // Only jobs we know about
      .map(job => ({
        name: jobNameMap[job.name].short,
        fullName: job.name,
        status: job.conclusion || "pending",
        phase: jobNameMap[job.name].phase,
      }));
  } else {
    // Fallback to environment variables
    const fallbackJobs = [
      { name: "Init", status: "success", phase: 0 },
      { name: "Build", status: "success", phase: 1 },
      { name: "Astro", status: saOutcomes.astro || "pending", phase: 2 },
      { name: "Prettier", status: saOutcomes.prettier || "pending", phase: 2 },
      { name: "ESLint", status: saOutcomes.eslint || "pending", phase: 2 },
      { name: "Links", status: saOutcomes.lychee || "pending", phase: 2 },
      { name: "Typos", status: saOutcomes.typos || "pending", phase: 2 },
      { name: "HTML", status: qualityOutcomes.html || "pending", phase: 2 },
      { name: "Deploy", status: "success", phase: 4 },
    ];
    processedJobs = fallbackJobs;
  }

  // Group jobs by phase
  const phases = {};
  processedJobs.forEach(job => {
    if (!phases[job.phase]) phases[job.phase] = [];
    phases[job.phase].push(job);
  });

  // Layout configuration
  const nodeWidth = 75;
  const nodeHeight = 24;
  const phaseGap = 120;
  const rowGap = 30;
  const padding = 20;

  // Calculate phase positions
  const phaseKeys = Object.keys(phases).map(Number).sort((a, b) => a - b);
  const maxRows = Math.max(...phaseKeys.map(p => phases[p].length));
  const svgHeight = maxRows * rowGap + nodeHeight + padding * 2;
  const svgWidth = (phaseKeys.length) * phaseGap + nodeWidth + padding * 2;

  const getColor = (status) => {
    if (status === "success") return "#10b981";
    if (status === "failure") return "#ef4444";
    if (status === "skipped") return "#64748b";
    return "#f59e0b";
  };

  const lineColor = "#475569";
  let connections = [];
  let nodes = [];

  // Draw nodes for each phase
  phaseKeys.forEach((phaseNum, phaseIdx) => {
    const phaseJobs = phases[phaseNum];
    const phaseX = padding + phaseIdx * phaseGap;

    // Center jobs vertically in this phase
    const phaseHeight = phaseJobs.length * rowGap;
    const startY = padding + (svgHeight - padding * 2 - phaseHeight) / 2;

    phaseJobs.forEach((job, jobIdx) => {
      const x = phaseX;
      const y = startY + jobIdx * rowGap;
      const color = getColor(job.status);

      // Store position for connections
      job.x = x;
      job.y = y;

      nodes.push(`<g class="workflow-node" title="${job.fullName || job.name}">
        <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="4" 
              fill="${color}22" stroke="${color}" stroke-width="2"/>
        <text x="${x + nodeWidth / 2}" y="${y + nodeHeight / 2 + 4}" 
              text-anchor="middle" fill="${color}" font-size="9" font-weight="600">${job.name}</text>
      </g>`);
    });
  });

  // Draw connections between phases
  for (let i = 0; i < phaseKeys.length - 1; i++) {
    const currentPhase = phases[phaseKeys[i]];
    const nextPhase = phases[phaseKeys[i + 1]];

    // Calculate center points
    const currentCenterY = currentPhase.reduce((acc, j) => acc + j.y + nodeHeight / 2, 0) / currentPhase.length;
    const nextCenterY = nextPhase.reduce((acc, j) => acc + j.y + nodeHeight / 2, 0) / nextPhase.length;

    const fanOutX = currentPhase[0].x + nodeWidth + 10;
    const fanInX = nextPhase[0].x - 10;

    // Draw fan-out lines from current phase
    currentPhase.forEach(job => {
      connections.push(`<path d="M${job.x + nodeWidth},${job.y + nodeHeight / 2} L${fanOutX},${job.y + nodeHeight / 2}" stroke="${lineColor}" stroke-width="1" fill="none" opacity="0.5"/>`);
    });

    // Vertical connector on right side
    const currentYMin = Math.min(...currentPhase.map(j => j.y + nodeHeight / 2));
    const currentYMax = Math.max(...currentPhase.map(j => j.y + nodeHeight / 2));
    connections.push(`<path d="M${fanOutX},${currentYMin} L${fanOutX},${currentYMax}" stroke="${lineColor}" stroke-width="2" fill="none"/>`);

    // Horizontal connector between phases
    const midY = (currentCenterY + nextCenterY) / 2;
    connections.push(`<path d="M${fanOutX},${currentCenterY} L${fanInX},${nextCenterY}" stroke="${lineColor}" stroke-width="2" fill="none" marker-end="url(#arrow)"/>`);

    // Vertical connector on left side of next phase
    const nextYMin = Math.min(...nextPhase.map(j => j.y + nodeHeight / 2));
    const nextYMax = Math.max(...nextPhase.map(j => j.y + nodeHeight / 2));
    connections.push(`<path d="M${fanInX},${nextYMin} L${fanInX},${nextYMax}" stroke="${lineColor}" stroke-width="2" fill="none"/>`);

    // Draw fan-in lines to next phase
    nextPhase.forEach(job => {
      connections.push(`<path d="M${fanInX},${job.y + nodeHeight / 2} L${job.x},${job.y + nodeHeight / 2}" stroke="${lineColor}" stroke-width="1" fill="none" opacity="0.5"/>`);
    });
  }

  return `
    <svg width="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" class="workflow-svg" style="min-width: ${Math.min(svgWidth, 600)}px; max-height: 500px;">
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L6,3 z" fill="${lineColor}"/>
        </marker>
      </defs>
      <g class="connections">${connections.join("")}</g>
      <g class="nodes">${nodes.join("")}</g>
    </svg>
  `;
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
            --neutral: #64748b;
            --font: 'Inter', system-ui, -apple-system, sans-serif;
        }

        /* --- Scrollbar --- */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: var(--bg); }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }

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
            width: 90%;
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
            flex-shrink: 0;
            position: sticky;
            top: 0;
            height: 100vh;
            overflow-y: auto;
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

        .sidebar-stats {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
            padding: 1rem;
            background: rgba(255,255,255,0.02);
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
        }
        .stat-label { color: var(--text-muted); }
        .stat-value { font-weight: 600; }
        .stat-value.success { color: var(--success); }
        .stat-value.danger { color: var(--danger); }

        /* Main Content */
        main {
            flex: 1;
            padding: 2rem;
            max-width: 1400px;
            margin: 0 auto;
            width: 100%;
            overflow-x: hidden;
        }

        header {
            margin-bottom: 2rem;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 1rem;
        }
        .header-left h1 { font-size: 2rem; margin: 0 0 0.5rem 0; letter-spacing: -1px; }
        .subtitle { color: var(--text-muted); }
        
        .header-actions {
            display: flex;
            gap: 0.75rem;
        }
        .header-btn {
            padding: 0.6rem 1.2rem;
            background: rgba(179, 137, 245, 0.1);
            border: 1px solid var(--primary);
            border-radius: 8px;
            color: var(--primary);
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 600;
            transition: all 0.2s;
        }
        .header-btn:hover {
            background: var(--primary);
            color: var(--bg);
        }

        /* Summary Grid */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }

        .card {
            background: var(--card-bg);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 1.5rem;
            transition: transform 0.2s, border-color 0.2s;
            display: flex;
            flex-direction: column;
        }
        .card:hover { 
            transform: translateY(-4px); 
            border-color: rgba(179, 137, 245, 0.3);
        }
        .card.span-2 { grid-column: span 2; }

        .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 1rem;
        }
        .card-icon {
            font-size: 1.5rem;
            background: rgba(255, 255, 255, 0.03);
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 12px;
        }
        .status-badge {
            padding: 0.25rem 0.6rem;
            border-radius: 99px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .status-success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
        .status-warning { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
        .status-danger { background: rgba(239, 68, 68, 0.1); color: var(--danger); }
        .status-neutral { background: rgba(148, 163, 184, 0.1); color: var(--neutral); }

        .card-title { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        .card-value { font-size: 1.75rem; font-weight: 800; margin: 0.5rem 0; }
        
        .card-action {
            display: block;
            margin-top: auto;
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
            border-radius: 24px;
            padding: 2rem;
            display: flex;
            align-items: center;
            gap: 3rem;
            margin-bottom: 2rem;
            flex-wrap: wrap;
        }

        .chart-container { position: relative; width: 140px; height: 140px; flex-shrink: 0; }
        .chart-svg { transform: rotate(-90deg); width: 100%; height: 100%; }
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
            font-size: 2rem;
            font-weight: 900;
        }

        .health-info { flex: 1; min-width: 250px; }
        .health-info h2 { font-size: 1.5rem; margin: 0 0 0.5rem 0; }
        .health-info p { color: var(--text-muted); line-height: 1.5; font-size: 0.95rem; margin: 0; }

        /* Data Tables */
        .details-section { margin-bottom: 3rem; }
        .section-title {
            font-size: 1.25rem;
            margin-bottom: 1.5rem;
            border-left: 4px solid var(--primary);
            padding-left: 1rem;
        }
        .table-wrapper {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            overflow-x: auto;
        }
        table { width: 100%; border-collapse: collapse; text-align: left; min-width: 500px; }
        th { background: rgba(255,255,255,0.02); padding: 1rem 1.5rem; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 1px; }
        td { padding: 1rem 1.5rem; border-top: 1px solid var(--border); font-size: 0.9rem; }
        
        .tag { padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: rgba(255,255,255,0.05); }

        /* Lighthouse Summary Table */
        .lh-summary-table { width: 100%; border-collapse: separate; border-spacing: 0 0.5rem; margin-top: 1rem; min-width: 0; }
        .lh-summary-table th { padding: 0.5rem; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); text-align: center; background: transparent; border-bottom: 1px solid var(--border); }
        .lh-summary-table td { padding: 0.5rem; font-size: 0.85rem; text-align: center; border-top: none; background: rgba(255,255,255,0.02); }
        .lh-summary-table td:first-child { text-align: left; border-radius: 8px 0 0 8px; font-weight: 600; color: var(--text-main); }
        .lh-summary-table td:last-child { border-radius: 0 8px 8px 0; }
        .score-pill { display: inline-flex; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

        /* Workflow Visualization */
        .workflow-container {
            background: #0d1117;
            border-radius: 16px;
            padding: 1.5rem;
            overflow-x: auto;
            border: 1px solid var(--border);
        }
        .workflow-svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
        .workflow-node { cursor: pointer; transition: opacity 0.2s; }
        .workflow-node:hover { opacity: 0.8; }
        .workflow-legend {
            display: flex;
            gap: 1.5rem;
            justify-content: center;
            margin-top: 1rem;
            flex-wrap: wrap;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: var(--text-muted);
        }
        .legend-dot {
            width: 12px;
            height: 12px;
            border-radius: 3px;
        }

        footer { text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--border); margin-top: 4rem; }

        /* Responsive */
        @media (max-width: 1200px) {
            .card.span-2 { grid-column: span 1; }
        }

        @media (max-width: 900px) {
            body { flex-direction: column; }
            aside { 
                width: 100%; 
                border-right: none; 
                border-bottom: 1px solid var(--border); 
                padding: 1rem 2rem; 
                flex-direction: row; 
                align-items: center; 
                justify-content: space-between; 
                height: auto;
                position: relative;
            }
            nav { display: none; }
            aside .sidebar-stats { display: none; }
            aside .tag { display: none; }
            
            .health-section { flex-direction: column; text-align: center; gap: 1.5rem; padding: 1.5rem; }
            .summary-grid { grid-template-columns: 1fr; }
            
            main { padding: 1.5rem; }
            h1 { font-size: 1.75rem; }
            header { flex-direction: column; }
            .header-actions { width: 100%; justify-content: center; }
        }

        @media (max-width: 600px) {
            .lh-summary-table { font-size: 0.75rem; }
            .lh-summary-table th, .lh-summary-table td { padding: 0.4rem; }
            table { min-width: 400px; }
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
        window.onclick = function(event) {
            if (event.target == document.getElementById('logModal')) {
                closeLog();
            }
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
            <a href="#" class="nav-item active">📊 Overview</a>
            <a href="lighthouse/" class="nav-item">⚡ Performance</a>
            <a href="a11y/" class="nav-item">♿ Accessibility</a>
            <a href="html/" class="nav-item">📄 HTML Validation</a>
            <a href="lychee/" class="nav-item">🔗 Link Checker</a>
        </nav>
        <div class="sidebar-stats">
            <div class="stat-row">
                <span class="stat-label">Static Analysis</span>
                <span class="stat-value ${saStats.failure > 0 ? "danger" : "success"}">${saStats.success}/${Object.keys(saOutcomes).length} ✓</span>
            </div>
            <div class="stat-row">
                <span class="stat-label">Quality Checks</span>
                <span class="stat-value ${qualityStats.failure > 0 ? "danger" : "success"}">${qualityStats.success}/${Object.keys(qualityOutcomes).length} ✓</span>
            </div>
        </div>
        <div class="tag" style="margin-top: auto;">BUILD #${runNumber}</div>
    </aside>

    <main>
        <header>
            <div class="header-left">
                <h1>CI Health Dashboard</h1>
                <div class="subtitle">Last audit performed on <b>${timestamp}</b></div>
            </div>
            <div class="header-actions">
                <a href="${workflowUrl}" target="_blank" class="header-btn">View on GitHub →</a>
            </div>
        </header>

        <section class="health-section">
            <div class="chart-container">
                <svg class="chart-svg" viewBox="0 0 160 160">
                    <circle class="chart-bg" cx="80" cy="80" r="70"></circle>
                    <circle class="chart-progress" cx="80" cy="80" r="70"></circle>
                </svg>
                <div class="chart-text">${healthScore}%</div>
            </div>
            <div class="health-info">
                <h2>Project Health Summary</h2>
                <p>
                    Your project is currently in <b>${conditionText}</b>. 
                    The pipeline has analyzed performance, accessibility, and code quality across ${bundleStats?.fileCount || "multiple"} assets.
                    Review the detailed status cards below for specific insights.
                </p>
            </div>
        </section>

        <!-- Main Cards Grid -->
        <div class="summary-grid">
            
            <!-- Lighthouse Summary Card -->
             <div class="card span-2" style="min-height: 340px;">
                <div class="card-header">
                    <div class="card-icon">⚡</div>
                    <span class="status-badge ${status.lighthouse ? "status-success" : "status-warning"}">${status.lighthouse ? "AUDIT READY" : "IN PROGRESS"}</span>
                </div>
                <div class="card-title">Performance (Core Web Vitals)</div>
                <div style="margin-top: 1rem; flex: 1; overflow-x: auto;">
                   <table class="lh-summary-table">
                        <thead>
                            <tr>
                                <th style="text-align:left;">Page</th>
                                <th colspan="2">📱 Mobile</th>
                                <th colspan="2">🖥️ Desktop</th>
                            </tr>
                            <tr>
                                <th></th>
                                <th style="font-size: 0.65rem;">Light</th>
                                <th style="font-size: 0.65rem;">Dark</th>
                                <th style="font-size: 0.65rem;">Light</th>
                                <th style="font-size: 0.65rem;">Dark</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${lighthouseData
    .map(
      (d) => `
                            <tr>
                                <td>${d.page}</td>
                                <td>${getScoreBadge(d.mobileLight)}</td>
                                <td>${getScoreBadge(d.mobileDark)}</td>
                                <td>${getScoreBadge(d.desktopLight)}</td>
                                <td>${getScoreBadge(d.desktopDark)}</td>
                            </tr>
                            `,
    )
    .join("")}
                        </tbody>
                   </table>
                </div>
                <a href="lighthouse/" class="card-action ${status.lighthouse ? "" : "disabled"}" style="margin-top: 1.5rem;">View Full Report →</a>
            </div>

            <!-- Accessibility Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">♿</div>
                    <span class="status-badge ${status.a11y ? "status-success" : "status-danger"}">${status.a11y ? "Audit Run" : "Failed"}</span>
                </div>
                <div class="card-title">Accessibility</div>
                <div class="card-value">${accessibilityData.reduce((a, r) => a + (r.failed || 0), 0) === 0 ? "Perfect" : "Issues Found"}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Tested Light & Dark modes across all pages.
                </div>
                <a href="a11y/" class="card-action ${status.a11y ? "" : "disabled"}">Open Detailed Report →</a>
            </div>

            <!-- RSS Status -->
            <div class="card">
                <div class="card-header">
                    <div class="card-icon">📡</div>
                    <span class="status-badge ${rssValidation?.valid ? "status-success" : "status-danger"}">${rssValidation?.valid ? "Valid" : "Invalid"}</span>
                </div>
                <div class="card-title">RSS Feed</div>
                <div class="card-value">${rssValidation?.metadata?.items || 0} Items</div>
                 <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                    ${rssValidation?.valid ? "Schema & Syntax verified." : "Validation errors detected."}
                </div>
                <a href="rss/" class="card-action ${status.rss ? "" : "disabled"}">Preview Feed →</a>
            </div>

             <!-- HTML Validity -->
             <div class="card">
                <div class="card-header">
                    <div class="card-icon">📄</div>
                    <span class="status-badge ${htmlValidation ? "status-success" : "status-warning"}">${htmlValidation ? "Completed" : "Skipped"}</span>
                </div>
                <div class="card-title">HTML5 Validation</div>
                <div class="card-value">${htmlValidation ? "Verified" : "N/A"}</div>
                 <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Static source code scan for strict HTML5 compliance.
                </div>
                <a href="html/" class="card-action ${status.html ? "" : "disabled"}">View Source Scan →</a>
            </div>
        </div>

        <section class="details-section">
            <h2 class="section-title">Detailed Pipeline Status</h2>
            <div class="summary-grid">
               <!-- SA Status Card -->
               <div class="card span-2">
                  <div class="card-title" style="margin-bottom: 1rem;">Static Analysis Results</div>
                  <div class="table-wrapper">
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
               
               <!-- Builds List -->
                <div class="card">
                   <div class="card-title" style="margin-bottom: 1rem;">Assets & Build Quality</div>
                   <div class="table-wrapper">
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
            <h2 class="section-title">Workflow Visualization</h2>
            <div class="workflow-container">
                ${generateWorkflowSVG()}
                <div class="workflow-legend">
                    <div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Success</div>
                    <div class="legend-item"><span class="legend-dot" style="background:#ef4444;"></span> Failed</div>
                    <div class="legend-item"><span class="legend-dot" style="background:#f59e0b;"></span> Pending</div>
                    <div class="legend-item"><span class="legend-dot" style="background:#64748b;"></span> Skipped</div>
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

// 4. Generate Lighthouse Index
const lhIndexHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Lighthouse Reports</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #0f111a; color: #f8fafc; padding: 2rem; }
        a { color: #b389f5; text-decoration: none; }
        a:hover { text-decoration: underline; }
        ul { list-style: none; padding: 0; }
        li { margin: 0.5rem 0; padding: 1rem; background: rgba(23, 25, 35, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; }
        h2 { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; margin-top: 2rem; }
    </style>
</head>
<body>
    <h1>Lighthouse Reports</h1>
    <p>Last run: ${timestamp}</p>
    
    <h2>Desktop</h2>
    <ul>
         ${(() => {
    const desktopDir = path.join(
      DIST_REPORTS,
      "lighthouse",
      "light",
      "desktop",
    );
    if (!fs.existsSync(desktopDir))
      return "<li>No desktop reports found</li>";
    return fs
      .readdirSync(desktopDir)
      .filter((f) => f.endsWith(".html"))
      .map(
        (f) => `<li><a href="light/desktop/${f}">Desktop: ${f}</a></li>`,
      )
      .join("");
  })()}
    </ul>

    <h2>Mobile</h2>
    <ul>
         ${(() => {
    const mobileDir = path.join(
      DIST_REPORTS,
      "lighthouse",
      "light",
      "mobile",
    );
    if (!fs.existsSync(mobileDir))
      return "<li>No mobile reports found</li>";
    return fs
      .readdirSync(mobileDir)
      .filter((f) => f.endsWith(".html"))
      .map(
        (f) => `<li><a href="light/mobile/${f}">Mobile: ${f}</a></li>`,
      )
      .join("");
  })()}
    </ul>
</body>
</html>
`;

if (fs.existsSync(path.join(DIST_REPORTS, "lighthouse"))) {
  fs.writeFileSync(
    path.join(DIST_REPORTS, "lighthouse", "index.html"),
    lhIndexHtml,
  );
  console.log("✅ Lighthouse index generated.");
}
