/* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-control-regex */
import fs from "node:fs";

import * as cheerio from "cheerio";

// Terminal colors
const C = {
  reset: "\u001B[0m",
  bright: "\u001B[1m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
};

const args = process.argv.slice(2);
const help = args.includes("--help") || args.includes("-h");
const showRepeatedOnly = args.includes("--repeated");
const showErrorsOnly = args.includes("--errors");
const htmlFiles = args.filter((a) => !a.startsWith("-"));

if (help || htmlFiles.length === 0) {
  console.log(`${C.bright}Aria Label Audit Tool${C.reset}`);
  console.log(
    `Usage: node scripts/audit-aria-labels.mjs <file.html> [options]`,
  );
  console.log(`\nOptions:`);
  console.log(
    `  --repeated    Show only elements with non-unique accessible names`,
  );
  console.log(
    `  --errors      Show only elements with missing accessible names`,
  );
  console.log(`  --help, -h    Show this help message`);
  process.exit(0);
}

// CSS.escape polyfill for Node.js (not available natively)
const cssEscape = (str) => {
  if (!str) return "";
  return str.replaceAll(
    /(?:[\u0000-\u001F\u007F]|^-?\d)|[\u0000-\u001F\u007F!"#$%&'()*+,./:;<=>?@[\]^`{|}~]/g,
    (match) => {
      // Check if it's a control character or leading digit (needs numeric escape)
      if (/^[\u0000-\u001F\u007F]$/.test(match) || /^-?\d/.test(match)) {
        return `\\${match.codePointAt(0).toString(16)} `;
      }
      // Special characters get backslash escaping
      return `\\${match}`;
    },
  );
};

// Process all HTML files, not just the first one
let globalMissingCount = 0;

for (const filePath of htmlFiles) {
  if (!fs.existsSync(filePath)) {
    console.error(`${C.red}Error: File ${filePath} does not exist.${C.reset}`);
    continue;
  }

  let html;
  let $;
  try {
    html = fs.readFileSync(filePath, "utf-8");
    $ = cheerio.load(html);
  } catch (error) {
    console.error(
      `${C.red}Error reading ${filePath}: ${error.message}${C.reset}`,
    );
    continue;
  }

  console.log(
    `${C.bright}🔍 Analyzing ARIA and Accessibility in: ${C.cyan}${filePath}${C.reset}`,
  );
  if (showRepeatedOnly)
    console.log(`${C.yellow}Filtering: Showing only REPEATED names${C.reset}`);
  if (showErrorsOnly)
    console.log(`${C.red}Filtering: Showing only ERRORS${C.reset}`);
  console.log("");

  const findings = [];
  const nameFrequency = new Map();

  const stats = {
    total: 0,
    ok: 0,
    missing: 0,
    redundant: 0,
    repeated: 0,
  };

  // First pass: collect all and count frequencies
  $("*").each((_, el) => {
    const $el = $(el);
    const tagName = el.tagName;
    const ariaLabel = $el.attr("aria-label");
    const ariaLabelledBy = $el.attr("aria-labelledby");
    const role = $el.attr("role");
    const alt = $el.attr("alt");
    const title = $el.attr("title");
    const ariaHidden = $el.attr("aria-hidden");

    const isInteractive = [
      "a",
      "button",
      "input",
      "select",
      "textarea",
      "summary",
      "details",
    ].includes(tagName);
    const isImg = tagName === "img";
    const isMeaningfulSvg =
      tagName === "svg" && (ariaLabel || title || role === "img");
    const hasExplicitAria =
      (ariaLabel || ariaLabelledBy || role) &&
      !isInteractive &&
      !isImg &&
      !isMeaningfulSvg;

    if (ariaHidden === "true" && !isInteractive) return;

    if (isInteractive || isImg || isMeaningfulSvg || hasExplicitAria) {
      const rawVisibleText = $el.text().trim();
      const visibleTextForDisplay = rawVisibleText
        .substring(0, 50)
        .replaceAll("\n", " ");

      let accessibleName = ariaLabel || title || alt || rawVisibleText;
      if (ariaLabelledBy) {
        // Handle multiple space-separated IDs in aria-labelledby
        const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
        const resolvedTexts = ids
          .map((id) => {
            // Use CSS.escape for robust ID selector escaping
            const escapedId = cssEscape(id);
            const el = $(`[id="${escapedId}"]`);
            return el.length > 0 ? el.text().trim() : "";
          })
          .filter(Boolean);
        accessibleName =
          resolvedTexts.length > 0
            ? resolvedTexts.join(" ")
            : `(ID: ${ariaLabelledBy})`;
      }

      const hasName = !!accessibleName;
      const isRedundant = !!(
        ariaLabel &&
        rawVisibleText &&
        ariaLabel.trim().toLowerCase() === rawVisibleText.toLowerCase()
      );

      if (isInteractive && accessibleName) {
        const count = nameFrequency.get(accessibleName) || 0;
        nameFrequency.set(accessibleName, count + 1);
      }

      findings.push({
        tag: tagName,
        id: $el.attr("id"),
        class: $el.attr("class"),
        text: visibleTextForDisplay,
        parent: $el.parent().get(0)?.tagName,
        ariaLabel,
        ariaLabelledBy,
        role,
        alt,
        title,
        hasName,
        isRedundant,
        accessibleName,
        isInteractive,
      });

      stats.total++;
      if (hasName) stats.ok++;
      if (isInteractive && !hasName) stats.missing++;
      if (isRedundant) stats.redundant++;
    }
  });

  // Calculate unique repeated names (names that appear more than once)
  // This counts distinct names, not individual elements
  const uniqueRepeatedNames = [...nameFrequency.entries()].filter(
    ([, count]) => count > 1,
  ).length;
  stats.repeated = uniqueRepeatedNames;

  // Second pass: Filter and print
  let displayedCount = 0;
  findings.forEach((f, idx) => {
    const nameCount = nameFrequency.get(f.accessibleName) || 0;
    const isRepeated = nameCount > 1;
    const isError = !f.hasName && f.isInteractive;

    // Apply filters
    if (showRepeatedOnly && !isRepeated) return;
    if (showErrorsOnly && !isError) return;

    displayedCount++;
    const idStr = f.id ? `#${f.id}` : "";
    const classStr = f.class ? `.${f.class.split(" ").join(".")}` : "";
    const parentStr = f.parent
      ? `${C.dim}(parent: <${f.parent}>)${C.reset} `
      : "";
    const identifier = `${parentStr}${C.bright}${f.tag}${C.dim}${idStr}${classStr}${C.reset}`;

    console.log(`${C.dim}[${idx + 1}]${C.reset} ${identifier}`);

    if (f.ariaLabel)
      console.log(`    ${C.green}aria-label:${C.reset} "${f.ariaLabel}"`);
    if (f.ariaLabelledBy)
      console.log(
        `    ${C.cyan}aria-labelledby:${C.reset} #${f.ariaLabelledBy}`,
      );
    if (f.role) console.log(`    ${C.yellow}role:${C.reset} ${f.role}`);
    if (f.alt !== undefined)
      console.log(`    ${C.green}alt:${C.reset} "${f.alt}"`);
    if (f.title) console.log(`    ${C.yellow}title:${C.reset} "${f.title}"`);

    if (f.text) {
      console.log(
        `    ${C.dim}Visible text:${C.reset} "${f.text}${f.text.length >= 50 ? "..." : ""}" `,
      );
    }

    if (isRepeated) {
      console.log(
        `    ${C.red}✖ REPEATED NAME:${C.reset} This accessible name is used by ${nameCount} elements.`,
      );
    }

    if (f.isRedundant) {
      console.log(
        `    ${C.yellow}💡 REDUNDANT: aria-label matches visible text exactly.${C.reset}`,
      );
    }

    if (!f.hasName) {
      console.log(
        `    ${C.red}⚠️  ERROR: Element without accessible name (empty and no label).${C.reset}`,
      );
    }

    console.log("");
  });

  if (displayedCount === 0) {
    console.log(
      `${C.green}No elements matched the current filters.${C.reset}\n`,
    );
  }

  // Final Summary
  console.log(
    `\n${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
  );
  console.log(`${C.bright}📊 ACCESSIBILITY AUDIT SUMMARY${C.reset}`);
  console.log(
    `${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`,
  );
  console.log(`${C.green}✅ OK (with accessible name):${C.reset}  ${stats.ok}`);
  console.log(
    `${C.red}❌ Missing accessible name:${C.reset}    ${stats.missing}`,
  );
  console.log(
    `${C.red}✖ Non-unique names (repeated):${C.reset}  ${stats.repeated}`,
  );
  console.log(
    `${C.yellow}💡 Redundant aria-labels:${C.reset}      ${stats.redundant}`,
  );
  console.log(
    `${C.bright}-----------------------------------------------------${C.reset}`,
  );
  console.log(
    `${C.cyan}Total elements analyzed:${C.reset}       ${stats.total}`,
  );
  console.log(
    `${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`,
  );

  globalMissingCount += stats.missing;
} // End of file loop

// CI-friendly exit code: fail if there are missing accessible names
if (globalMissingCount > 0) {
  process.exit(1);
}
process.exit(0);
