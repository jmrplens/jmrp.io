/**
 * Quality Assurance Orchestrator (Verify)
 *
 * This script runs the full suite of quality checks for the project.
 * It replaces the long and complex 'verify' script in package.json.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

// Load environment variables from .env if present
try {
  if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Verify] Warning: Failed to load .env file: ${message}`);
}

// ANSI colors for pretty output
const colors = {
  reset: "\u{1B}[0m",
  bright: "\u{1B}[1m",
  green: "\u{1B}[32m",
  yellow: "\u{1B}[33m",
  red: "\u{1B}[31m",
  cyan: "\u{1B}[36m",
  magenta: "\u{1B}[35m",
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
    execSync(command, {
      stdio: "inherit",
    });
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
 * @returns {boolean} Returns true if all checks pass, false otherwise.
 */
function runVerify() {
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
    {
      name: "Static: Astro Check",
      command: "pnpm typecheck --minimumFailingSeverity warning",
    },
    { name: "Static: ESLint", command: "pnpm lint --max-warnings=0" },
    { name: "Static: Prettier", command: "pnpm exec prettier --check ." },
    { name: "Lint: CSS (Stylelint)", command: "pnpm lint:css" },
    {
      name: "Lint: Token sync",
      command: "node scripts/ci/check-token-sync.mjs",
    },
    { name: "Build: Production Build", command: "pnpm run build" },
    {
      name: "ATS: CV Compatibility",
      command: "node scripts/cv/verify-ats.mjs",
    },
    { name: "Lint: HTML5 Validation", command: "pnpm lint:html" },
    {
      name: "Lint: RSS Feed",
      command: "node scripts/ci/validate-rss.mjs dist",
    },
    // Schema.org JSON-LD correctness is enforced at build time via schema-dts
    // types (`satisfies`) on the schema builders, checked by `astro check`
    // above — the official Google Schema.org TypeScript vocabulary, far more
    // thorough than the previous hand-rolled output checker.
    { name: "Lint: Spelling (CSpell)", command: "pnpm exec cspell lint ." },
    {
      name: "Lint: Broken Links (Lychee)",
      command: "lychee --config lychee.toml --root-dir dist dist/**/*.html",
    },
    {
      name: "Lint: JSDoc Coverage",
      command: "node scripts/ci/calculate-jsdoc-coverage.mjs",
    },
    {
      name: "Security: SonarCloud Analysis",
      command: "pnpm exec sonar-scanner",
      condition: () => !!process.env.SONAR_TOKEN,
    },
    {
      name: "Analyze: SonarCloud Issues",
      command: "node scripts/ci/get-sonar-issues.mjs",
      // Project key falls back to sonar-project.properties, so SONAR_TOKEN alone
      // is enough to gate this step.
      condition: () => !!process.env.SONAR_TOKEN,
    },
    { name: "Tests: Playwright E2E", command: "pnpm test:e2e" },
  ];

  let failedSteps = [];

  for (const step of steps) {
    const success = runStep(step.name, step.command, step.condition ?? true);
    if (!success) {
      // Security: SonarCloud Analysis is just the upload phase now.
      // The actual failure logic is handled by "Analyze: SonarCloud Issues".
      if (step.name === "Security: SonarCloud Analysis") {
        console.warn(
          `${colors.yellow}⚠️ ${step.name} finished with warnings, continuing...${colors.reset}`,
        );
        continue;
      }

      // Sonar issues step should not block subsequent steps like E2E tests,
      // but it will be recorded as a failure at the end.
      if (step.name === "Analyze: SonarCloud Issues") {
        failedSteps.push(step.name);
        continue;
      }

      failedSteps.push(step.name);
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
    return true;
  }
  console.error(
    `${colors.red}${colors.bright}💥 VERIFICATION FAILED! (${duration}s)${colors.reset}`,
  );
  console.error(
    `${colors.red}   Failed step: ${failedSteps[0]}${colors.reset}`,
  );
  return false;
}

// Ensure reports are cleaned before starting
try {
  const reportFiles = ["html-validation.json", "rss-validation.json"];
  for (const f of reportFiles) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Verify] Warning: Pre-run cleanup failed: ${message}`);
}

try {
  const success = runVerify();
  process.exit(success ? 0 : 1);
} catch (error) {
  console.error(error);
  process.exit(1);
}
