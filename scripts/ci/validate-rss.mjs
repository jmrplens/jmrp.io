/**
 * RSS Feed Validator
 *
 * Validates the generated RSS feed (rss.xml) against the RSS 2.0 specification.
 * It uses 'xml2js' for structural integrity and 'rss-parser' to simulate
 * consumption by real-world RSS readers.
 */

import fs from "node:fs";
import path from "node:path";

import Parser from "rss-parser";
import { parseStringPromise } from "xml2js";

const OUTPUT_FILE = "rss-validation.json";

/**
 * Validates the publication date of an RSS item.
 *
 * @param item - The RSS item object.
 * @param idx - Index of the item.
 * @param results - Accumulated results object.
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
 * Validates the URL of an RSS item.
 *
 * @param item - The RSS item object.
 * @param idx - Index of the item.
 * @param results - Accumulated results object.
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
 * Validates the content of an RSS item.
 *
 * @param item - The RSS item object.
 * @param idx - Index of the item.
 * @param results - Accumulated results object.
 */
function validateItemContent(item, idx, results) {
  const content = item.contentEncoded || item.content || item.description || "";
  const contentLower = content.toLowerCase();

  if (
    !contentLower.includes("continue reading") &&
    !contentLower.includes("continuar leyendo") &&
    !content.includes(item.link)
  ) {
    results.warnings.push(
      `Item ${idx}: Content missing 'Continue reading'/'Continuar leyendo' link or backlink`,
    );
  }
}

/**
 * Validates the enclosure of an RSS item.
 *
 * @param item - The RSS item object.
 * @param idx - Index of the item.
 * @param results - Accumulated results object.
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
 * Validates a single RSS item by calling all individual checks.
 *
 * @param item - The RSS item object.
 * @param idx - Index of the item.
 * @param results - Accumulated results object.
 */
function validateItem(item, idx, results) {
  validateItemDate(item, idx, results);
  validateItemUrl(item, idx, results);
  validateItemContent(item, idx, results);
  validateItemEnclosure(item, idx, results);
}

/**
 * Validates the XML structure of the RSS feed.
 *
 * @param content - Raw XML content string.
 * @param results - Accumulated results object.
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
 * Validates the parsed feed content.
 *
 * @param content - Raw XML content string.
 * @param results - Accumulated results object.
 */
async function validateFeedContent(content, results) {
  const parser = new Parser({
    customFields: {
      item: [
        ["media:content", "mediaContent"],
        ["media:thumbnail", "mediaThumbnail"],
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

      for (const [i, item] of feed.items.entries()) {
        validateItem(item, i + 1, results);
      }
    }
  } catch (error) {
    results.errors.push(`RSS Parser Error: ${error.message}`);
  }
}

/**
 * Parses CLI arguments into a configuration object.
 *
 * @param argv - process.argv slice.
 * @returns Parsed configuration object.
 */
function parseCliArgs(argv) {
  const arg1 = argv[0];
  const arg2 = argv[1];

  let distDir;
  let rssFile;

  // If only one argument provided, detect if it's a file or directory
  if (arg1 && !arg2) {
    try {
      const stats = fs.existsSync(arg1) ? fs.statSync(arg1) : null;
      if (stats?.isFile() || arg1.endsWith(".xml")) {
        // Single argument is a file
        rssFile = path.resolve(arg1);
        distDir = path.dirname(rssFile);
      } else {
        // Single argument is a directory
        distDir = path.resolve(arg1);
        rssFile = path.join(distDir, "rss.xml");
      }
    } catch {
      // Fallback: treat as directory
      distDir = path.resolve(arg1);
      rssFile = path.join(distDir, "rss.xml");
    }
  } else if (arg1 && arg2) {
    // Two arguments: distDir and rssFile
    rssFile = path.resolve(arg2);
    distDir = path.resolve(arg1);
  } else {
    // No arguments: use defaults
    distDir = path.resolve(process.env.DIST_DIR || "dist");
    rssFile = path.join(distDir, "rss.xml");
  }

  return { distDir, rssFile };
}

/**
 * Validates a single RSS feed file.
 *
 * @param rssFile - Absolute path to the RSS feed file.
 * @returns {Promise<object>} Validation results for this feed.
 */
async function validateSingleFeed(rssFile) {
  const results = {
    valid: false,
    file: rssFile,
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

  if (!fs.existsSync(rssFile)) {
    results.errors.push(`RSS feed not found: ${rssFile}`);
    return results;
  }

  results.size = (fs.statSync(rssFile).size / 1024).toFixed(2);
  const content = fs.readFileSync(rssFile, "utf-8");

  await validateStructure(content, results);
  await validateFeedContent(content, results);

  results.valid = results.errors.length === 0;
  return results;
}

/**
 * Discovers all RSS feed files in the dist directory.
 *
 * @param distDir - The build output directory.
 * @returns {string[]} Array of absolute paths to RSS feed files.
 */
function discoverRssFeeds(distDir) {
  const feeds = [];
  const mainFeed = path.join(distDir, "rss.xml");
  if (fs.existsSync(mainFeed)) {
    feeds.push(mainFeed);
  }

  // Check locale subdirectories for RSS feeds (e.g., es/rss.xml)
  try {
    const entries = fs.readdirSync(distDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const localeFeed = path.join(distDir, entry.name, "rss.xml");
        if (fs.existsSync(localeFeed)) {
          feeds.push(localeFeed);
        }
      }
    }
  } catch {
    // Ignore errors reading directory
  }

  return feeds;
}

/**
 * Logs the validation results for a single feed.
 *
 * @param results - Validation results for the feed.
 * @param label - Display label for the feed file.
 */
function logFeedResults(results, label) {
  console.log(`📄 Validating ${label}...`);

  if (results.valid) {
    console.log(`   ✅ Valid — ${results.metadata.items} items`);
  } else {
    console.log(`   ❌ Failed with ${results.errors.length} error(s):`);
    for (const error of results.errors) console.log(`      - ${error}`);
  }

  for (const w of results.warnings) console.log(`   ⚠️  ${w}`);
  console.log();
}

/**
 * Validates the RSS feed structural integrity and content.
 *
 * @returns {Promise<void>} Resolves when validation is complete.
 */
async function validateRSS() {
  console.log("🔍 Validating RSS feed(s)...\n");

  const { distDir, rssFile } = parseCliArgs(process.argv.slice(2));

  // If a specific file was passed (not just a directory), validate only that file
  const isSpecificFile =
    process.argv.length > 3 || process.argv[2]?.endsWith(".xml");
  const feedFiles = isSpecificFile ? [rssFile] : discoverRssFeeds(distDir);

  if (feedFiles.length === 0) {
    console.error("❌ No RSS feeds found in", distDir);
    process.exit(1);
  }

  console.log(`   Found ${feedFiles.length} RSS feed(s) to validate\n`);

  const allResults = [];

  for (const feedFile of feedFiles) {
    const results = await validateSingleFeed(feedFile);
    allResults.push(results);
    logFeedResults(results, path.relative(distDir, feedFile));
  }

  // Write combined results (array for multiple feeds, single object for one)
  const output = allResults.length === 1 ? allResults[0] : allResults;
  writeResults(output, OUTPUT_FILE);

  const failedCount = allResults.filter((r) => !r.valid).length;

  if (failedCount > 0) {
    console.log(
      `❌ RSS validation failed — ${failedCount}/${feedFiles.length} feed(s) invalid.`,
    );
    process.exit(1);
  }

  console.log(`✅ All ${feedFiles.length} RSS feed(s) valid!`);
  process.exit(0);
}

/**
 * Writes the validation report to a JSON file.
 *
 * @param data - The results data to serialize and save.
 * @param filePath - Destination path for the report.
 */
function writeResults(data, filePath) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

try {
  await validateRSS();
} catch (error) {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
}
