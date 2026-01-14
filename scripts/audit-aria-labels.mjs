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
if (args.length === 0) {
  console.error(
    `${C.red}Error: You must specify the HTML file to analyze.${C.reset}`,
  );
  console.log(`Usage: node scripts/audit-aria-labels.mjs dist/index.html`);
  process.exit(1);
}

const filePath = args[0];

if (!fs.existsSync(filePath)) {
  console.error(`${C.red}Error: File ${filePath} does not exist.${C.reset}`);
  process.exit(1);
}

const html = fs.readFileSync(filePath, "utf-8");
const $ = cheerio.load(html);

console.log(
  `${C.bright}🔍 Analyzing ARIA and Accessibility in: ${C.cyan}${filePath}${C.reset}\n`,
);

const findings = [];

// Stats counters
const stats = {
  total: 0,
  ok: 0,
  missing: 0,
  redundant: 0,
};

// Select all elements and filter those with relevant attributes
$("*").each((_, el) => {
  const $el = $(el);
  const tagName = el.tagName;

  // Attributes of interest
  const ariaLabel = $el.attr("aria-label");
  const ariaLabelledBy = $el.attr("aria-labelledby");
  const role = $el.attr("role");
  const alt = $el.attr("alt");
  const title = $el.attr("title");
  const ariaHidden = $el.attr("aria-hidden");

  // Refined filtering logic:
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

  // Final filter: If aria-hidden="true", generally ignore unless interactive
  if (ariaHidden === "true" && !isInteractive) return;

  if (isInteractive || isImg || isMeaningfulSvg || hasExplicitAria) {
    const rawVisibleText = $el.text().trim();
    const visibleTextForDisplay = rawVisibleText
      .substring(0, 50)
      .replaceAll("\n", " ");

    const hasName = !!(
      ariaLabel ||
      ariaLabelledBy ||
      title ||
      alt ||
      rawVisibleText
    );

    // Better redundancy check: compare against full untruncated text
    const isRedundant = !!(
      ariaLabel &&
      rawVisibleText &&
      ariaLabel.trim().toLowerCase() === rawVisibleText.toLowerCase()
    );

    const context = {
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
    };
    findings.push(context);

    // Update stats
    stats.total++;
    if (hasName) stats.ok++;
    if (isInteractive && !hasName) stats.missing++;
    if (isRedundant) stats.redundant++;
  }
});

// Print report
findings.forEach((f, idx) => {
  const idStr = f.id ? `#${f.id}` : "";
  const classStr = f.class ? `.${f.class.split(" ").join(".")}` : "";
  const parentStr = f.parent
    ? `${C.dim}(parent: <${f.parent}>)${C.reset} `
    : "";

  const identifier = `${parentStr}${C.bright}${f.tag}${C.dim}${idStr}${classStr}${C.reset}`;

  console.log(`${C.dim}[${idx + 1}]${C.reset} ${identifier}`);

  // Show found values
  if (f.ariaLabel)
    console.log(`    ${C.green}aria-label:${C.reset} "${f.ariaLabel}"`);
  if (f.ariaLabelledBy)
    console.log(`    ${C.cyan}aria-labelledby:${C.reset} #${f.ariaLabelledBy}`);
  if (f.role) console.log(`    ${C.yellow}role:${C.reset} ${f.role}`);
  if (f.alt !== undefined)
    console.log(`    ${C.green}alt:${C.reset} "${f.alt}"`);
  if (f.title) console.log(`    ${C.yellow}title:${C.reset} "${f.title}"`);

  // Always show visible text if it exists to help audit redundancy
  if (f.text) {
    console.log(
      `    ${C.dim}Visible text:${C.reset} "${f.text}${f.text.length >= 50 ? "..." : ""}"`,
    );
  }

  // Redundancy Warning
  if (f.isRedundant) {
    console.log(
      `    ${C.yellow}💡 REDUNDANT: aria-label matches visible text exactly.${C.reset}`,
    );
  }

  // Error Check
  if (!f.hasName) {
    console.log(
      `    ${C.red}⚠️  ERROR: Element without accessible name (empty and no label).${C.reset}`,
    );
  }

  console.log(""); // Separator
});

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
  `${C.yellow}💡 Redundant aria-labels:${C.reset}      ${stats.redundant}`,
);
console.log(
  `${C.bright}-----------------------------------------------------${C.reset}`,
);
console.log(`${C.cyan}Total elements analyzed:${C.reset}       ${stats.total}`);
console.log(
  `${C.bright}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`,
);
