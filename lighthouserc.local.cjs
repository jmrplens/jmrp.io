const fs = require("node:fs");
const path = require("node:path");

const getUrls = () => {
  try {
    const sitemapPath = path.join(__dirname, "dist", "sitemap-0.xml");
    if (!fs.existsSync(sitemapPath)) {
      console.warn("⚠️ Sitemap not found at " + sitemapPath);
      return ["https://jmrp.io/"];
    }

    const content = fs.readFileSync(sitemapPath, "utf8");
    let urls = [];
    const regex = /<loc>(.*?)<\/loc>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      let url = match[1];
      urls.push(url);
    }

    // Filter: Keep only core pages for fast local audit. Exclude posts and tags.
    urls = urls.filter((url) => {
      const pathname = new URL(url).pathname;
      if (pathname.startsWith("/blog/") && pathname !== "/blog/") {
        return false;
      }
      return true;
    });

    console.log(
      `📄 Found ${urls.length} core pages in sitemap for local Lighthouse analysis.`,
    );
    return urls;
  } catch (e) {
    console.error("❌ Error parsing sitemap for URLs:", e);
    return ["https://jmrp.io/"];
  }
};

module.exports = {
  ci: {
    collect: {
      staticDistDir: null,
      url: getUrls(),
      numberOfRuns: 1,
      settings: {
        chromeFlags: "--no-sandbox --headless --ignore-certificate-errors",
        formFactor: process.env.FORM_FACTOR || "mobile",
        throttlingMethod: "simulate",
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "lighthouse-results",
    },
  },
};
