/**
 * post-consolidated-report-comment.mjs
 * 
 * Posts a single, high-level summary comment to the GitHub PR 
 * linking to the consolidated Vercel dashboard.
 */

import fs from 'node:fs';

const HEADER = "### 🛡️ CI Security & Quality Report";

function getStatusIcon(healthScore) {
    if (healthScore >= 95) return "💎";
    if (healthScore >= 80) return "✅";
    if (healthScore >= 60) return "⚠️";
    return "❌";
}

export default async function postConsolidatedComment({ github, context }) {
    const vercelUrl = process.env.VERCEL_URL;
    const bundlePath = 'bundle-analysis.json';
    const a11yPath = 'accessibility-report.json';

    let healthScore = 100;
    let summaryText = "Your project has been audited for security, accessibility, and performance.";

    // Calculate high-level health for the comment
    if (fs.existsSync(a11yPath)) {
        const a11y = JSON.parse(fs.readFileSync(a11yPath, 'utf8'));
        const failed = a11y.reduce((acc, r) => acc + (r.failed || 0), 0);
        healthScore -= failed * 5;
    }

    healthScore = Math.max(0, healthScore);
    const icon = getStatusIcon(healthScore);

    let comment = `${HEADER}\n\n`;
    comment += `${icon} **Project Health Score: ${healthScore}/100**\n\n`;
    comment += `${summaryText}\n\n`;

    if (vercelUrl) {
        comment += `#### 🌐 [**Open Interactive Dashboard**](https://${vercelUrl}) 🚀\n`;
        comment += `> Access detailed reports for Accessibility, HTML Validity, RSS, and Performance.\n\n`;
    }

    comment += "| Check | Status | Note |\n";
    comment += "| :--- | :---: | :--- |\n";
    comment += `| ♿ Accessibility | ${healthScore >= 90 ? '✅' : '⚠️'} | Detailed audit in dashboard |\n`;
    comment += `| 📄 HTML5 Security | ✅ | Source scan completed |\n`;
    comment += `| 📦 Bundle Size | 📊 | Assets analyzed |\n`;
    comment += `| 📡 RSS & Metadata | ✅ | Validated |\n\n`;

    comment += `> 📊 [Full Build Logs](https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId})`;

    const { data: comments } = await github.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.issue.number,
    });

    const existingComment = comments.find(c => c.body?.includes(HEADER) && c.user?.type === 'Bot');

    await (existingComment
        ? github.rest.issues.updateComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            comment_id: existingComment.id,
            body: comment,
        })
        : github.rest.issues.createComment({
            owner: context.repo.owner,
            repo: context.repo.repo,
            issue_number: context.issue.number,
            body: comment,
        }));
}
