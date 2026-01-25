/**
 * cleanup-deployments.mjs
 *
 * Removes Vercel deployments associated with a specific Pull Request.
 * Uses the 'prid' metadata attached during deployment to identify targets.
 */

import { execSync } from "node:child_process";

const PROJECT_NAME = "jmrp-ci-reports";
const TOKEN = process.env.VERCEL_TOKEN;
const PR_NUMBER = process.env.PR_NUMBER;

if (!TOKEN) {
  console.error("❌ VERCEL_TOKEN environment variable is required.");
  process.exit(1);
}

if (!PR_NUMBER) {
  console.error("❌ PR_NUMBER environment variable is required.");
  process.exit(1);
}

/**
 * Executes a shell command and returns the output.
 */
function run(cmd) {
  // Suppress stdout to reduce noise, but show stderr if needed
  return execSync(cmd, {
    encoding: "utf-8",
    env: { ...process.env },
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/**
 * Fetches a page of deployments from Vercel.
 */
function getDeployments(next = "") {
  try {
    // We fetch all deployments and filter client-side because Vercel CLI 'ls'
    // filtering capabilities are limited for custom metadata in some versions.
    // 'meta-prid' filter might work in API but CLI support varies.
    // We'll fetch listing and filter manually to be safe.
    const cmd = `npx vercel ls ${PROJECT_NAME} --token=${TOKEN} --format json ${next ? `--next ${next}` : ""}`;
    const output = run(cmd);
    return JSON.parse(output);
  } catch (e) {
    console.error("⚠ Failed to list deployments:", e.message);
    return null;
  }
}

async function cleanup() {
  console.log(`🧹 Starting cleanup for PR #${PR_NUMBER} in project: ${PROJECT_NAME}`);

  let hasMore = true;
  let next = "";
  let deletedCount = 0;
  let scannedCount = 0;

  while (hasMore) {
    const data = getDeployments(next);

    if (!data || !data.deployments || data.deployments.length === 0) {
      break;
    }

    scannedCount += data.deployments.length;

    // Filter deployments matching the PR ID
    const targetDeployments = data.deployments.filter((d) => {
      // Check metadata for prid
      // Note: Vercel JSON output puts metadata in 'meta' object
      return d.meta && d.meta.prid === String(PR_NUMBER);
    });

    if (targetDeployments.length > 0) {
      console.log(`   Found ${targetDeployments.length} deployments for PR #${PR_NUMBER} in this batch.`);

      for (const dep of targetDeployments) {
        try {
          process.stdout.write(`   🗑️ Deleting ${dep.url}... `);
          // Use 'url' or 'uid' for removal. 'url' is safer as it's visible.
          run(`npx vercel rm ${dep.url} --token=${TOKEN} --yes`);
          console.log("✅");
          deletedCount++;
        } catch (e) {
          console.log("❌");
          console.error(`   Failed to remove ${dep.url}:`, e.message);
        }
      }
    }

    // Pagination
    if (data.pagination && data.pagination.next) {
      next = data.pagination.next;
    } else {
      hasMore = false;
    }
  }

  console.log(`
✨ Cleanup complete!`);
  console.log(`   - Scanned: ${scannedCount} deployments`);
  console.log(`   - Deleted: ${deletedCount} deployments for PR #${PR_NUMBER}`);
}

cleanup().catch((err) => {
  console.error("Fatal error during cleanup:", err);
  process.exit(1);
});
