/**
 * update-ci-comment.mjs
 * 
 * Centralized script to manage a single "living" PR comment for CI results.
 * It can be called at different stages of the CI to update specific sections.
 */

import fs from 'node:fs';

const HEADER = "### 🛡️ CI Security & Quality Report";

const STATUS_ICONS = {
    success: "✅",
    failure: "❌",
    pending: "⏳",
    skipped: "⏭️",
    running: "🔄"
};

/**
 * Builds the Static Analysis table
 */
function buildSaTable(results) {
    const getIcon = (res) => STATUS_ICONS[res] || STATUS_ICONS.pending;

    let md = "\n#### 🔍 Static Analysis\n\n";
    md += "| Tool | Status | Outcome |\n";
    md += "| :--- | :---: | :---: |\n";
    md += `| Astro Check | ${getIcon(results.astro)} | **${results.astro || 'Pending'}** |\n`;
    md += `| Prettier | ${getIcon(results.prettier)} | **${results.prettier || 'Pending'}** |\n`;
    md += `| ESLint | ${getIcon(results.eslint)} | **${results.eslint || 'Pending'}** |\n`;
    md += `| Security Audit | ${getIcon(results.security)} | **${results.security || 'Pending'}** |\n`;
    md += `| JSDoc Coverage | ${getIcon(results.jsdoc)} | **${results.jsdocCoverage || 'Pending'}** |\n`;
    return md;
}

/**
 * Builds the Quality & Performance table
 */
function buildQualityTable(results, vercelUrl) {
    const getIcon = (res) => STATUS_ICONS[res] || STATUS_ICONS.pending;

    let md = "\n#### 📈 Quality & Performance\n\n";
    if (vercelUrl) {
        md += `> 🌐 [**Open Interactive Dashboard**](https://${vercelUrl}) 🚀\n\n`;
    } else {
        md += `> ⏳ *Generating detailed reports and dashboard...*\n\n`;
    }

    md += "| Check | Status | Note |\n";
    md += "| :--- | :---: | :--- |\n";
    md += `| ♿ Accessibility | ${getIcon(results.a11y)} | Detailed audit in dashboard |\n`;
    md += `| 📄 HTML5 Validity | ${getIcon(results.html)} | Source scan results |\n`;
    md += `| 📦 Bundle Size | ${getIcon(results.bundle)} | Asset analysis |\n`;
    md += `| 📡 RSS & Metadata | ${getIcon(results.rss)} | Feed validation |\n`;
    return md;
}

export default async function updateCiComment({ github, context, step }) {
    const prNumber = context.payload.pull_request?.number;
    if (!prNumber) {
        console.log("Not a PR, skipping update.");
        return;
    }

    // Find existing comment
    const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
    });

    const existingComment = comments.find(c => c.body?.includes(HEADER) && c.user?.type === 'Bot');

    // Prepare current state data
    let healthScore = 100;

    const saResults = {
        astro: process.env.OUTCOME_ASTRO,
        prettier: process.env.OUTCOME_PRETTIER,
        eslint: process.env.OUTCOME_ESLINT,
        security: process.env.OUTCOME_SECURITY,
        jsdoc: process.env.OUTCOME_JSDOC,
        jsdocCoverage: process.env.JSDOC_COVERAGE
    };

    const qualityResults = {
        a11y: process.env.OUTCOME_A11Y,
        html: process.env.OUTCOME_HTML,
        bundle: process.env.OUTCOME_BUNDLE,
        rss: process.env.OUTCOME_RSS
    };

    // Load actual data for health score if we are in the final phase
    if (step === 'final') {
        if (fs.existsSync('accessibility-report.json')) {
            const a11yData = JSON.parse(fs.readFileSync('accessibility-report.json', 'utf8'));
            const failed = a11yData.reduce((acc, r) => acc + (r.failed || 0), 0);
            healthScore -= failed * 5;
        }
        if (fs.existsSync('html-validation.json')) {
            const htmlData = JSON.parse(fs.readFileSync('html-validation.json', 'utf8'));
            const htmlErrors = htmlData.reduce((acc, f) => acc + f.messages.filter(m => m.severity === 2).length, 0);
            healthScore -= htmlErrors * 2;
        }
        if (fs.existsSync('rss-validation.json')) {
            const rssData = JSON.parse(fs.readFileSync('rss-validation.json', 'utf8'));
            if (rssData && !rssData.valid) healthScore -= 10;
        }
        healthScore = Math.max(0, healthScore);
    }

    const vercelUrl = process.env.VERCEL_URL;

    // Build the full comment body
    let body = `${HEADER}\n\n`;

    if (step === 'init') {
        body += `> 🔄 **CI Analysis in progress...**\n\n`;
        body += `*The reports are being generated. This message will be updated automatically.* ⚡\n`;
        body += buildSaTable({});
        body += buildQualityTable({}, null);
    } else if (step === 'sa') {
        body += `> 🔄 **Static Analysis results available. Finalizing build...**\n\n`;
        body += buildSaTable(saResults);
        body += buildQualityTable({}, null);
    } else if (step === 'final') {
        const icon = healthScore >= 95 ? "💎" : healthScore >= 80 ? "✅" : healthScore >= 60 ? "⚠️" : "❌";
        body += `### ${icon} Project Health Score: ${healthScore}/100\n\n`;
        body += buildSaTable(saResults);
        body += buildQualityTable(qualityResults, vercelUrl);
    }

    body += `\n---\n> 📊 [Full Build Logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

    if (existingComment) {
        // If it's a 'sa' or 'final' step, we want to try to preserve parts if they were already 'success'
        // but for simplicity in this centralized version, the step themselves provide all they know.
        // aggregator jobs (static-analysis-report and deploy-reports) have all their children's data.

        await github.rest.issues.updateComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: existingComment.id,
            body: body
        });
    } else {
        await github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: prNumber,
            body: body
        });
    }
}
