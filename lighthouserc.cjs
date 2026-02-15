const fs = require("node:fs");
const path = require("node:path");

const getUrls = () => {
  try {
    const sitemapPath = path.join(__dirname, "dist", "sitemap-0.xml");
    if (!fs.existsSync(sitemapPath)) {
      console.warn("⚠️ Sitemap not found at " + sitemapPath);
      return [
        "http://localhost/",
        "http://localhost/homelab/",
        "http://localhost/tools/",
        "http://localhost/cv/",
        "http://localhost/publications/",
        "http://localhost/github/",
        "http://localhost/blog/",
      ];
    }

    const content = fs.readFileSync(sitemapPath, "utf-8");
    let urls = [];
    const regex = /<loc>(.*?)<\/loc>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      let url = match[1];
      // Replace production domain with localhost magic string for LHCI
      url = url.replace("https://jmrp.io", "http://localhost");
      urls.push(url);
    }

    // Optimization: Only analyze the first tag page encountered
    let tagFound = false;
    // Optimization: Only analyze the first tool category page encountered
    let categoryFound = false;
    urls = urls.filter((url) => {
      if (url.includes("/blog/tags/")) {
        if (tagFound) return false;
        tagFound = true;
      }
      if (url.includes("/tools/categories/")) {
        if (categoryFound) return false;
        categoryFound = true;
      }
      return true;
    });

    console.log(
      `📄 Found ${urls.length} optimized pages in sitemap for Lighthouse analysis.`,
    );
    return urls;
  } catch (error) {
    console.error("❌ Error parsing sitemap for URLs:", error);
    return ["http://localhost/"];
  }
};

module.exports = {
  ci: {
    collect: {
      staticDistDir: "./dist",
      url: getUrls(),
      numberOfRuns: 3,
      outputDir: "lighthouse-results",
      settings: {
        chromeFlags:
          process.env.CI || (process.getuid && process.getuid() === 0)
            ? [
                "--headless",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
              ]
            : ["--headless"],
        formFactor: process.env.FORM_FACTOR || "mobile",
        throttlingMethod: "simulate",
        throttling:
          process.env.FORM_FACTOR === "desktop"
            ? {
                rttMs: 40,
                throughputKbps: 10_240,
                cpuSlowdownMultiplier: 1,
                requestLatencyMs: 0,
                downloadThroughputKbps: 10_240,
                uploadThroughputKbps: 10_240,
              }
            : {
                rttMs: 150,
                throughputKbps: 1638.4,
                cpuSlowdownMultiplier: 2,
                requestLatencyMs: 0,
                downloadThroughputKbps: 1638.4,
                uploadThroughputKbps: 600,
              },
        screenEmulation:
          process.env.FORM_FACTOR === "desktop"
            ? {
                mobile: false,
                width: 1350,
                height: 940,
                deviceScaleFactor: 1,
                disabled: false,
              }
            : undefined, // undefined uses default mobile emulation
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "lighthouse-results",
    },
  },
};
