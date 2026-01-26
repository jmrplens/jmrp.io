/**
 * deploy-report.mjs
 *
 * Deploys a directory to Vercel and returns the deployment URL.
 * Handles project creation and ensures a public, non-interactive deployment.
 *
 * Usage: node deploy-report.mjs <dir> <project-name>
 */

import { execSync } from "node:child_process";

const dir = process.argv[2];
const projectName = process.argv[3];
const token = process.env.VERCEL_TOKEN;

if (!dir || !projectName) {
  console.error("Usage: node deploy-report.mjs <dir> <project-name>");
  process.exit(1);
}

// Input sanitization to prevent command injection
// - dir: allows paths with slashes, dots, hyphens, underscores
// - projectName: stricter, only alphanumeric, hyphens, underscores (Vercel-compatible)
const dirPattern = /^[a-zA-Z0-9_.\-/]+$/;
const projectNamePattern = /^[a-zA-Z0-9_-]+$/;

if (
  !dirPattern.test(dir) ||
  !projectNamePattern.test(projectName) ||
  dir.includes("..") ||
  projectName.includes("..")
) {
  console.error(
    "Invalid directory or project name: contains unsafe characters",
  );
  process.exit(1);
}

if (!token) {
  console.error("VERCEL_TOKEN environment variable is required.");
  process.exit(1);
}

try {
  console.log(`🚀 Deploying ${dir} to Vercel as ${projectName}...`);

  // --yes: skip prompts
  // --public: required for some accounts/plans
  // Note: We do NOT pass --production, so this creates a preview deploy.
  // Vercel allocates a unique URL for every deploy regardless.
  // Pass token via env to avoid exposure in process list/logs
  const cmd = `npx vercel deploy ${dir} --name=${projectName} --yes --public`;

  const output = execSync(cmd, {
    // NOSONAR: Command is safe due to prior input validation
    encoding: "utf-8",
    env: { ...process.env, VERCEL_TOKEN: token },
    timeout: 300_000, // 5 minutes timeout
  });

  // Robustly extract the Vercel deployment URL from output
  const lines = output.split("\n");
  const urlLine = lines.find((l) => l.includes("vercel.app"));
  let previewUrl = null;

  if (urlLine) {
    // Robust extraction without complex regex to satisfy Sonar
    const startIdx = urlLine.indexOf("https://");
    if (startIdx !== -1) {
      const potentialUrl = urlLine.substring(startIdx).split(/\s/)[0];
      previewUrl = potentialUrl.replace(/[.,;:!?)>\]]+$/, "");
    }
  }

  if (previewUrl) {
    console.log(`✅ Deployment successful!`);
    // Output the URL in a way that can be captured by GH Actions
    console.log(`DEPLOY_URL=${previewUrl}`);
  } else {
    console.error("❌ Could not find deployment URL in output.");
    console.log(output);
    process.exit(1);
  }
} catch (error) {
  console.error("❌ Vercel deployment failed.");
  console.error(error.stderr || error.stdout || error.message);
  process.exit(1);
}
