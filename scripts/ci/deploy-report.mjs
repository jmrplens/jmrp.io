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
if (
  !/^[a-zA-Z0-9_.\-/]+$/.test(dir) ||
  !/^[a-zA-Z0-9_.\-/]+$/.test(projectName)
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

  // --yes skip prompts
  // --public is required for some accounts/plans
  // --production is used here to get a 'stable' subdomain if possible,
  // though for PRs we usually want preview.
  // Actually, Vercel gives a unique URL for every deploy.
  // Pass token via env to avoid exposure in process list/logs
  const cmd = `npx vercel deploy ${dir} --name=${projectName} --yes --public`;

  const output = execSync(cmd, {
    encoding: "utf-8",
    env: { ...process.env, VERCEL_TOKEN: token },
    timeout: 300_000, // 5 minutes timeout
  });

  // Vercel CLI outputs the URL as the only thing in stdout if it's a successful deploy in some versions,
  // but usually it prints progress. We need to extract the URL.
  const lines = output.split("\n");
  const previewUrl = lines.find((line) => line.includes(".vercel.app"))?.trim();

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
  console.error(error.stdout || error.message);
  process.exit(1);
}
