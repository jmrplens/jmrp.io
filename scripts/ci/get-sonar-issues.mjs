/**
 * Fetch SonarCloud Issues
 *
 * Queries the SonarCloud API for open issues and security hotspots
 * and prints them to the terminal for developer action.
 */

const PROJECT_KEY = "jmrplens_jmrp.io";
const SONAR_TOKEN = process.env.SONAR_TOKEN;

if (!SONAR_TOKEN) {
  console.log("⏭ Skipping SonarCloud analysis (SONAR_TOKEN not set)");
  process.exit(0);
}

const auth = Buffer.from(`${SONAR_TOKEN}:`).toString("base64");

async function fetchIssues() {
  console.log(
    `\n🔍 Fetching open issues from SonarCloud for [${PROJECT_KEY}]...\n`,
  );

  try {
    // 1. Fetch Issues
    const issuesUrl = `https://sonarcloud.io/api/issues/search?componentKeys=${PROJECT_KEY}&resolved=false&ps=100`;
    const issuesRes = await fetch(issuesUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!issuesRes.ok) {
      throw new Error(`Sonar API failed: ${issuesRes.statusText}`);
    }

    const issuesData = await issuesRes.json();
    const issues = issuesData.issues || [];

    if (issues.length === 0) {
      console.log("✅ No open issues found in SonarCloud.");
    } else {
      console.log(`⚠️ Found ${issues.length} open issues:`);
      issues.forEach((issue, index) => {
        const severityColor =
          issue.severity === "CRITICAL" || issue.severity === "BLOCKER"
            ? "\x1b[31m"
            : "\x1b[33m";
        console.log(
          `\n  ${index + 1}. [${severityColor}${issue.severity}\x1b[0m] ${issue.message}`,
        );
        console.log(`     📍 ${issue.component} (Line ${issue.line || "N/A"})`);
        console.log(
          `     🔗 https://sonarcloud.io/project/issues?id=${PROJECT_KEY}&open=${issue.key}`,
        );
      });
    }

    // 2. Fetch Security Hotspots
    const hotspotsUrl = `https://sonarcloud.io/api/hotspots/search?projectKey=${PROJECT_KEY}&status=TO_REVIEW`;
    const hotspotsRes = await fetch(hotspotsUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (hotspotsRes.ok) {
      const hotspotsData = await hotspotsRes.json();
      const hotspots = hotspotsData.hotspots || [];
      if (hotspots.length > 0) {
        console.log(
          `\n🔥 Found ${hotspots.length} security hotspots to review:`,
        );
        hotspots.forEach((h, index) => {
          console.log(
            `  - ${index + 1}. [${h.vulnerabilityProbability}] ${h.message}`,
          );
          console.log(`    📍 ${h.component} (Line ${h.line || "N/A"})`);
        });
      }
    }
  } catch (error) {
    console.error("❌ Failed to fetch SonarCloud reports:", error.message);
  }
  console.log("\n" + "".padEnd(80, "=") + "\n");
}

fetchIssues();
