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
      // Replace production domain with localhost magic string for LHCI
      url = url.replace("https://jmrp.io", "http://localhost");
      urls.push(url);
    }

    // Optimization: Only analyze the first tag page encountered
    let tagFound = false;
    urls = urls.filter((url) => {
      if (url.includes("/blog/tags/")) {
        if (tagFound) return false;
        tagFound = true;
      }
      return true;
    });

    console.log(
      `📄 Found ${urls.length} optimized pages in sitemap for Lighthouse analysis.`,
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
      staticDistDir: "./dist",
      url: getUrls(),
      numberOfRuns: 2,
      outputDir: ".lighthouseci",
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
