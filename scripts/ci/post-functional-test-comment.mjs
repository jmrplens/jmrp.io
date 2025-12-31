import fs from "fs";
import path from "path";

export default async function script({ github, context }) {
  const reportPath = path.join(
    process.env.GITHUB_WORKSPACE,
    "playwright-report/results.json",
  );

  if (!fs.existsSync(reportPath)) {
    console.log("Playwright JSON report not found.");
    return;
  }

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const stats = report.stats;
  const suites = report.suites;

  const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
  const passed = stats.expected;
  const failed = stats.unexpected;
  const flaky = stats.flaky;
  const skipped = stats.skipped;

  let body = `## 🎭 Playwright Functional Tests Report\n\n`;

  if (failed > 0) {
    body += `🔴 **Failed**: ${failed}\n`;
  } else if (flaky > 0) {
    body += `🟠 **Flaky**: ${flaky}\n`;
  } else {
    body += `🟢 **Passed**: ${passed}\n`;
  }

  body += `\n**Total Tests**: ${total} | **Passed**: ${passed} | **Failed**: ${failed} | **Skipped**: ${skipped}\n\n`;

  if (failed > 0) {
    body += `### ❌ Failed Tests\n\n`;

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
      // Optionally add error details if needed, but keeping it brief for now
    });

    body += `\n[View Full Report](${process.env.SURGE_URL})\n`;
  } else {
    body += `All functional tests passed! ✅\n`;
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
