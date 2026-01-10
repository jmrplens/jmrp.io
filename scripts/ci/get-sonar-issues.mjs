/**
 * Fetch SonarCloud Issues
 *
 * Queries the SonarCloud API for open issues and security hotspots
 * and prints them to the terminal for developer action.
 */

const PROJECT_KEY = process.env.SONAR_PROJECT_KEY || "jmrplens_jmrp.io";
const SONAR_TOKEN = process.env.SONAR_TOKEN;

if (!SONAR_TOKEN) {
  console.log("⏭ Skipping SonarCloud analysis (SONAR_TOKEN not set)");
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
async function fetchIssues() {
  console.log(
    `\n🔍 Fetching open issues from SonarCloud for [${PROJECT_KEY}]...\n`,
  );

  try {
    // 1. Fetch Issues
    const issues = await fetchWithPagination(
      `https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false`,
      "issues",
    );

    if (issues.length === 0) {
      console.log("✅ No open issues found in SonarCloud.");
    } else {
      console.log(`⚠️ Found ${issues.length} open issues:`);
      for (const [index, issue] of issues.entries()) {
        const severityColor =
          issue.severity === "CRITICAL" || issue.severity === "BLOCKER"
            ? "\u001B[31m"
            : "\u001B[33m";
        console.log(
          `\n  ${index + 1}. [${severityColor}${issue.severity}\u001B[0m] ${issue.message}`,
        );
        console.log(`     📍 ${issue.component} (Line ${issue.line || "N/A"})`);
        console.log(
          `     🔗 https://sonarcloud.io/project/issues?id=${PROJECT_KEY}&open=${issue.key}`,
        );
      }
    }

    // 2. Fetch Security Hotspots (TO_REVIEW)
    const hotspots = await fetchWithPagination(
      `https://sonarcloud.io/api/hotspots/search?projectKey=${PROJECT_KEY}&status=TO_REVIEW`,
      "hotspots",
    );

    if (hotspots.length > 0) {
      console.log(`\n🔥 Found ${hotspots.length} security hotspots to review:`);
      for (const [index, h] of hotspots.entries()) {
        console.log(
          `  - ${index + 1}. [${h.vulnerabilityProbability}] ${h.message}`,
        );
        console.log(`    📍 ${h.component} (Line ${h.line || "N/A"})`);
      }
    }

    if (issues.length > 0 || hotspots.length > 0) {
      console.log(
        "\n❌ Static analysis failed: Open issues or hotspots detected.",
      );
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to fetch SonarCloud reports:", error.message);
    process.exit(1);
  }
  console.log("\n" + "".padEnd(80, "=") + "\n");
}

fetchIssues();
