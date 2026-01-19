import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RESULTS_DIR = "lighthouse-results";
const TARGET_SCORE = 0.99;

// Get parameters
const isProd = process.argv.includes("--prod");
const BASE_URL = isProd ? "https://jmrp.io" : "http://localhost:4321";

const getUrls = () => {
  const baseUrls = [
    `${BASE_URL}/`,
    `${BASE_URL}/services/`,
    `${BASE_URL}/cv/`,
    `${BASE_URL}/publications/`,
    `${BASE_URL}/github/`,
    `${BASE_URL}/blog/`,
  ];

  const postsDir = "dist/blog";
  let postUrls = [];

  if (fs.existsSync(postsDir)) {
    postUrls = fs
      .readdirSync(postsDir, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory() && dirent.name !== "tags")
      .map((dirent) => `${BASE_URL}/blog/${dirent.name}/`);
  }

  return [...baseUrls, ...postUrls];
};

const runAudit = async () => {
  console.log(`\n🛠️ Starting MOBILE Lighthouse Audit on ${isProd ? "PRODUCTION" : "LOCAL"}...`);
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);

  const urls = getUrls();
  const combinations = [
    { name: "Mobile Light", factor: "mobile", theme: "light" },
    { name: "Mobile Dark", factor: "mobile", theme: "dark" },
  ];

  const reports = [];

  for (const combo of combinations) {
    console.log(`\n🔵 TESTING: ${combo.name}`);
    for (const url of urls) {
      const fileName = `${url.replace(/https?:\/\/.*?\//, "").replace(/\//g, "-") || "index"}-${combo.theme}-${combo.factor}`;
      const reportPath = path.join(RESULTS_DIR, `${fileName}.json`);

      try {
        // Force color scheme via chrome flags
        const chromeFlags = `--no-sandbox --headless --disable-gpu --force-color-profile=srgb --force-prefers-color-scheme=${combo.theme}`;
        
        // Mobile is the default, so we don't provide --preset (which defaults to mobile)
        execSync(
          `npx lighthouse ${url} --quiet --chrome-flags="${chromeFlags}" --output=json --output-path=${reportPath} --throttling-method=simulate`,
          { stdio: "inherit" }
        );

        const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
        reports.push({
          url,
          combo: combo.name,
          summary: {
            performance: report.categories.performance.score,
            accessibility: report.categories.accessibility.score,
            bestPractices: report.categories["best-practices"].score,
            seo: report.categories.seo.score,
          },
        });
        
        // Immediate feedback
        const s = report.categories;
        if (s.performance.score < TARGET_SCORE || s.accessibility.score < TARGET_SCORE) {
           console.log(`❌ ${url} (${combo.name}): P:${(s.performance.score*100).toFixed(0)}% A:${(s.accessibility.score*100).toFixed(0)}%`);
        } else {
           console.log(`✅ ${url} (${combo.name}): 100%`);
        }
      } catch (error) {
        console.error(`⚠️ Failed ${url} (${combo.name})`);
      }
    }
  }

  console.log("\n📊 --- FINAL MOBILE REPORT ---");
  let totalIssues = 0;
  reports.forEach(r => {
    const issues = Object.entries(r.summary).filter(([_, score]) => score < TARGET_SCORE);
    if (issues.length > 0) {
      totalIssues++;
      console.log(`❌ ${r.url} [${r.combo}]: ${issues.map(([k, v]) => `${k}: ${(v*100).toFixed(0)}%`).join(", ")}`);
    }
  });

  if (totalIssues === 0) console.log("✨ MOBILE COMBINATIONS PASSED 99%!");
};

runAudit();
