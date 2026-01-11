import fs from "node:fs";
import path from "node:path";

/**
 * Fetch SonarCloud Issues
 *
 * Queries the SonarCloud API for open issues and security hotspots
 * and prints them to the terminal for developer action.
 */

const PROJECT_KEY = process.env.SONAR_PROJECT_KEY || "jmrplens_jmrp.io";
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

/**
 * Fetches data from SonarCloud API with pagination support.
 *
 * @param {string} baseUrl - The base URL for the API request.
 * @param {string} dataKey - The key in the response object containing the items.
 * @returns {Promise<Array>} Resolves with the full list of items.
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
    });

    if (!res.ok) {
      throw new Error(`Sonar API failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const items = data[dataKey] || [];
    allItems.push(...items);

    // Sonar API typically returns 100 items per page by default with ps=100
    hasMore = items.length === 100;
    page++;
  }

  return allItems;
}

/**
 * Fetches open issues and security hotspots from SonarCloud API
 * and logs them to the console.
 *
 * @returns {Promise<void>} Resolves when fetching is complete.
 */
try {
  logger.info(
    `\n🔍 Fetching open issues from SonarCloud for [${PROJECT_KEY}]...\n`,
  );

  const [issues, hotspots] = await Promise.all([
    fetchWithPagination(
      `https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false`,
      "issues",
    ),
    fetchWithPagination(
      `https://sonarcloud.io/api/hotspots/search?projectKey=${PROJECT_KEY}&status=TO_REVIEW`,
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

    for (const h of hotspots) {
      const isSuppressed = await checkNoSonar(h.component, h.line);

      if (isSuppressed) {
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
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`❌ Failed to fetch SonarCloud reports: ${message}`);
  process.exit(1);
}

/**
 * Checks if a file has a NOSONAR comment at a specific line.
 *
 * @param {string} component - Sonar component key (e.g., jmrplens_jmrp.io:path/to/file)
 * @param {number} line - Line number to check
 * @returns {Promise<boolean>} Resolves to true if NOSONAR is found
 */
async function checkNoSonar(component, line) {
  if (!line) return false;
  try {
    // Component usually has the format "project_key:relative/path"
    const filePath = component.split(":").pop();
    const fullPath = path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(fullPath)) return false;

    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n");

    // Check both the reported line and the one immediately preceding it
    const targetLine = (lines[line - 1] || "").toUpperCase();
    const precedingLine = (lines[line - 2] || "").toUpperCase();

    return targetLine.includes("NOSONAR") || precedingLine.includes("NOSONAR");
  } catch {
    return false;
  }
}
logger.info("\n" + "".padEnd(80, "=") + "\n");
