import fs from "node:fs";

import { chromium } from "playwright";

const runId = process.env.GITHUB_RUN_ID || "20877427035";
const repo = process.env.GITHUB_REPOSITORY || "jmrplens/jmrp.io";
const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;

(async () => {
  console.log(`Extracting graph data from: ${runUrl}`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    await page.goto(runUrl, { waitUntil: "networkidle" });
    await page.waitForSelector(".WorkflowGraph", { timeout: 10_000 });

    // Extract nodes and links
    const data = await page.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll("streaming-graph-job, .WorkflowGraph-job"),
      ].map((el) => {
        const label = el.textContent.split("\n")[0].trim();
        const id = el.getAttribute("id") || label.replaceAll(/\s+/g, "_");
        let statusIcon = "pending";
        if (el.querySelector(".octicon-check-circle-fill")) {
          statusIcon = "success";
        } else if (el.querySelector(".octicon-x-circle-fill")) {
          statusIcon = "failure";
        }
        return { id, label, status: statusIcon };
      });

      const links = [...document.querySelectorAll(".WorkflowConnector")]
        .map((p) => ({
          from: p.dataset.from,
          to: p.dataset.to,
        }))
        .filter((p) => p.from && p.to);

      return { nodes, links };
    });

    fs.writeFileSync("workflow-data.json", JSON.stringify(data, null, 2));
    console.log("✅ Workflow data saved to workflow-data.json");

    // Also take the screenshot just in case
    const element = await page.$(".WorkflowGraph");
    if (element) {
      await element.screenshot({ path: "workflow-graph.png" });
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await browser.close();
  }
})();
