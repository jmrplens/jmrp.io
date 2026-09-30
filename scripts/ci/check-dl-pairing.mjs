/**
 * Description-list pairing guard
 *
 * HTML associates each `<dt>` with the `<dd>` elements that FOLLOW it: a
 * `<dl>` is a sequence of groups, each one or more `<dt>` then one or more
 * `<dd>`, either bare or one group per `<div>`. GEO audit #11 (C2) found the
 * figure tiles of /projects/ and /projects/contributions/ written the other
 * way round, `<div><dd>VALUE</dd><dt>LABEL</dt></div>`, so the number sat
 * above its label on screen. Anything that reads the list as the spec says
 * (label, then the value after it) paired every label with the NEXT tile's
 * figure, and answer engines published those shifted figures as fact. Neither
 * `html-validate` nor axe reports the order; the W3C Nu validator does.
 *
 * This reads every built page and fails when a group:
 *
 *   - starts with `<dd>` (a value with no label before it),
 *   - ends with `<dt>` (a label with no value after it),
 *   - sits in a `<div>` that lacks a `<dt>` or a `<dd>`, or holds more than
 *     one group,
 *   - or when a `<dl>` holds anything but `<dt>`/`<dd>` (or `<div>` groups),
 *     script-supporting elements aside.
 *
 * It uses cheerio's spec-following parser rather than a pattern match, so an
 * end tag the minifier omitted or an attribute order it rewrote cannot hide a
 * group or invent one.
 *
 * Run manually: `node scripts/ci/check-dl-pairing.mjs [distDir]`
 * Wired into `astro:build:done` (src/integrations/post-build.ts), so an
 * inverted list fails the build BEFORE deploy-swap.mjs retargets `dist`.
 *
 * Exit codes: 0 clean · 1 wrongly paired groups found (listed) · 2 the guard
 * itself could not run (bad argument, unreadable build).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as cheerio from "cheerio";

/** Elements a `<dl>` or a `<div>` group may hold anywhere, per the spec. */
const SCRIPT_SUPPORTING = new Set(["script", "template"]);

/** Longest snippet printed per violation, so one bad page stays readable. */
const SNIPPET_MAX = 160;

/**
 * Walks a directory tree collecting `.html` files.
 *
 * @param {string} root - Directory to walk.
 * @returns {string[]} Absolute file paths, sorted.
 */
function htmlFiles(root) {
  /** @type {string[]} */
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Outer HTML of an element, whitespace collapsed, Astro's scoping attributes
 * dropped, and cut to a readable size.
 *
 * @param {import("cheerio").CheerioAPI} $ - The parsed page.
 * @param {import("domhandler").Element} el - The element to show.
 * @returns {string} The snippet.
 */
function snippet($, el) {
  const html = ($.html(el) ?? "")
    .replaceAll(/\sdata-astro-cid-[\w-]+(?:="[^"]*")?/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
  return html.length > SNIPPET_MAX
    ? `${html.slice(0, SNIPPET_MAX - 1)}…`
    : html;
}

/**
 * The opening tag of a `<dl>`, so a violation names which list it is in.
 *
 * @param {import("domhandler").Element} dl - The list.
 * @returns {string} E.g. `<dl class="upstream__tiles">`.
 */
function dlLabel(dl) {
  const cls = dl.attribs?.class;
  return cls ? `<dl class="${cls}">` : "<dl>";
}

/**
 * Element children that take part in the content model (script-supporting
 * elements are allowed anywhere and carry no pairing).
 *
 * @param {import("domhandler").Element} el - The parent.
 * @returns {import("domhandler").Element[]} Its relevant element children.
 */
function modelChildren(el) {
  return el.children.filter(
    (child) => child.type === "tag" && !SCRIPT_SUPPORTING.has(child.name),
  );
}

/**
 * Checks a run of `<dt>`/`<dd>` siblings against "one or more dt, then one or
 * more dd", repeated. Returns the problems in reading order.
 *
 * @param {import("domhandler").Element[]} items - The siblings, in order.
 * @param {boolean} singleGroup - True inside a `<div>`, which holds exactly
 *   one group.
 * @returns {string[]} Problems found; empty when the run pairs correctly.
 */
export function sequenceProblems(items, singleGroup) {
  /** @type {string[]} */
  const problems = [];
  const names = items.map((el) => el.name);
  const unexpected = [
    ...new Set(names.filter((n) => n !== "dt" && n !== "dd")),
  ];
  for (const name of unexpected) problems.push(`holds a <${name}>`);
  const pairs = names.filter((n) => n === "dt" || n === "dd");
  if (singleGroup) {
    if (!pairs.includes("dt")) problems.push("has no <dt>");
    if (!pairs.includes("dd")) problems.push("has no <dd>");
  }
  if (pairs[0] === "dd") problems.push("starts with <dd>");
  let groups = 0;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i] === "dt" && (i === 0 || pairs[i - 1] === "dd")) groups++;
    if (pairs[i] === "dt" && pairs.slice(i + 1).every((n) => n === "dt")) {
      problems.push("has a <dt> with no <dd> after it");
      break;
    }
  }
  if (singleGroup && groups > 1) problems.push("holds more than one group");
  return problems;
}

/**
 * Every wrongly paired group on one page.
 *
 * @param {string} html - The page source.
 * @returns {{list: string, problem: string, snippet: string}[]} One entry per
 *   offending group (a `<div>`, or a bare `<dl>`), in document order.
 */
export function checkDlPairing(html) {
  if (!/<dl[\s>]/i.test(html)) return [];
  const $ = cheerio.load(html);
  /** @type {{list: string, problem: string, snippet: string}[]} */
  const violations = [];
  for (const dl of $("dl")) {
    const children = modelChildren(dl);
    const divs = children.filter((el) => el.name === "div");
    if (divs.length === 0) {
      const problems = sequenceProblems(children, false);
      if (problems.length > 0) {
        violations.push({
          list: dlLabel(dl),
          problem: problems.join("; "),
          snippet: snippet($, dl),
        });
      }
      continue;
    }
    if (divs.length !== children.length) {
      violations.push({
        list: dlLabel(dl),
        problem: "mixes <div> groups with bare <dt>/<dd>",
        snippet: snippet($, dl),
      });
    }
    for (const div of divs) {
      const problems = sequenceProblems(modelChildren(div), true);
      if (problems.length > 0) {
        violations.push({
          list: dlLabel(dl),
          problem: `<div> group ${problems.join("; ")}`,
          snippet: snippet($, div),
        });
      }
    }
  }
  return violations;
}

/**
 * Checks every built page under a directory.
 *
 * @param {string} distDir - The built site.
 * @returns {{violations: {file: string, list: string, problem: string,
 *   snippet: string}[], pages: number}} What was found, and how many pages
 *   were read.
 */
export function checkDist(distDir) {
  const files = htmlFiles(distDir);
  const violations = files.flatMap((file) =>
    checkDlPairing(fs.readFileSync(file, "utf8")).map((v) => ({
      file: path.relative(distDir, file),
      ...v,
    })),
  );
  return { violations, pages: files.length };
}

/**
 * CLI entry: checks the given build and sets the exit code.
 *
 * @param {string} distArg - Directory to check (default `dist`).
 * @returns {void}
 * @throws {Error} When the argument is not a directory holding a built site.
 */
function main(distArg) {
  const resolved = path.resolve(process.cwd(), distArg);
  const isDirectory =
    fs.existsSync(resolved) && fs.statSync(resolved).isDirectory(); // NOSONAR: this IS the validation S8707 asks for, on the canonical path
  if (!isDirectory)
    throw new Error(`${distArg} (${resolved}) is not an existing directory`);
  // `dist` is a symlink to the live colour: resolve it once.
  const distDir = fs.realpathSync(resolved);
  if (!fs.existsSync(path.join(distDir, "index.html")))
    throw new Error(
      `${distArg} (${resolved}) holds no index.html; this guard reads built ` +
        `site output, and refuses to walk a directory that is not one`,
    );
  const { violations, pages } = checkDist(distDir);
  if (violations.length === 0) {
    console.log(
      `✅ Description lists pair every <dt> with a following <dd> in ${distArg}: ${pages} pages.`,
    );
    return;
  }
  const files = new Set(violations.map((v) => v.file));
  console.error(
    `❌ Wrongly paired description lists in ${distArg}: ${violations.length} ` +
      `group(s) on ${files.size} page(s):\n`,
  );
  for (const v of violations) {
    console.error(`  ✗ ${v.file} ${v.list}: ${v.problem}`);
    console.error(`      ${v.snippet}`);
  }
  console.error(
    "\n  Each group is <dt> (label) then <dd> (value). To show the value\n" +
      "  first, keep that DOM order and reorder visually with CSS\n" +
      "  (display: flex; flex-direction: column on the group, order: -1 on\n" +
      "  the <dd>). See GEO audit #11, finding C2.\n",
  );
  process.exitCode = 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    main(process.argv[2] ?? "dist");
  } catch (error) {
    // Exit 2, never 1: a guard that could not run must not read as a finding.
    console.error("❌ check-dl-pairing could not run:", error);
    process.exitCode = 2;
  }
}
