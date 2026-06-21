/**
 * update-ci-comment.mjs
 *
 * Centralized script to manage a single "living" PR comment for CI results.
 * It provides a broad executive summary, a health score visualization,
 * and a centered dashboard link.
 */

import fs from "node:fs";

import { calculateHealthScore } from "./utils.mjs";

const HEADER = "### 🛡️ CI Security & Quality Report";

const STATUS_ICONS = {
  success: "✅",
  failure: "❌",
  pending: "⏳",
  skipped: "⏭️",
  running: "🔄",
};

const getIcon = (res) => STATUS_ICONS[res] || STATUS_ICONS.pending;

/**
 * Builds the Static Analysis table
 */
function buildSaTable(results) {
  let md = "\n#### 🔍 Static Analysis\n\n";
  md += "| Tool | Status | Outcome |\n";
  md += "| :--- | :---: | :---: |\n";
  md += `| Astro Check | ${getIcon(results.astro)} | **${results.astro || "Pending"}** |\n`;
  md += `| Prettier | ${getIcon(results.prettier)} | **${results.prettier || "Pending"}** |\n`;
  md += `| ESLint | ${getIcon(results.eslint)} | **${results.eslint || "Pending"}** |\n`;
  md += `| Link Checker | ${getIcon(results.lychee)} | **${results.lychee || "Pending"}** |\n`;
  md += `| Spell Checker | ${getIcon(results.cspell)} | **${results.cspell || "Pending"}** |\n`;
  md += `| Stylelint | ${getIcon(results.stylelint)} | **${results.stylelint || "Pending"}** |\n`;
  md += `| Security Audit | ${getIcon(results.security)} | **${results.security || "Pending"}** |\n`;
  md += `| SonarQube | ${getIcon(results.sonar)} | **${results.sonar || "Pending"}** |\n`;
  md += `| JSDoc Coverage | ${getIcon(results.jsdoc)} | **${results.jsdocCoverage || "0%"}** |\n`;
  return md;
}

/**
 * Builds the Quality & Performance table
 */
function buildQualityTable(results) {
  let md = "\n#### 📈 Quality & Performance\n\n";
  md += "| Check | Status | Note |\n";
  md += "| :--- | :---: | :--- |\n";
  md += `| ♿ Accessibility | ${getIcon(results.a11y)} | Detailed audit in dashboard |\n`;
  md += `| 📄 HTML5 Validity | ${getIcon(results.html)} | Source scan results |\n`;
  md += `| 📦 Bundle Size | ${getIcon(results.bundle)} | Asset analysis |\n`;
  md += `| 📡 RSS & Metadata | ${getIcon(results.rss)} | Feed validation |\n`;
  md += `| 🏷️ Schema.org | ${getIcon(results.schema)} | Structured data audit |\n`;
  md += `| 🖼️ Images | ${getIcon(results.image)} | Performance check |\n`;
  md += `| 🧪 Functional Tests | ${getIcon(results.functional)} | Playwright E2E results |\n`;
  return md;
}

/**
 * Builds a broad summary based on scores and available data
 */
const buildExecutiveSummary = (saResults, healthScore) => {
  let summary = "#### 📝 Executive Summary\n\n";

  if (healthScore >= 95) {
    summary +=
      "✨ **Project is in excellent shape!** All critical quality and security gates have passed with flying colors. Codebase stability and accessibility standards are exceptionally high.\n";
  } else if (healthScore >= 80) {
    summary +=
      "✅ **Project is healthy.** Most checks passed successfully. There are minor improvements suggested, but the overall state is stable for review.\n";
  } else if (healthScore >= 60) {
    summary +=
      "⚠️ **Attention Recommended.** The CI has detected several issues or regressions. While not strictly blocking, these points should be addressed to maintain long-term quality.\n";
  } else {
    summary +=
      "❌ **Critical Status.** Multiple failures detected. The current changes do not meet the project's quality or security standards. Please review the detailed reports below.\n";
  }

  summary += "\n**Highlights:**\n";
  const highlights = getExecutiveHighlights(saResults);

  summary +=
    highlights.length > 0
      ? highlights.join("\n")
      : "- *Detailed insights will appear once analysis is complete.*";
  summary += "\n";

  return summary;
};

/**
 * Safely reads and parses a JSON file, logging a warning on failure.
 * @param {string} filePath - Path to the JSON file.
 * @returns {object|null} Parsed JSON or null on error.
 */
function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`⚠️ Failed to read ${filePath}:`, msg);
  }
  return null;
}

/**
 * Generates the list of highlights for the executive summary.
 */
function getExecutiveHighlights(saResults) {
  const highlights = [];

  const bundle = safeReadJson("bundle-analysis.json");
  if (bundle && bundle.readableCodeSize && bundle.readableAssetSize) {
    highlights.push(
      `- 📦 **Bundle Size:** Code: **${bundle.readableCodeSize}** | Assets: **${bundle.readableAssetSize}**`,
    );
  }

  const a11y = safeReadJson("accessibility-report.json");
  if (a11y && Array.isArray(a11y)) {
    const violations = a11y.reduce(
      (acc, r) => acc + (r.violations?.length || 0),
      0,
    );
    highlights.push(
      violations === 0
        ? "- ♿ **Accessibility:** Perfect score! No violations detected in any audited pages. ✅"
        : `- ♿ **Accessibility:** Found ${violations} violations that need attention.`,
    );
  }

  const html = safeReadJson("html-validation.json");
  if (html && Array.isArray(html)) {
    const errors = html.reduce(
      (acc, f) => acc + (Number(f.errorCount) || 0),
      0,
    );
    highlights.push(
      errors === 0
        ? "- 📄 **HTML5:** Full valid syntax across all generated pages. ✅"
        : `- 📄 **HTML5:** ${errors} syntax errors detected in the current build.`,
    );
  }

  const rss = safeReadJson("rss-validation.json");
  if (rss?.valid) {
    highlights.push(
      `- 📡 **RSS/Atom:** Feed is syntactically valid and compliant with industry standards.`,
    );
  }

  if (saResults.lychee === "success") {
    highlights.push(
      "- 🔗 **Link Integrity:** All external and internal links verified successfully.",
    );
  }

  return highlights;
}

/**
 * Gets the score color based on health score threshold.
 * @param {number} healthScore
 * @returns {string} Color code for the badge
 */
function getScoreColor(healthScore) {
  if (healthScore >= 90) return "4E9A06";
  if (healthScore >= 70) return "C4A000";
  return "A40000";
}

/**
 * Builds the dashboard badge HTML.
 * @param {string|undefined} vercelUrl
 * @returns {string} Badge HTML
 */
function buildDashboardBadge(vercelUrl) {
  if (vercelUrl) {
    const cleanUrl = vercelUrl.startsWith("http")
      ? vercelUrl
      : `https://${vercelUrl}`;
    return `  <a href="${cleanUrl}">\n    <img src="https://img.shields.io/badge/OPEN%20CI%20DASHBOARD-4F46E5?style=for-the-badge&logo=github&logoColor=white" alt="Open CI Dashboard" />\n  </a>`;
  }
  return `  <img src="https://img.shields.io/badge/DASHBOARD-BUILDING...-lightgrey?style=for-the-badge&logo=github&logoColor=white" alt="Dashboard Building" />`;
}

/**
 * Gets the status text based on current step.
 * @param {string} step
 * @returns {string} Status message
 */
function getStatusText(step) {
  if (step === "init") {
    return `> 🔄 **CI Analysis Initialized.** Starting parallel security and quality audits... ⚡\n\n`;
  }
  if (step === "sa") {
    return `> 🔄 **Static Analysis Completed.** Now finalizing assets and functional checks... 🧪\n\n`;
  }
  return `> ✨ **Analysis Complete.** All reports are now available for review.\n\n`;
}

/**
 * Fetches existing PR comments.
 * @param {object} github
 * @param {object} context
 * @param {number} prNumber
 * @returns {Promise<Array>} Array of comments
 */
async function fetchPrComments(github, context, prNumber) {
  try {
    return await github.paginate(github.rest.issues.listComments, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to list PR comments: ${msg}`);
    return [];
  }
}

/**
 * Posts or updates a PR comment.
 * @param {object} github
 * @param {object} params
 * @param {object|null} existingComment
 */
async function postComment(github, params, existingComment) {
  const method = existingComment ? "updateComment" : "createComment";
  const commentParams = { ...params };

  if (existingComment) {
    commentParams.comment_id = existingComment.id;
  }

  try {
    await github.rest.issues[method](commentParams);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const action = method === "updateComment" ? "update" : "create";
    console.error(`Failed to ${action} PR comment: ${msg}`);
    throw error;
  }
}

/**
 * Main function to update the CI comment in the GitHub PR.
 */
export default async function updateCiComment({ github, context, step }) {
  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    console.log("Not a PR, skipping update.");
    return;
  }

  const saResults = {
    astro: process.env.OUTCOME_ASTRO,
    prettier: process.env.OUTCOME_PRETTIER,
    eslint: process.env.OUTCOME_ESLINT,
    lychee: process.env.OUTCOME_LYCHEE,
    cspell: process.env.OUTCOME_CSPELL,
    stylelint: process.env.OUTCOME_STYLELINT,
    security: process.env.OUTCOME_SECURITY,
    sonar: process.env.OUTCOME_SONAR,
    jsdoc: process.env.OUTCOME_JSDOC,
    jsdocCoverage: process.env.JSDOC_COVERAGE,
  };

  const qualityResults = {
    a11y: process.env.OUTCOME_A11Y,
    html: process.env.OUTCOME_HTML,
    bundle: process.env.OUTCOME_BUNDLE,
    rss: process.env.OUTCOME_RSS,
    schema: process.env.OUTCOME_SCHEMA,
    image: process.env.OUTCOME_IMAGE,
    functional: process.env.OUTCOME_FUNCTIONAL,
  };

  const vercelUrl = process.env.VERCEL_URL;
  const healthScore = calculateHealthScore(saResults, qualityResults);

  if (process.env.DEBUG) {
    console.log("DEBUG: SA Results", JSON.stringify(saResults, null, 2));
    console.log(
      "DEBUG: Quality Results",
      JSON.stringify(qualityResults, null, 2),
    );
    console.log("DEBUG: Health Score", healthScore);
  }

  // Build comment body
  const scoreColor = getScoreColor(healthScore);
  let body = `${HEADER}\n\n`;
  body += `<p align="center">\n`;
  body += `  <img src="https://img.shields.io/badge/PROJECT%20HEALTH-${healthScore}%2F100-${scoreColor}?style=for-the-badge&logo=heartbeat&logoColor=white" alt="Project Health Score" />\n`;
  body += `</p>\n\n`;

  body += `<p align="center">\n`;
  body += buildDashboardBadge(vercelUrl);
  body += `\n</p>\n\n`;

  body += getStatusText(step);

  // Summary
  if (step === "final") {
    body += buildExecutiveSummary(saResults, healthScore);
  }

  // Detailed tables
  body += buildSaTable(saResults);
  body += buildQualityTable(qualityResults);

  body += `\n---\n<p align="right"><i>Last Update: ${new Date().toUTCString()} &bull; <a href="https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}">Workflow Logs</a></i></p>`;

  // Find and update/create comment
  const comments = await fetchPrComments(github, context, prNumber);
  const existingComment = comments.find(
    (c) => c.body?.includes(HEADER) && c.user?.type === "Bot",
  );

  await postComment(
    github,
    {
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: body,
    },
    existingComment,
  );
}
