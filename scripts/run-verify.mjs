/**
 * Quality Assurance Orchestrator (Verify)
 *
 * This script runs the full suite of quality checks for the project.
 * It replaces the long and complex 'verify' script in package.json.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

// Load environment variables from .env if present
if (fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  for (const line of envContent.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }
    const match = trimmedLine.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replaceAll(/^["']|["']$/g, ""); // Remove quotes
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

// ANSI colors for pretty output
const colors = {
  reset: "\u001B[0m",
  bright: "\u001B[1m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  cyan: "\u001B[36m",
  magenta: "\u001B[35m",
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

/**
 * Main verification suite orchestrator.
 * Defines the steps to run and executes them sequentially.
 *
 * @returns {Promise<void>} Resolves when all checks pass.
 */
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
      name: "Lint: JSDoc Coverage",
      command: "node scripts/ci/calculate-jsdoc-coverage.mjs",
    },
    {
      name: "Security: Snyk Audit",
      command: "pnpm exec snyk test --all-projects --severity-threshold=high",
      condition: () => !!process.env.SNYK_TOKEN,
    },
    {
      name: "Security: SonarCloud Analysis",
      command: "pnpm exec sonar-scanner",
      condition: () => !!process.env.SONAR_TOKEN,
    },
    {
      name: "Analyze: SonarCloud Issues",
      command: "node scripts/ci/get-sonar-issues.mjs",
      condition: () => !!process.env.SONAR_TOKEN,
    },
    { name: "Tests: Playwright E2E", command: "pnpm test:e2e" },
  ];

  let failedSteps = [];

  for (const step of steps) {
    const success = runStep(step.name, step.command, step.condition ?? true);
    if (!success) {
      failedSteps.push(step.name);
      // If SonarCloud Analysis failed (likely Quality Gate), continue to the next step
      // to fetch and display the issues so the user knows what went wrong.
      if (step.name === "Security: SonarCloud Analysis") {
        continue;
      }
      // For other steps, fail fast
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
  for (const f of reportFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Verify] Warning: Pre-run cleanup failed: ${message}`);
}

runVerify().catch((error) => {
  console.error(error);
  process.exit(1);
});
