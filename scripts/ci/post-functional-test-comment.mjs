import fs from "node:fs";
import path from "node:path";

/**
 * GitHub Comment Poster: Functional Tests
 *
 * Integration script for GitHub Actions.
 * Reads the Playwright JSON report and posts a summary table
 * with a link to the Surge deployment.
 */
export default async function script({ github, context }) {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const reportPath = path.join(workspace, "playwright-report/results.json");
  const surgeUrl = process.env.SURGE_URL;

  if (!fs.existsSync(reportPath)) {
    console.log("Playwright JSON report not found.");
    return;
  }

  const report = loadReport(reportPath, workspace);
  if (!report) return;

  const body = buildCommentBody(report, surgeUrl);
  if (!body) return;

  await postOrUpdateComment(github, context, body);
}

function loadReport(reportPath, workspace) {
  try {
    const content = fs.readFileSync(reportPath, "utf-8");
    const report = JSON.parse(content);
    if (!report?.stats) {
      console.error("Invalid report structure: missing stats");
      return null;
    }
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to parse Playwright report (${path.relative(workspace, reportPath)}):`,
      message,
    );
    return null;
  }
}

function buildCommentBody(report, surgeUrl) {
  const stats = report.stats;
  const passed = Number(stats.expected ?? 0);
  const failed = Number(stats.unexpected ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  const skipped = Number(stats.skipped ?? 0);
  const total = passed + failed + flaky + skipped;

  const isSuccess = failed === 0;
  const icon = isSuccess ? "✅" : "🔴";
  const status = isSuccess ? "**Passed!**" : "**Failures detected**";

  let body = `### 🎭 Functional Tests\n\n${icon} ${status}\n\n`;
  body += buildStatsTable(total, passed, failed, flaky, skipped, surgeUrl);
  body += "\n";
  body += buildFailureDetails(report, failed);

  return body;
}

function buildStatsTable(total, passed, failed, flaky, skipped, surgeUrl) {
  let table = "| Metric | Value |\n| :--- | :--- |\n";
  table += `| 🧪 Total Tests | **${total}** |\n`;
  table += `| ✅ Passed | **${passed}** |\n`;
  table += `| ❌ Failed | **${failed}** |\n`;
  if (flaky > 0) table += `| 🟠 Flaky | **${flaky}** |\n`;
  if (skipped > 0) table += `| ⏩ Skipped | **${skipped}** |\n`;
  if (surgeUrl) {
    table += `| 🌐 Full Report | [**Open Interactive Report**](https://${surgeUrl}) 🚀 |\n`;
  }
  return table;
}

function buildFailureDetails(report, failed) {
  if (failed === 0) {
    return "> All functional tests passed! ✨\n";
  }

  let details = "<details>\n<summary><b>🔍 View Failed Tests</b></summary>\n\n";
  const failedTests = findFailedTests({ suites: report.suites });

  for (const spec of failedTests) {
    details += `- **${spec.title}** (${spec.file})\n`;
  }
  details += "</details>\n\n";
  return details;
}

function findFailedTests(suite) {
  let failedTests = [];
  if (!suite) return failedTests;

  for (const spec of suite.specs || []) {
    if (spec.ok === false) {
      failedTests.push(spec);
    }
  }
  for (const child of suite.suites || []) {
    failedTests = [...failedTests, ...findFailedTests(child)];
  }
  return failedTests;
}

async function postOrUpdateComment(github, context, body) {
  if (!context.payload.pull_request) return;

  const header = "### 🎭 Functional Tests";
  const { data: comments } = await github.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
  });

  const existingComment = comments.find((c) => c.body?.includes(header));

  await (existingComment
    ? github.rest.issues.updateComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        comment_id: existingComment.id,
        body: body,
      })
    : github.rest.issues.createComment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request.number,
        body: body,
      }));
}
