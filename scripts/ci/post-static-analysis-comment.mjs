/**
 * post-static-analysis-comment.mjs
 *
 * Aggregates results from various static analysis tools (ESLint, Prettier, Astro, Lychee, Typos, Audit)
 * and posts a unified summary table to the GitHub Pull Request.
 */

// Helper to get status icon
const getStatusIcon = (outcome) => {
  return outcome === "success" ? "✅" : "❌";
};

// SVG Logos for tools
const LOGOS = {
  astro:
    "https://img.shields.io/badge/Astro-0C1222?style=flat&logo=astro&logoColor=white",
  prettier:
    "https://img.shields.io/badge/Prettier-F7B93E?style=flat&logo=prettier&logoColor=black",
  eslint:
    "https://img.shields.io/badge/ESLint-4B32C3?style=flat&logo=eslint&logoColor=white",
  lychee:
    "https://img.shields.io/badge/Lychee-232323?style=flat&logo=linktree&logoColor=white", // Using generic link icon/shield
  typos:
    "https://img.shields.io/badge/Typos-grey?style=flat&logo=microsoftexcel&logoColor=white", // Placeholder or generic text icon
  security:
    "https://img.shields.io/badge/NPM_Audit-CB3837?style=flat&logo=npm&logoColor=white",
  jsdoc:
    "https://img.shields.io/badge/JSDoc-000000?style=flat&logo=javascript&logoColor=white",
};

/**
 * Generates the markdown body for the static analysis PR comment.
 *
 * @param results - Object containing outcomes from various tools.
 * @returns Markdown string for the comment.
 */
function generateComment(results) {
  const tools = [
    { id: "astro", name: "Astro Check", outcome: results.astro },
    { id: "prettier", name: "Prettier", outcome: results.prettier },
    { id: "eslint", name: "ESLint", outcome: results.eslint },
    { id: "lychee", name: "Link Checker", outcome: results.lychee },
    { id: "typos", name: "Spell Checker", outcome: results.typos },
    {
      id: "jsdoc",
      name: "JSDoc Coverage",
      outcome: results.jsdoc,
      value: results.jsdocCoverage,
    },
    { id: "security", name: "Security Audit", outcome: results.security },
  ];

  // Check if all passed
  const allPassed = tools.every(
    (t) => t.outcome === "success" || t.outcome === "skipped" || !t.outcome,
  ); // skipped counts as pass contextually or ignored

  let md = `### 🛡️ Static Analysis Report\n\n`;
  md += allPassed
    ? `> ✅ All static analysis checks passed!\n\n`
    : `> ❌ Some checks failed. Please review the logs.\n\n`;

  md += `| Tool | Status | Outcome |\n`;
  md += `| :--- | :---: | :---: |\n`;

  for (const tool of tools) {
    if (!tool.outcome && !tool.value) continue; // Skip if no data

    const icon = getStatusIcon(tool.outcome);
    const badge = `![${tool.name}](${LOGOS[tool.id]})`;
    // Format outcome to be capitalized or show value
    let outcomeText =
      tool.outcome === "success" || tool.outcome === "failure"
        ? tool.outcome.charAt(0).toUpperCase() + tool.outcome.slice(1)
        : tool.outcome || "Unknown";

    outcomeText = tool.value ? `**${tool.value}**` : `**${outcomeText}**`;

    md += `| ${badge} | ${icon} | ${outcomeText} |\n`;
  }

  md += `\n<details><summary>Debug Info</summary>\n\n\`\`\`json\n${JSON.stringify(results, null, 2)}\n\`\`\`\n</details>`;

  return md;
}

// GitHub Script Entry Point
/**
 * Main execution function for the static analysis comment script.
 * Aggregates results from multiple tools and updates the PR comment.
 *
 * @param {object} params - The GitHub Action context parameters.
 * @param {object} params.github - The authenticated Octokit client.
 * @param {object} params.context - The GitHub Action context object.
 * @returns {Promise<void>} Resolves when the comment is posted or updated.
 */
export default async function postStaticAnalysisComment({ github, context }) {
  // Read step outcomes from environment variables set in the workflow
  const results = {
    astro: process.env.OUTCOME_ASTRO,
    prettier: process.env.OUTCOME_PRETTIER,
    eslint: process.env.OUTCOME_ESLINT,
    lychee: process.env.OUTCOME_LYCHEE,
    typos: process.env.OUTCOME_TYPOS,
    security: process.env.OUTCOME_SECURITY,
    jsdoc: process.env.OUTCOME_JSDOC,
    jsdocCoverage: process.env.JSDOC_COVERAGE,
  };

  if (!context.payload.pull_request) {
    console.log("Not a pull request, skipping comment.");
    return;
  }

  const commentBody = generateComment(results);

  // Post or update comment
  // We identify our comment by a hidden marker or header
  const header = "### 🛡️ Static Analysis Report";

  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
  });

  const existingComment = comments.find((c) => c.body.includes(header));

  if (existingComment) {
    await github.rest.issues.deleteComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingComment.id,
    });
  }

  await github.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.issue.number,
    body: commentBody,
  });
}
