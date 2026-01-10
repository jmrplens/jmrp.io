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

  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Failed to parse Playwright report (${path.relative(workspace, reportPath)}):`,
      message,
    );
    return;
  }

  if (!report?.stats) {
    console.error("Invalid report structure: missing stats");
    return;
  }
  const stats = report.stats;

  // Defensive: ensure all fields are numbers, defaulting to 0 if missing
  const passed = Number(stats.expected ?? 0);
  const failed = Number(stats.unexpected ?? 0);
  const flaky = Number(stats.flaky ?? 0);
  const skipped = Number(stats.skipped ?? 0);
  const total = passed + failed + flaky + skipped;

  const isSuccess = failed === 0;
  const icon = isSuccess ? "✅" : "🔴";
  const status = isSuccess ? "**Passed!**" : "**Failures detected**";

  let body = `### 🎭 Functional Tests\n\n${icon} ${status}\n\n`;

  body += "| Metric | Value |\n";
  body += "| :--- | :--- |\n";
  body += `| 🧪 Total Tests | **${total}** |\n`;
  body += `| ✅ Passed | **${passed}** |\n`;
  body += `| ❌ Failed | **${failed}** |\n`;
  if (flaky > 0) body += `| 🟠 Flaky | **${flaky}** |\n`;
  if (skipped > 0) body += `| ⏩ Skipped | **${skipped}** |\n`;

  if (surgeUrl) {
    body += `| 🌐 Full Report | [**Open Interactive Report**](https://${surgeUrl}) 🚀 |\n`;
  }
  body += "\n";

  if (failed > 0) {
    body += "<details>\n<summary><b>🔍 View Failed Tests</b></summary>\n\n";

    // Helper to traverse suites and find failed tests
    function findFailedTests(suite) {
      let failedTests = [];
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

    if (!report?.suites) {
      console.error("Invalid report structure: missing suites");
      return;
    }
    const failedTests = findFailedTests({ suites: report.suites });

    for (const spec of failedTests) {
      body += `- **${spec.title}** (${spec.file})\n`;
    }
    body += "</details>\n\n";
  } else {
    body += "> All functional tests passed! ✨\n";
  }

  // Post or update the comment
  if (context.payload.pull_request) {
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
}
