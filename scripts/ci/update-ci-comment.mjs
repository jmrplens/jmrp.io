/**
 * update-ci-comment.mjs
 *
 * Centralized script to manage a single "living" PR comment for CI results.
 * It can be called at different stages of the CI to update specific sections.
 */

import fs from "node:fs";

const HEADER = "### 🛡️ CI Security & Quality Report";

const STATUS_ICONS = {
  success: "✅",
  failure: "❌",
  pending: "⏳",
  skipped: "⏭️",
  running: "🔄",
};

/**
 * Builds the Static Analysis table
 */
function buildSaTable(results) {
  const getIcon = (res) => STATUS_ICONS[res] || STATUS_ICONS.pending;

  let md = "\n#### 🔍 Static Analysis\n\n";
  md += "| Tool | Status | Outcome |\n";
  md += "| :--- | :---: | :---: |\n";
  md += `| Astro Check | ${getIcon(results.astro)} | **${results.astro || "Pending"}** |\n`;
  md += `| Prettier | ${getIcon(results.prettier)} | **${results.prettier || "Pending"}** |\n`;
  md += `| ESLint | ${getIcon(results.eslint)} | **${results.eslint || "Pending"}** |\n`;
  md += `| Security Audit | ${getIcon(results.security)} | **${results.security || "Pending"}** |\n`;
  md += `| JSDoc Coverage | ${getIcon(results.jsdoc)} | **${results.jsdocCoverage || "Pending"}** |\n`;
  return md;
}

/**
 * Builds the Quality & Performance table
 */
function buildQualityTable(results, vercelUrl) {
  const getIcon = (res) => STATUS_ICONS[res] || STATUS_ICONS.pending;

  let md = "\n#### 📈 Quality & Performance\n\n";
  md += vercelUrl
    ? `> 🌐 [**Open Interactive Dashboard**](https://${vercelUrl}) 🚀\n\n`
    : `> ⏳ *Generating detailed reports and dashboard...*\n\n`;

  md += "| Check | Status | Note |\n";
  md += "| :--- | :---: | :--- |\n";
  md += `| ♿ Accessibility | ${getIcon(results.a11y)} | Detailed audit in dashboard |\n`;
  md += `| 📄 HTML5 Validity | ${getIcon(results.html)} | Source scan results |\n`;
  md += `| 📦 Bundle Size | ${getIcon(results.bundle)} | Asset analysis |\n`;
  md += `| 📡 RSS & Metadata | ${getIcon(results.rss)} | Feed validation |\n`;
  return md;
}

/**
 * Calculates current health score based on available json reports
 */
function calculateHealthScore() {
  let score = 100;
  if (fs.existsSync("accessibility-report.json")) {
    const a11yData = JSON.parse(
      fs.readFileSync("accessibility-report.json", "utf-8"),
    );
    const failed = a11yData.reduce((acc, r) => acc + (r.failed || 0), 0);
    score -= failed * 5;
  }
  if (fs.existsSync("html-validation.json")) {
    const htmlData = JSON.parse(
      fs.readFileSync("html-validation.json", "utf-8"),
    );
    const htmlErrors = htmlData.reduce(
      (acc, f) => acc + f.messages.filter((m) => m.severity === 2).length,
      0,
    );
    score -= htmlErrors * 2;
  }
  if (fs.existsSync("rss-validation.json")) {
    const rssData = JSON.parse(fs.readFileSync("rss-validation.json", "utf-8"));
    if (rssData && !rssData.valid) score -= 10;
  }
  return Math.max(0, score);
}

/**
 * Gets the health icon based on score
 */
function getHealthIcon(score) {
  if (score >= 95) return "💎";
  if (score >= 80) return "✅";
  if (score >= 60) return "⚠️";
  return "❌";
}

/**
 * Main function to update the CI comment in the GitHub PR.
 *
 * @param {object} params - Parameters for the comment update.
 */
export default async function updateCiComment({ github, context, step }) {
  const prNumber = context.payload.pull_request?.number;
  if (!prNumber) {
    console.log("Not a PR, skipping update.");
    return;
  }

  // Prepare current state data
  const saResults = {
    astro: process.env.OUTCOME_ASTRO,
    prettier: process.env.OUTCOME_PRETTIER,
    eslint: process.env.OUTCOME_ESLINT,
    security: process.env.OUTCOME_SECURITY,
    jsdoc: process.env.OUTCOME_JSDOC,
    jsdocCoverage: process.env.JSDOC_COVERAGE,
  };

  const qualityResults = {
    a11y: process.env.OUTCOME_A11Y,
    html: process.env.OUTCOME_HTML,
    bundle: process.env.OUTCOME_BUNDLE,
    rss: process.env.OUTCOME_RSS,
  };

  const vercelUrl = process.env.VERCEL_URL;

  // Build the full comment body
  let body = `${HEADER}\n\n`;

  switch (step) {
    case "init": {
      body += `> 🔄 **CI Analysis in progress...**\n\n`;
      body += `*The reports are being generated. This message will be updated automatically.* ⚡\n`;
      body += buildSaTable({});
      body += buildQualityTable({}, null);
      break;
    }
    case "sa": {
      body += `> 🔄 **Static Analysis results available. Finalizing build...**\n\n`;
      body += buildSaTable(saResults);
      body += buildQualityTable({}, null);
      break;
    }
    case "final": {
      const healthScore = calculateHealthScore();
      const icon = getHealthIcon(healthScore);
      body += `### ${icon} Project Health Score: ${healthScore}/100\n\n`;
      body += buildSaTable(saResults);
      body += buildQualityTable(qualityResults, vercelUrl);
      break;
    }
  }

  body += `\n---\n> 📊 [Full Build Logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

  // Find and update/create comment
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
  });

  const existingComment = comments.find(
    (c) => c.body?.includes(HEADER) && c.user?.type === "Bot",
  );

  const commentMethod = existingComment ? "updateComment" : "createComment";
  const commentParams = {
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: body,
  };

  if (existingComment) {
    commentParams.comment_id = existingComment.id;
  } else {
    commentParams.issue_number = prNumber;
  }

  await github.rest.issues[commentMethod](commentParams);
}
