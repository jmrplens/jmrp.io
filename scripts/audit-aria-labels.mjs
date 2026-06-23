import fs from "node:fs";

import * as cheerio from "cheerio";

// Terminal colors
const C = {
  reset: "\u{1B}[0m",
  bright: "\u{1B}[1m",
  dim: "\u{1B}[2m",
  cyan: "\u{1B}[36m",
  green: "\u{1B}[32m",
  yellow: "\u{1B}[33m",
  red: "\u{1B}[31m",
};

/**
 * CSS.escape polyfill for Node.js. Simplified escape for attribute selectors,
 * avoiding complex regexes that trigger Sonar control-character rules.
 *
 * @param {string} str - The raw attribute value to escape.
 * @returns {string} The escaped value.
 */
const cssEscape = (str) => {
  if (!str) return "";
  return str.replaceAll(/([^a-zA-Z0-9_-])/g, String.raw`\$1`);
};

// Non-descriptive accessible names worth rewriting to something specific.
// An audit warning (not an error) — these read identically out of context in a
// screen-reader's elements list and fail WCAG 2.4.4 / 2.4.9 when they link to
// different destinations.
const GENERIC_NAMES = new Set([
  "link",
  "links",
  "button",
  "click here",
  "click",
  "here",
  "read more",
  "more",
  "learn more",
  "see more",
  "view more",
  "read",
  "view",
  "details",
  "this",
  "go",
  "open",
  "download",
  "image",
  "photo",
  "picture",
  "icon",
  "logo",
  "menu",
  "submit",
  "ok",
  "next",
  "previous",
  "prev",
  "back",
  "continue",
  "info",
  "more info",
  "→",
  "←",
  "»",
  "«",
]);

/**
 * Flags an accessible name as too generic to be useful out of context.
 *
 * @param {string} name - The resolved accessible name.
 * @returns {boolean} True when the name is non-descriptive.
 */
function isGenericName(name) {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (GENERIC_NAMES.has(n)) return true;
  // A single non-alphanumeric glyph used as a label (e.g. "•", "·", ">").
  return n.length === 1 && !/[a-z0-9]/i.test(n);
}

const INTERACTIVE = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);
const FORM_FIELD = new Set(["input", "select", "textarea"]);

/**
 * Checks whether an element needs an accessibility name and how it qualifies.
 *
 * @param {string} tagName - The element's tag name.
 * @param {Record<string, string|undefined>} attrs - Relevant attributes.
 * @returns {{skip?: boolean, isInteractive?: boolean, isImg?: boolean, isMeaningfulSvg?: boolean, hasExplicitAria?: boolean}}
 */
function getInterest(tagName, attrs) {
  // role="presentation"/"none" explicitly removes semantics — never needs a name.
  if (attrs.role === "presentation" || attrs.role === "none") {
    return { skip: true };
  }
  const isInteractive =
    INTERACTIVE.has(tagName) &&
    !(tagName === "input" && attrs.type === "hidden");
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
 * Visible text content of an element, excluding `aria-hidden` subtrees (so
 * decorative icons inside a link/button don't pollute its accessible name).
 *
 * @param {import("cheerio").CheerioAPI} $ - The cheerio instance.
 * @param {import("cheerio").Cheerio<never>} $el - The element wrapper.
 * @returns {string} The visible, accessible text.
 */
function visibleText($, $el) {
  return $el.clone().find('[aria-hidden="true"]').remove().end().text().trim();
}

/**
 * Resolves an element's accessible name following (a simplified subset of) the
 * accessible-name computation order: aria-labelledby → aria-label → native form
 * labelling → img alt → visible text → nested labelled descendant → title.
 *
 * @param {import("cheerio").CheerioAPI} $ - The cheerio instance.
 * @param {import("cheerio").Cheerio<never>} $el - The element wrapper.
 * @param {Record<string, string|undefined>} attrs - Relevant attributes.
 * @returns {string} The resolved accessible name ("" when none).
 */
function getAccName($, $el, attrs) {
  // 1. aria-labelledby (resolve referenced ids)
  if (attrs.ariaLabelledBy) {
    const texts = attrs.ariaLabelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const el = $(`[id="${cssEscape(id)}"]`);
        return el.length > 0 ? el.text().trim() : "";
      })
      .filter(Boolean);
    if (texts.length > 0) return texts.join(" ");
  }

  // 2. aria-label
  if (attrs.ariaLabel?.trim()) return attrs.ariaLabel.trim();

  // 3. Native form-field labelling (label[for] / title / value / placeholder)
  if (FORM_FIELD.has($el[0]?.tagName)) {
    if (attrs.id) {
      const lbl = $(`label[for="${cssEscape(attrs.id)}"]`);
      if (lbl.length > 0 && lbl.text().trim()) return lbl.text().trim();
    }
    return (
      attrs.title?.trim() ||
      attrs.value?.trim() ||
      attrs.placeholder?.trim() ||
      ""
    );
  }

  // 4. img alt (present-but-empty alt = intentionally decorative → "")
  if (attrs.alt !== undefined) return attrs.alt.trim();

  // 5. Visible text (excluding aria-hidden decorative content)
  const txt = visibleText($, $el);
  if (txt) return txt;

  // 6. Nested labelled descendant (icon-only link wrapping <img alt> / [aria-label])
  const nestedImg = $el.find("img[alt]").first().attr("alt");
  if (nestedImg?.trim()) return nestedImg.trim();
  const nestedAria = $el.find("[aria-label]").first().attr("aria-label");
  if (nestedAria?.trim()) return nestedAria.trim();

  // 7. title fallback
  return attrs.title?.trim() || "";
}

/**
 * Logs a single accessibility finding.
 *
 * @param {Record<string, unknown>} f - The finding object.
 * @param {number} idx - Zero-based index for display.
 */
function printFinding(f, idx) {
  // typeof guards narrow the loosely-typed finding fields to strings (so they
  // are never base-stringified to "[object Object]").
  const tag = typeof f.tag === "string" ? f.tag : "";
  const id = typeof f.id === "string" ? f.id : "";
  const cls = typeof f.class === "string" ? f.class : "";
  const accName = typeof f.accName === "string" ? f.accName : "";
  const href = typeof f.href === "string" ? f.href : "";
  const idStr = id ? `#${id}` : "";
  const classStr = cls
    ? `.${cls.trim().split(/\s+/).filter(Boolean).join(".")}`
    : "";

  console.log(
    `${C.dim}[${idx + 1}]${C.reset} ${C.bright}${tag}${C.dim}${idStr}${classStr}${C.reset}`,
  );
  if (accName) console.log(`    ${C.green}name:${C.reset} "${accName}"`);
  if (href) console.log(`    ${C.dim}href:${C.reset} ${href}`);
  if (!f.hasName) console.log(`    ${C.red}⚠️  ERROR: Missing name.${C.reset}`);
  if (f.isAmbiguous)
    console.log(
      `    ${C.red}✖ AMBIGUOUS:${C.reset} "${accName}" labels ${f.destCount} different destinations (WCAG 2.4.4).`,
    );
  else if (f.isButtonRepeated)
    console.log(
      `    ${C.red}✖ REPEATED:${C.reset} Name shared by ${f.repeatCount} non-link controls — verify they act identically.`,
    );
  else if (f.isRepeated)
    console.log(
      `    ${C.dim}↔ duplicate: name used by ${f.repeatCount} links to the same destination (OK).${C.reset}`,
    );
  if (f.isGeneric)
    console.log(
      `    ${C.yellow}💬 GENERIC:${C.reset} Non-descriptive name — rewrite to something specific.`,
    );
  if (f.isRedundant)
    console.log(`    ${C.yellow}💡 REDUNDANT: Matches visible text.${C.reset}`);
  console.log("");
}

/**
 * Reads the attributes inspected by the audit from one element.
 *
 * @param {import("cheerio").Cheerio<never>} $el - The element wrapper.
 * @returns {Record<string, string|undefined>} The attribute bag.
 */
function readAttrs($el) {
  return {
    ariaLabel: $el.attr("aria-label"),
    ariaLabelledBy: $el.attr("aria-labelledby"),
    role: $el.attr("role"),
    alt: $el.attr("alt"),
    title: $el.attr("title"),
    ariaHidden: $el.attr("aria-hidden"),
    id: $el.attr("id"),
    class: $el.attr("class"),
    type: $el.attr("type"),
    value: $el.attr("value"),
    placeholder: $el.attr("placeholder"),
    href: $el.attr("href"),
  };
}

/**
 * Evaluates one element. When it needs an accessible name, records the
 * file-wide frequency/href data and returns a finding; otherwise returns null.
 *
 * @param {import("cheerio").CheerioAPI} $ - The cheerio instance.
 * @param {never} el - The raw element.
 * @param {Map<string, number>} freq - accName → occurrence count (mutated).
 * @param {Map<string, Set<string>>} nameHrefs - accName → hrefs (mutated).
 * @returns {Record<string, unknown>|null} The finding, or null when not of interest.
 */
function evaluateElement($, el, freq, nameHrefs) {
  const $el = $(el);
  const attrs = readAttrs($el);
  const interest = getInterest(el.tagName, attrs);
  if (interest.skip) return null;
  if (attrs.ariaHidden === "true" && !interest.isInteractive) return null;
  if (
    !interest.isInteractive &&
    !interest.isImg &&
    !interest.isMeaningfulSvg &&
    !interest.hasExplicitAria
  ) {
    return null;
  }

  const accName = getAccName($, $el, attrs);
  if (interest.isInteractive && accName) {
    freq.set(accName, (freq.get(accName) || 0) + 1);
    if (el.tagName === "a" && attrs.href) {
      if (!nameHrefs.has(accName)) nameHrefs.set(accName, new Set());
      nameHrefs.get(accName).add(attrs.href);
    }
  }

  return {
    tag: el.tagName,
    ...attrs,
    accName,
    hasName: !!accName,
    isRedundant:
      !!attrs.ariaLabel &&
      attrs.ariaLabel.trim().toLowerCase() ===
        visibleText($, $el).toLowerCase(),
    isGeneric: interest.isInteractive && isGenericName(accName),
    isInteractive: interest.isInteractive,
  };
}

/**
 * Cross-references a finding against the file-wide frequency/href maps,
 * deciding whether it is an ambiguous link or a repeated non-link control.
 *
 * @param {Record<string, unknown>} f - The finding (mutated in place).
 * @param {Map<string, number>} freq - accName → occurrence count.
 * @param {Map<string, Set<string>>} nameHrefs - accName → distinct hrefs.
 */
function annotate(f, freq, nameHrefs) {
  f.repeatCount = freq.get(f.accName) || 0;
  f.isRepeated = f.repeatCount > 1;
  f.destCount = nameHrefs.get(f.accName)?.size ?? 0;
  f.isAmbiguous = f.tag === "a" && f.destCount > 1;
  f.isButtonRepeated = f.isRepeated && f.tag !== "a";
}

/**
 * Whether a finding passes the active CLI filters. `--repeated` surfaces only
 * the actionable cases (ambiguous links + repeated non-link controls), not
 * benign same-destination link duplicates.
 *
 * @param {Record<string, unknown>} f - The annotated finding.
 * @param {{rep: boolean, err: boolean, gen: boolean}} options - Filter flags.
 * @returns {boolean} True when the finding should be printed.
 */
function shouldShow(f, options) {
  if (!options.rep && !options.err && !options.gen) return true;
  if (options.rep && (f.isAmbiguous || f.isButtonRepeated)) return true;
  if (options.err && !f.hasName && f.isInteractive) return true;
  return !!(options.gen && f.isGeneric);
}

/**
 * Audits a single HTML file.
 *
 * @param {string} path - Path to the built HTML file.
 * @param {{rep: boolean, err: boolean, gen: boolean}} options - Filter flags.
 * @returns {number} The count of interactive elements missing a name.
 */
function audit(path, options) {
  const $ = cheerio.load(fs.readFileSync(path, "utf-8"));
  const findings = [];
  const freq = new Map();
  // name → Set of distinct hrefs, to tell apart benign duplicates (same name,
  // same destination) from ambiguous links (same name, different destinations).
  const nameHrefs = new Map();

  $("*").each((_, el) => {
    const f = evaluateElement($, el, freq, nameHrefs);
    if (f) findings.push(f);
  });

  const stats = {
    total: findings.length,
    ok: findings.filter((f) => f.hasName).length,
    missing: findings.filter((f) => f.isInteractive && !f.hasName).length,
    redundant: findings.filter((f) => f.isRedundant).length,
    generic: findings.filter((f) => f.isGeneric).length,
    repeated: [...freq.values()].filter((c) => c > 1).length,
    ambiguous: [...nameHrefs.values()].filter((s) => s.size > 1).length,
  };

  findings.forEach((f, i) => {
    annotate(f, freq, nameHrefs);
    if (shouldShow(f, options)) printFinding(f, i);
  });

  console.log(`\n${C.bright}Audit Summary for ${path}${C.reset}`);
  console.log(
    `- OK: ${stats.ok} | Missing: ${stats.missing} | Ambiguous links: ${stats.ambiguous} | Repeated names: ${stats.repeated} | Generic: ${stats.generic} | Redundant: ${stats.redundant}\n`,
  );
  return stats.missing;
}

/**
 * CLI entrypoint. Audits each HTML file passed as an argument.
 * Flags: --errors (missing names), --repeated (duplicate names),
 * --generic (non-descriptive names). With no flag, shows everything.
 * Exit code is non-zero only when an interactive element is missing a name.
 */
function main() {
  const args = process.argv.slice(2);
  const htmlFiles = args.filter((a) => !a.startsWith("-"));

  if (htmlFiles.length === 0) {
    console.warn(`${C.yellow}⚠️  No HTML files provided for audit.${C.reset}`);
    process.exit(0);
  }

  let totalErrors = 0;
  let filesProcessed = 0;
  const opts = {
    rep: args.includes("--repeated"),
    err: args.includes("--errors"),
    gen: args.includes("--generic"),
  };

  for (const file of htmlFiles) {
    if (fs.existsSync(file)) {
      totalErrors += audit(file, opts);
      filesProcessed++;
    } else {
      console.warn(`${C.red}⚠️  File not found: ${file}${C.reset}`);
    }
  }

  if (filesProcessed === 0) {
    console.error(`${C.red}❌ No existing files were processed.${C.reset}`);
    process.exit(1);
  }

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
