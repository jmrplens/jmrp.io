#!/usr/bin/env node

/**
 * RSS Feed Validator
 * Validates RSS feed against RSS 2.0 specification
 * Uses both xml2js (structure) and rss-parser (consumption)
 */

import fs from "fs";
import { parseStringPromise } from "xml2js";
import Parser from "rss-parser";

const RSS_FILE = process.argv[2] || "dist/rss.xml";
const OUTPUT_FILE = "rss-validation.json";

async function validateRSS() {
  console.log("🔍 Validating RSS feed...\n");

  const results = {
    valid: false,
    file: RSS_FILE,
    size: 0,
    errors: [],
    warnings: [],
    metadata: {
      items: 0,
      title: "",
      lastBuildDate: "",
      latestItem: null,
    },
  };

  // Check file exists
  if (!fs.existsSync(RSS_FILE)) {
    results.errors.push(`RSS feed not found: ${RSS_FILE}`);
    writeResults(results);
    process.exit(1);
  }

  results.size = (fs.statSync(RSS_FILE).size / 1024).toFixed(2);

  // 1. Structural Validation (xml2js)
  const content = fs.readFileSync(RSS_FILE, "utf-8");
  try {
    const feedXml = await parseStringPromise(content);

    if (!feedXml.rss) {
      results.errors.push("Missing <rss> root element");
    } else {
      const rss = feedXml.rss;
      if (!rss.$ || !rss.$.version) {
        results.errors.push("Missing RSS version attribute");
      } else if (rss.$.version !== "2.0") {
        results.warnings.push(`RSS version is ${rss.$.version}, expected 2.0`);
      }

      if (!rss.channel || !rss.channel[0]) {
        results.errors.push("Missing <channel> element");
      } else {
        const channel = rss.channel[0];
        // Check atom:link
        if (!channel["atom:link"]) {
          results.warnings.push('Missing <atom:link rel="self">');
        }
      }
    }
  } catch (error) {
    results.errors.push(`XML Parsing Error: ${error.message}`);
  }

  // 2. Consumption & Data Validation (rss-parser)
  const parser = new Parser();
  try {
    const feed = await parser.parseString(content);
    results.metadata.title = feed.title || "Unknown Title";
    results.metadata.lastBuildDate = feed.lastBuildDate || "Unknown Date";
    results.metadata.items = feed.items.length;

    if (feed.items.length > 0) {
      const latest = feed.items[0];
      results.metadata.latestItem = {
        title: latest.title,
        date: latest.pubDate,
      };

      // Validate Dates and URLs
      feed.items.forEach((item, i) => {
        const idx = i + 1;
        // Date
        if (item.pubDate) {
          const date = new Date(item.pubDate);
          if (isNaN(date.getTime())) {
            results.errors.push(
              `Item ${idx}: Invalid pubDate format (${item.pubDate})`,
            );
          }
        } else {
          results.warnings.push(`Item ${idx}: Missing pubDate`);
        }

        // Link
        if (item.link) {
          try {
            new URL(item.link);
          } catch {
            results.errors.push(`Item ${idx}: Invalid URL (${item.link})`);
          }
        }
      });
    }
  } catch (error) {
    results.errors.push(`RSS Parser Error: ${error.message}`);
  }

  // Final Decision
  results.valid = results.errors.length === 0;

  // Report to Console
  if (results.valid) {
    console.log("✅ RSS feed is valid!");
    console.log(`   Items: ${results.metadata.items}`);
    console.log(
      `   Latest: ${results.metadata.latestItem?.title} (${results.metadata.latestItem?.date})`,
    );
  } else {
    console.log(
      `❌ RSS validation failed with ${results.errors.length} errors.`,
    );
    results.errors.forEach((e) => console.log(`   - ${e}`));
  }

  writeResults(results);
  process.exit(results.valid ? 0 : 1);
}

function writeResults(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

validateRSS().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
