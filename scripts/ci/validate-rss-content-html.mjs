/**
 * RSS HTML Content Validator
 *
 * Extracts <content:encoded> from rss.xml and validates it with html-validate.
 * This is crucial to detect unclosed tags (like <pre> or <code>) that might breaks layout in RSS readers.
 */

import fs from "fs";
import { parseStringPromise } from "xml2js";
import { HtmlValidate } from "html-validate";

const RSS_FILE = "dist/rss.xml";

async function validate() {
  if (!fs.existsSync(RSS_FILE)) {
    console.error(`Error: File ${RSS_FILE} not found.`);
    process.exit(1);
  }

  const xml = fs.readFileSync(RSS_FILE, "utf-8");
  const result = await parseStringPromise(xml);
  const items = result.rss.channel[0].item;

  const htmlvalidate = new HtmlValidate({
    extends: ["html-validate:recommended"],
    rules: {
      "no-inline-style": "off", // RSS relies on inline styles
      "doctype-missing": "off", // Fragments
      "element-required-ancestor": "off", // Fragments
      "attribute-allowed-values": "off",
      "no-trailing-whitespace": "off",
      "void-style": "off",
      "no-raw-characters": "off", // Code blocks might have raw chars
      "unrecognized-char-ref": "off",
    },
  });

  let hasErrors = false;

  for (const item of items) {
    const title = item.title[0];
    const content = item["content:encoded"][0];

    // Wrap in a div to ensure a root element exists if multiple top-levels
    const htmlToValidate = `<div>${content}</div>`;

    const report = await htmlvalidate.validateString(htmlToValidate);

    if (!report.valid) {
      console.error(`\n❌ Validation Failed for post: "${title}"`);
      hasErrors = true;
      report.results.forEach((result) => {
        result.messages.forEach((msg) => {
          console.error(
            `   [${msg.ruleId}] ${msg.message} (Line: ${msg.line}, Col: ${msg.column})`,
          );
        });
      });

      // Save failed content for inspection
      const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      fs.writeFileSync(`debug-rss-fail-${safeTitle}.html`, htmlToValidate);
      console.log(`   Saved failed HTML to: debug-rss-fail-${safeTitle}.html`);
    } else {
      console.log(`✅ Valid HTML content: "${title}"`);
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

validate();
