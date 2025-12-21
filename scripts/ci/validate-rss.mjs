#!/usr/bin/env node

/**
 * RSS Feed Validator
 * Validates RSS feed against RSS 2.0 specification
 */

import fs from "fs";
import { parseStringPromise } from "xml2js";

const RSS_FILE = process.argv[2] || "dist/rss.xml";

async function validateRSS() {
  console.log("🔍 Validating RSS feed...\n");

  // Check file exists
  if (!fs.existsSync(RSS_FILE)) {
    console.error(`❌ RSS feed not found: ${RSS_FILE}`);
    process.exit(1);
  }

  // Read and parse XML
  let feedXml;
  try {
    const content = fs.readFileSync(RSS_FILE, "utf-8");
    feedXml = await parseStringPromise(content);
  } catch (error) {
    console.error("❌ Failed to parse RSS feed as valid XML");
    console.error(`   Error: ${error.message}`);
    process.exit(1);
  }

  // Validate RSS structure
  const errors = [];
  const warnings = [];

  if (!feedXml.rss) {
    errors.push("Missing <rss> root element");
  } else {
    const rss = feedXml.rss;

    // Check RSS version
    if (!rss.$ || !rss.$.version) {
      errors.push("Missing RSS version attribute");
    } else if (rss.$.version !== "2.0") {
      warnings.push(`RSS version is ${rss.$.version}, expected 2.0`);
    }

    // Check channel
    if (!rss.channel || !rss.channel[0]) {
      errors.push("Missing <channel> element");
    } else {
      const channel = rss.channel[0];

      // Required channel elements
      const required = ["title", "link", "description"];
      required.forEach((field) => {
        if (!channel[field] || !channel[field][0]) {
          errors.push(`Missing required <${field}> in channel`);
        }
      });

      // Recommended channel elements
      const recommended = ["language", "lastBuildDate"];
      recommended.forEach((field) => {
        if (!channel[field] || !channel[field][0]) {
          warnings.push(`Missing recommended <${field}> in channel`);
        }
      });

      // Check atom:link for self-reference
      if (!channel["atom:link"]) {
        warnings.push('Missing <atom:link rel="self"> for feed URL');
      }

      // Validate items
      if (channel.item && Array.isArray(channel.item)) {
        console.log(`   Found ${channel.item.length} items in feed`);

        channel.item.forEach((item, index) => {
          // Each item must have at least title or description
          if (!item.title && !item.description) {
            errors.push(
              `Item ${index + 1}: Must have at least <title> or <description>`,
            );
          }

          // Check for link
          if (!item.link) {
            warnings.push(`Item ${index + 1}: Missing <link> element`);
          }

          // Check for pubDate
          if (!item.pubDate) {
            warnings.push(`Item ${index + 1}: Missing <pubDate> element`);
          }

          // Check for guid
          if (!item.guid) {
            warnings.push(`Item ${index + 1}: Missing <guid> element`);
          }
        });
      } else {
        warnings.push("No items found in feed");
      }
    }
  }

  // Report results
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  if (errors.length === 0 && warnings.length === 0) {
    console.log("✅ RSS feed is valid!\n");
    console.log(`   File: ${RSS_FILE}`);
    console.log(
      `   Size: ${(fs.statSync(RSS_FILE).size / 1024).toFixed(2)} KB`,
    );
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`\n❌ ${errors.length} ERROR(S) found:\n`);
    errors.forEach((error, i) => {
      console.log(`   ${i + 1}. ${error}`);
    });
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} WARNING(S) found:\n`);
    warnings.forEach((warning, i) => {
      console.log(`   ${i + 1}. ${warning}`);
    });
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Exit with error if there are errors (not warnings)
  process.exit(errors.length > 0 ? 1 : 0);
}

validateRSS().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
