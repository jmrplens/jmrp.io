import fs from "node:fs";
import path from "node:path";

/**
 * Fetch SonarCloud Issues
 *
 * Queries the SonarCloud API for open issues and security hotspots
 * and prints them to the terminal for developer action.
 */

const PROJECT_KEY = process.env.SONAR_PROJECT_KEY;
const SONAR_TOKEN = process.env.SONAR_TOKEN;

const logger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

if (!SONAR_TOKEN) {
  logger.info("⏭ Skipping SonarCloud analysis (SONAR_TOKEN not set)");
  process.exit(0);
}

if (!PROJECT_KEY) {
  logger.error("❌ SONAR_PROJECT_KEY is not set.");
  process.exit(1);
}

/**
 * Fetches data from SonarCloud API with pagination support.
 */
async function fetchWithPagination(baseUrl, dataKey) {
  const allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const url = `${baseUrl}${separator}ps=100&p=${page}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SONAR_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      throw new Error(`Sonar API failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const items = data[dataKey] || [];
    allItems.push(...items);

    hasMore = items.length === 100;
    page++;
  }

  return allItems;
}

/**
 * Checks if a file has a NOSONAR comment at a specific line.
 */
async function checkNoSonar(component, line) {
  if (!line) return false;

  const repoRoot = process.cwd();

  try {
    // Sonar component keys can be tricky. Format: "project_key:relative/path"
    // Extract path after the colon
    const parts = component.split(":");
    let filePath = parts.length > 1 ? parts.slice(1).join(":") : component;

    // Remove any leading project key prefix if it leaked into the path
    if (filePath.startsWith(PROJECT_KEY + ":")) {
      filePath = filePath.replace(PROJECT_KEY + ":", "");
    }

    const possiblePaths = [
      path.resolve(repoRoot, filePath),
      path.resolve(repoRoot, filePath.replace(/^src\//, "")),
      path.resolve(repoRoot, filePath.replace(/^scripts\//, "")),
    ];

    let fullPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        fullPath = p;
        break;
      }
    }

    if (!fullPath) {
      return false;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    // Narrow window to exactly the line and its immediate neighbors (±1)
    const start = Math.max(0, line - 2);
    const end = Math.min(lines.length, line + 1);
    const windowLines = lines.slice(start, end);

    return windowLines.some((l) => (l || "").toUpperCase().includes("NOSONAR"));
  } catch (error) {
    logger.warn(
      `Failed to check NOSONAR for ${component}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/**
 * Main execution
 */
try {
  // Give SonarCloud a few seconds to process the new analysis
  logger.info("⏳ Waiting for SonarCloud to process analysis...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.info(
    `\n🔍 Fetching open issues from SonarCloud for [${PROJECT_KEY}]...\n`,
  );

  const encodedProjectKey = encodeURIComponent(PROJECT_KEY);

  const [issues, hotspots] = await Promise.all([
    fetchWithPagination(
      `https://sonarcloud.io/api/issues/search?componentKeys=${encodedProjectKey}&resolved=false`,
      "issues",
    ),
    fetchWithPagination(
      `https://sonarcloud.io/api/hotspots/search?projectKey=${encodedProjectKey}&status=TO_REVIEW`,
      "hotspots",
    ),
  ]);

  logger.info("".padEnd(80, "="));
  logger.info(`📊 SONARCLOUD REPORT for ${PROJECT_KEY}`);
  logger.info("".padEnd(80, "="));

  if (issues.length === 0) {
    logger.info("\n✅ No open issues found.");
  } else {
    logger.info(`\n❌ Found ${issues.length} open issues:`);
    for (const issue of issues) {
      logger.info(`  - [${issue.severity}] ${issue.message}`);
      logger.info(`    📍 ${issue.component} (Line ${issue.line || "N/A"})`);
    }
  }

  if (hotspots.length === 0) {
    logger.info("\n✅ No security hotspots to review.");
  } else {
    logger.info(`\n🚨 Found ${hotspots.length} security hotspots:`);
    let manualReviewCount = 0;

    const suppressionResults = await Promise.all(
      hotspots.map((h) => checkNoSonar(h.component, h.line)),
    );

    for (const [i, h] of hotspots.entries()) {
      if (suppressionResults[i]) {
        logger.info(
          `  - [SUPPRESSED] ${h.message} (📍 ${h.component}:${h.line || "N/A"})`,
        );
      } else {
        logger.info(`  - ${h.message}`);
        logger.info(`    📍 ${h.component} (Line ${h.line || "N/A"})`);
        manualReviewCount++;
      }
    }

    if (manualReviewCount > 0) {
      logger.info(
        `\n❌ Static analysis failed: ${manualReviewCount} unsuppressed hotspots detected.`,
      );
      process.exit(1);
    } else {
      logger.info(
        "\n✅ All identified hotspots are suppressed with NOSONAR comments.",
      );
    }
  }

    if (issues.length > 0) {
      logger.info("\n❌ Static analysis failed: Open issues detected.");
      process.exit(1);
    }
  } catch (error) {
    logger.error(`❌ Failed to fetch SonarCloud reports: ${error.message}`);
    process.exit(1);
  } finally {
    logger.info("\n" + "".padEnd(80, "=") + "\n");
  }
}

await main();
