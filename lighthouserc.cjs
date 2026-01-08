const fs = require("node:fs");
const path = require("node:path");

const getUrls = () => {
  try {
    const sitemapPath = path.join(__dirname, "dist", "sitemap-0.xml");
    if (!fs.existsSync(sitemapPath)) {
      console.warn("⚠️ Sitemap not found at " + sitemapPath);
      return [
        "http://localhost/",
        "http://localhost/services/",
        "http://localhost/cv/",
        "http://localhost/publications/",
        "http://localhost/github/",
        "http://localhost/blog/",
      ];
    }

    const content = fs.readFileSync(sitemapPath, "utf8");
    let urls = [];
    const regex = /<loc>(.*?)<\/loc>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      let url = match[1];
      // Keep original domain as requested
      urls.push(url);
    }

    // Filter: Keep only core pages, remove posts (/blog/001...) and tags (/blog/tags/...)
    urls = urls.filter((url) => {
      const path = new URL(url).pathname;
      // Exclude posts (any path starting with /blog/ followed by content)
      // and tags. We keep exactly '/blog/' (index).
      if (path.startsWith("/blog/") && path !== "/blog/") {
        return false;
      }
      return true;
    });

    console.log(
      `📄 Found ${urls.length} core pages in sitemap for quick Lighthouse analysis.`,
    );
    return urls;
  } catch (e) {
    console.error("❌ Error parsing sitemap for URLs:", e);
    return ["http://localhost/"];
  }
};

module.exports = {
  ci: {
    collect: {
      url: getUrls(),
      numberOfRuns: 1,
      outputDir: "lighthouse-results",
      settings: {
        chromeFlags: "--no-sandbox --headless",
        formFactor: process.env.FORM_FACTOR || "mobile",
        throttlingMethod: "simulate",
        throttling: {
          // Compensate for slow GitHub Action runners.
          // Default mobile is 4x, we use 2x. Default desktop is 1x.
          cpuSlowdownMultiplier: process.env.FORM_FACTOR === "desktop" ? 1 : 2,
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
