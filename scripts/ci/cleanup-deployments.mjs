/**
 * cleanup-deployments.mjs
 *
 * Deletes Vercel deployments for a specific PR based on metadata.
 *
 * Usage: node cleanup-deployments.mjs <pr-id>
 */

import { execSync } from "node:child_process";

const prId = process.argv[2];
const token = process.env.VERCEL_TOKEN;

// Validate prId to prevent command injection (must be numeric)
if (prId && !/^\d+$/.test(prId)) {
  console.error("Error: PR ID must be numeric.");
  process.exit(1);
}

if (!prId) {
  console.error("Usage: node cleanup-deployments.mjs <pr-id>");
  process.exit(1);
}

if (!token) {
  console.error("VERCEL_TOKEN environment variable is required.");
  process.exit(1);
}

const projectName = "jmrp-ci-reports";

try {
  console.log(`🔍 Searching for deployments for PR #${prId}...`);

  // We use -m prid=<prId> to filter deployments.
  // We try to get output as a list of URLs/IDs.
  // Note: 'vercel list' doesn't always support --json in every env,
  // but it usually outputs a table where we can extract URLs.
  const cmd = `npx vercel ls ${projectName} -m prid=${prId}`;
  const output = execSync(cmd, {
    encoding: "utf-8",
    env: { ...process.env, VERCEL_TOKEN: token },
  });

  // Extract URLs from the output table.
  // Vercel output usually looks like:
  // project-id  url  status  age
  // ...
  const lines = output.split("\n");
  const urls = [];

  // Simple regex to find .vercel.app URLs
  const urlRegex = /https?:\/\/[a-zA-Z0-9-]+\.vercel\.app/;

  for (const line of lines) {
    const match = urlRegex.exec(line);
    if (match) {
      urls.push(match[0]);
    }
  }

  if (urls.length === 0) {
    console.log(`✅ No deployments found for PR #${prId}. Nothing to cleanup.`);
    process.exit(0);
  }

  console.log(`🗑️ Found ${urls.length} deployment(s). Deleting...`);

  for (const url of urls) {
    console.log(`  - Deleting ${url}...`);
    try {
      execSync(`npx vercel rm ${url} --yes`, {
        stdio: "inherit",
        env: { ...process.env, VERCEL_TOKEN: token },
      });
      console.log(`    ✅ Deleted.`);
    } catch (rmError) {
      console.error(`    ❌ Failed to delete ${url}: ${rmError.message}`);
    }
  }

  console.log("🎊 Cleanup complete.");
} catch (error) {
  console.error("❌ Failed to cleanup deployments.");
  console.error(error.message);
  process.exit(1);
}
