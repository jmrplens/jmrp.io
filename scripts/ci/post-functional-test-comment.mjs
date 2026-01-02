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
  const reportPath = path.join(
    process.env.GITHUB_WORKSPACE,
    "playwright-report/results.json",
  );
  const surgeUrl = process.env.SURGE_URL;

  if (!fs.existsSync(reportPath)) {
    console.log("Playwright JSON report not found.");
    return;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const stats = report.stats;

  const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
  const passed = stats.expected;
  const failed = stats.unexpected;
  const flaky = stats.flaky;
  const skipped = stats.skipped;

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
        failedTests = failedTests.concat(findFailedTests(child));
      }
      return failedTests;
    }

    const failedTests = findFailedTests({ suites: report.suites });

    failedTests.forEach((spec) => {
      body += `- **${spec.title}** (${spec.file})\n`;
    });
    body += "</details>\n\n";
  } else {
    body += "> All functional tests passed! ✨\n";
  }

  // Post the comment
  if (context.payload.pull_request) {
    await github.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      body: body,
    });
  }
}
