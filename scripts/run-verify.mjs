/**
 * Quality Assurance Orchestrator (Verify)
 *
 * This script runs the full suite of quality checks for the project.
 * It replaces the long and complex 'verify' script in package.json.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

// ANSI colors for pretty output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

/**
 * Executes a shell command and manages output/errors.
 */
function runStep(name, command, condition = true) {
  if (typeof condition === "function") condition = condition();

  if (!condition) {
    console.log(
      `${colors.yellow}⏭ Skipping ${name} (condition not met)${colors.reset}`,
    );
    return true;
  }

  console.log(
    `${colors.cyan}🚀 Running ${colors.bright}${name}${colors.reset}...`,
  );
  console.log(`${colors.reset}   ${command}`);

  try {
    execSync(command, { stdio: "inherit", encoding: "utf8" });
    console.log(`${colors.green}✅ ${name} passed!${colors.reset}\n`);
    return true;
  } catch {
    console.error(`${colors.red}❌ ${name} failed!${colors.reset}\n`);
    return false;
  }
}

async function runVerify() {
  const startTime = Date.now();
  console.log(
    `\n${colors.magenta}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
  );
  console.log(
    `${colors.magenta}${colors.bright}🔍 Starting Project Verification Suite${colors.reset}`,
  );
  console.log(
    `${colors.magenta}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`,
  );

  const steps = [
    { name: "Static: Astro Check", command: "pnpm typecheck" },
    { name: "Static: ESLint", command: "pnpm lint" },
    { name: "Static: Prettier", command: "pnpm exec prettier --check ." },
    { name: "Build: Production Build", command: "pnpm run build" },
    { name: "Lint: HTML5 Validation", command: "pnpm lint:html" },
    {
      name: "Lint: RSS Feed",
      command: "node scripts/ci/validate-rss.mjs dist/rss.xml",
    },
    {
      name: "Lint: Schema.org JSON-LD",
      command: "node scripts/ci/validate-schema.mjs dist",
    },
    { name: "Lint: Spelling (Typos)", command: "typos" },
    {
      name: "Lint: Broken Links (Lychee)",
      command: "lychee --config lychee.toml --root-dir dist dist/**/*.html",
    },
    {
      name: "Security: Snyk Audit",
      command: "pnpm exec snyk test --all-projects --severity-threshold=high",
      condition: () => !!process.env.SNYK_TOKEN,
    },
    { name: "Tests: Playwright E2E", command: "pnpm test:e2e" },
  ];

  let failedSteps = [];

  for (const step of steps) {
    const success = runStep(step.name, step.command, step.condition ?? true);
    if (!success) {
      failedSteps.push(step.name);
      // In verify, we want to fail fast to save time
      break;
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `${colors.magenta}${colors.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
  );
  if (failedSteps.length === 0) {
    console.log(
      `${colors.green}${colors.bright}✨ ALL CHECKS PASSED SUCCESSFULLY! (${duration}s)${colors.reset}`,
    );
    process.exit(0);
  } else {
    console.error(
      `${colors.red}${colors.bright}💥 VERIFICATION FAILED! (${duration}s)${colors.reset}`,
    );
    console.error(
      `${colors.red}   Failed step: ${failedSteps[0]}${colors.reset}`,
    );
    process.exit(1);
  }
}

// Ensure reports are cleaned before starting
try {
  const reportFiles = [
    "schema-report.json",
    "html-validation.json",
    "rss-validation.json",
  ];
  reportFiles.forEach((f) => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
} catch (err) {
  console.warn(`[Verify] Warning: Pre-run cleanup failed: ${err.message}`);
}

runVerify().catch((err) => {
  console.error(err);
  process.exit(1);
});
