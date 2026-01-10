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
    for (const h of hotspots) {
      logger.info(`  - ${h.message}`);
      logger.info(`    📍 ${h.component} (Line ${h.line || "N/A"})`);
    }
  }

  if (issues.length > 0 || hotspots.length > 0) {
    logger.info(
      "\n❌ Static analysis failed: Open issues or hotspots detected.",
    );
    process.exit(1);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`❌ Failed to fetch SonarCloud reports: ${message}`);
  process.exit(1);
}
logger.info("\n" + "".padEnd(80, "=") + "\n");
