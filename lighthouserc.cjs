const fs = require("node:fs");
const path = require("node:path");

/**
 * Filters URLs by the LOCALE_FILTER env var.
 * @param {string[]} urls - Full list of URLs.
 * @returns {string[]} Filtered list.
 */
const filterByLocale = (urls) => {
  const locale = process.env.LOCALE_FILTER;
  if (locale === "en") return urls.filter((u) => !u.includes("/es/"));
  if (locale === "es") return urls.filter((u) => u.includes("/es/"));
  return urls;
};

/**
 * Keeps only the first tag page and first category page per locale.
 * @param {string[]} urls - URL list.
 * @returns {string[]} Deduplicated list.
 */
const deduplicatePages = (urls) => {
  const seen = { enTag: false, esTag: false, enCat: false, esCat: false };
  return urls.filter((url) => {
    const isEs = url.includes("/es/");
    if (url.includes("/blog/tags/")) {
      const key = isEs ? "esTag" : "enTag";
      if (seen[key]) return false;
      seen[key] = true;
    }
    if (url.includes("/tools/categories/")) {
      const key = isEs ? "esCat" : "enCat";
      if (seen[key]) return false;
      seen[key] = true;
    }
    return true;
  });
};

const getUrls = () => {
  try {
    const sitemapPath = path.join(__dirname, "dist", "sitemap-0.xml");
    if (!fs.existsSync(sitemapPath)) {
      console.warn("⚠️ Sitemap not found at " + sitemapPath);
      return [
        "http://localhost:4321/",
        "http://localhost:4321/homelab/",
        "http://localhost:4321/tools/",
        "http://localhost:4321/cv/",
        "http://localhost:4321/publications/",
        "http://localhost:4321/github/",
        "http://localhost:4321/blog/",
      ];
    }

    const content = fs.readFileSync(sitemapPath, "utf-8");
    let urls = [];
    const regex = /<loc>(.*?)<\/loc>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      let url = match[1];
      // Replace production domain with localhost:4321 for LHCI preview server
      url = url.replace("https://jmrp.io", "http://localhost:4321");
      urls.push(url);
    }

    urls = filterByLocale(urls);
    urls = deduplicatePages(urls);

    const filterLabel = process.env.LOCALE_FILTER
      ? ` [locale=${process.env.LOCALE_FILTER}]`
      : "";
    console.log(
      `📄 Found ${urls.length} optimized pages${filterLabel} in sitemap for Lighthouse analysis.`,
    );
    return urls;
  } catch (error) {
    console.error("❌ Error parsing sitemap for URLs:", error);
    return ["http://localhost:4321/"];
  }
};

module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm astro preview --port 4321",
      startServerReadyPattern: "Local",
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
