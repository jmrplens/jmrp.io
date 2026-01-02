/**
 * RSS Feed Validator
 *
 * Validates the generated RSS feed (rss.xml) against the RSS 2.0 specification.
 * It uses 'xml2js' for structural integrity and 'rss-parser' to simulate
 * consumption by real-world RSS readers.
 *
 * Checks:
 * - Presence of required RSS elements (<rss>, <channel>, etc.).
 * - Version compatibility.
 * - Date and URL format validity for all posts.
 * - Basic metadata consistency.
 */

import fs from "node:fs";
import { parseStringPromise } from "xml2js";
import Parser from "rss-parser";

const RSS_FILE = process.argv[2] || "dist/rss.xml";
const OUTPUT_FILE = "rss-validation.json";

/**
 * Validates the publication date of an RSS item
 */
function validateItemDate(item, idx, results) {
  if (!item.pubDate) {
    results.warnings.push(`Item ${idx}: Missing pubDate`);
    return;
  }

  const date = new Date(item.pubDate);
  if (Number.isNaN(date.getTime())) {
    results.errors.push(
      `Item ${idx}: Invalid pubDate format (${item.pubDate})`,
    );
  }
}

/**
 * Validates the URL of an RSS item
 */
function validateItemUrl(item, idx, results) {
  if (!item.link) return;

  try {
    new URL(item.link);
  } catch {
    results.errors.push(`Item ${idx}: Invalid URL (${item.link})`);
  }
}

/**
 * Validates the content of an RSS item for required elements
 */
function validateItemContent(item, idx, results) {
  const content =
    item.contentEncoded || item.content || item.description || "";
  const contentLower = content.toLowerCase();

  if (
    !contentLower.includes("continue reading") &&
    !content.includes(item.link)
  ) {
    results.warnings.push(
      `Item ${idx}: Content missing 'Continue reading' link or backlink`,
    );
  }
}

/**
 * Validates the enclosure (cover image) of an RSS item
 */
function validateItemEnclosure(item, idx, results) {
  if (!item.enclosure) {
    results.warnings.push(`Item ${idx}: Missing <enclosure> for cover image`);
    return;
  }

  if (!item.enclosure.url) {
    results.errors.push(`Item ${idx}: Enclosure missing URL`);
  }

  if (!item.enclosure.type?.startsWith("image/")) {
    results.errors.push(
      `Item ${idx}: Enclosure type '${item.enclosure.type}' is not an image`,
    );
  }
}

/**
 * Validates a single RSS feed item
 */
function validateItem(item, idx, results) {
  validateItemDate(item, idx, results);
  validateItemUrl(item, idx, results);
  validateItemContent(item, idx, results);
  validateItemEnclosure(item, idx, results);
}

/**
 * Validates the RSS structure using xml2js
 */
async function validateStructure(content, results) {
  try {
    const feedXml = await parseStringPromise(content);

    if (!feedXml.rss) {
      results.errors.push("Missing <rss> root element");
      return;
    }

    const rss = feedXml.rss;
    if (rss.$?.version) {
      if (rss.$.version !== "2.0") {
        results.warnings.push(`RSS version is ${rss.$.version}, expected 2.0`);
      }
    } else {
      results.errors.push("Missing RSS version attribute");
    }

    if (rss.channel?.[0]) {
      const channel = rss.channel[0];
      if (!channel["atom:link"]) {
        results.warnings.push('Missing <atom:link rel="self">');
      }
    } else {
      results.errors.push("Missing <channel> element");
    }
  } catch (error) {
    results.errors.push(`XML Parsing Error: ${error.message}`);
  }
}

/**
 * Validates feed content using rss-parser
 */
async function validateFeedContent(content, results) {
  const parser = new Parser({
    customFields: {
      item: [
        ["media:content", "mediaContent"],
        ["media:thumbnail", "mediaThumbnail"],
        ["enclosure", "enclosure"],
        ["content:encoded", "contentEncoded"],
      ],
    },
  });

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

      feed.items.forEach((item, i) => {
        validateItem(item, i + 1, results);
      });
    }
  } catch (error) {
    results.errors.push(`RSS Parser Error: ${error.message}`);
  }
}

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

  if (!fs.existsSync(RSS_FILE)) {
    results.errors.push(`RSS feed not found: ${RSS_FILE}`);
    writeResults(results);
    process.exit(1);
  }

  results.size = (fs.statSync(RSS_FILE).size / 1024).toFixed(2);
  const content = fs.readFileSync(RSS_FILE, "utf-8");

  await validateStructure(content, results);
  await validateFeedContent(content, results);

  results.valid = results.errors.length === 0;

  if (results.valid) {
    console.log("✅ RSS feed is valid!");
    console.log(`   Items: ${results.metadata.items}`);
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

try {
  await validateRSS();
} catch (error) {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
}
