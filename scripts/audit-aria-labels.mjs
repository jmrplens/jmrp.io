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

/**
 * CSS.escape polyfill for Node.js
 */
const cssEscape = (str) => {
  if (!str) return "";
  // We use characters directly to avoid Sonar issues while maintaining functionality.
  // Standard CSS escape requirements for special characters and control range.
  const ctrl = "\u0000-\u001F\u007F";
  // Only escape strictly necessary characters for a regex class
  const special = "!\"#$%&'()*+,./:;<=>?@[\]^`{|}~";
  const regex = new RegExp(`(?:[${ctrl}]|^-?\d)|[${ctrl}${special}]`, "g");

  return str.replaceAll(regex, (match) => {
    const isCtrl = new RegExp(`^[${ctrl}]$`).test(match);
    const isLeadingDigit = /^-?\d/.test(match);

    if (isCtrl || isLeadingDigit) {
      return `\${match.codePointAt(0).toString(16)} `;
    }
    return `\${match}`;
  });
};

/**
 * Checks if element needs an accessibility name.
 */
function getInterest(tagName, attrs) {
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
    tagName === "svg" &&
    (attrs.ariaLabel || attrs.title || attrs.role === "img");
  const hasExplicitAria =
    (attrs.ariaLabel || attrs.ariaLabelledBy || attrs.role) &&
    !isInteractive &&
    !isImg &&
    !isMeaningfulSvg;

  return { isInteractive, isImg, isMeaningfulSvg, hasExplicitAria };
}

/**
 * Resolves accessible name.
 */
function getAccName($, $el, attrs) {
  if (attrs.ariaLabelledBy) {
    const ids = attrs.ariaLabelledBy.split(/\s+/).filter(Boolean);
    const texts = ids
      .map((id) => {
        const el = $(`[id="${cssEscape(id)}"]`);
        return el.length > 0 ? el.text().trim() : "";
      })
      .filter(Boolean);
    return texts.length > 0 ? texts.join(" ") : `(ID: ${attrs.ariaLabelledBy})`;
  }
  return attrs.ariaLabel || attrs.title || attrs.alt || $el.text().trim();
}

/**
 * Logs a single accessibility finding.
 */
function printFinding(f, idx, frequency) {
  const count = frequency.get(f.accName) || 0;
  const isRepeated = count > 1;
  const idStr = f.id ? `#${f.id}` : "";
  const classStr = f.class ? `.${f.class.split(" ").join(".")}` : "";

  console.log(
    `${C.dim}[${idx + 1}]${C.reset} ${C.bright}${f.tag}${C.dim}${idStr}${classStr}${C.reset}`,
  );
  if (f.ariaLabel)
    console.log(`    ${C.green}aria-label:${C.reset} "${f.ariaLabel}"`);
  if (isRepeated)
    console.log(
      `    ${C.red}✖ REPEATED:${C.reset} Name used by ${count} elements.`,
    );
  if (f.isRedundant)
    console.log(`    ${C.yellow}💡 REDUNDANT: Matches visible text.${C.reset}`);
  if (!f.hasName) console.log(`    ${C.red}⚠️  ERROR: Missing name.${C.reset}`);
  console.log("");
}

/**
 * Audits a file.
 */
function audit(path, options) {
  const content = fs.readFileSync(path, "utf-8");
  const $ = cheerio.load(content);
  const findings = [];
  const freq = new Map();
  const stats = { total: 0, ok: 0, missing: 0, redundant: 0, repeated: 0 };

  $("*").each((_, el) => {
    const $el = $(el);
    const attrs = {
      ariaLabel: $el.attr("aria-label"),
      ariaLabelledBy: $el.attr("aria-labelledby"),
      role: $el.attr("role"),
      alt: $el.attr("alt"),
      title: $el.attr("title"),
      ariaHidden: $el.attr("aria-hidden"),
      id: $el.attr("id"),
      class: $el.attr("class"),
    };

    const interest = getInterest(el.tagName, attrs);
    if (attrs.ariaHidden === "true" && !interest.isInteractive) return;

    if (
      interest.isInteractive ||
      interest.isImg ||
      interest.isMeaningfulSvg ||
      interest.hasExplicitAria
    ) {
      const accName = getAccName($, $el, attrs);
      const hasName = !!accName;
      const isRedundant = !!(
        attrs.ariaLabel &&
        attrs.ariaLabel.trim().toLowerCase() === $el.text().trim().toLowerCase()
      );

      if (interest.isInteractive && accName)
        freq.set(accName, (freq.get(accName) || 0) + 1);

      findings.push({
        tag: el.tagName,
        ...attrs,
        accName,
        hasName,
        isRedundant,
        isInteractive: interest.isInteractive,
      });
      stats.total++;
      if (hasName) stats.ok++;
      if (interest.isInteractive && !hasName) stats.missing++;
      if (isRedundant) stats.redundant++;
    }
  });

  stats.repeated = [...freq.values()].filter((c) => c > 1).length;
  findings.forEach((f, i) => {
    const err = !f.hasName && f.isInteractive;
    if (
      (options.rep && (freq.get(f.accName) || 0) <= 1) ||
      (options.err && !err)
    )
      return;
    printFinding(f, i, freq);
  });

  console.log(`\n${C.bright}Audit Summary for ${path}${C.reset}`);
  console.log(
    `- OK: ${stats.ok} | Missing: ${stats.missing} | Repeated: ${stats.repeated}\n`,
  );
  return stats.missing;
}

function main() {
  const args = process.argv.slice(2);
  const htmlFiles = args.filter((a) => !a.startsWith("-"));
  if (htmlFiles.length === 0) process.exit(0);

  let totalErrors = 0;
  const opts = {
    rep: args.includes("--repeated"),
    err: args.includes("--errors"),
  };

  for (const file of htmlFiles) {
    if (fs.existsSync(file)) totalErrors += audit(file, opts);
  }
  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
