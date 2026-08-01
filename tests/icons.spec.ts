/* eslint-disable playwright/no-conditional-expect */
/* eslint-disable playwright/no-conditional-in-test */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Icons Consistency Test
 *
 * Ensures that:
 * 1. Every icon used in a page has a CSS rule reachable from that page.
 * 2. No page defines the same icon rule twice.
 * 3. Every generated icon rule that no page renders still traces back to a
 *    token in the sources UnoCSS scans — the guard against stale rules
 *    surviving in a cached/partial build.
 *
 * Check 3 replaces an older per-page "no unused icon rule" assertion. Since
 * `inlineStylesheets: "auto"`, the large sheet is a shared, immutable
 * `/_astro/*.css` rather than per-page inline CSS, and a shared bundle contains
 * rules for pages that do not use them by definition — that is what makes it
 * shareable and cacheable at all. Site-wide, "unused" is also expected for a
 * legitimate set: the `uno.config.ts` safelist and the component-level dynamic
 * icon maps (FileDownload by file extension, CapabilityMatrix, IconList,
 * Timeline) declare icons that only render for content that happens to use
 * them. What must never happen is a rule with no source token at all.
 */

const DIST_DIR = "./dist";

/** `class="i-mdi:foo"` occurrences in markup. */
const ICON_USE_PATTERN = /\bi-([a-z0-9-]+):([a-z0-9-]+)\b/gi;
/** `.i-mdi\:foo {` rule heads in CSS. */
const ICON_RULE_PATTERN = /\.i-([a-z0-9-]+)\\:([a-z0-9-]+)\s*\{/gi;

function getHtmlFiles(dir: string, allFiles: string[] = []) {
  if (!existsSync(dir)) return allFiles;
  const files = readdirSync(dir);
  let tagSampleFound = false;

  for (const file of files) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      if (fullPath.includes("/blog/tags/")) {
        if (!tagSampleFound) {
          getHtmlFiles(fullPath, allFiles);
          tagSampleFound = true;
        }
        continue;
      }
      getHtmlFiles(fullPath, allFiles);
    } else if (extname(file) === ".html") {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

/**
 * Icons a page uses, and the icon rules reachable from it (inline `<style>`
 * plus every same-origin stylesheet it links), with a definition count so
 * duplicates can be detected.
 *
 * @param filePath - Path to the built HTML file.
 * @returns The used icon set and the defined icon counts.
 */
function collectIcons(filePath: string): {
  used: Set<string>;
  defined: Map<string, number>;
} {
  const html = readFileSync(filePath, "utf8");

  const used = new Set<string>();
  for (const match of html.matchAll(ICON_USE_PATTERN)) {
    used.add(`i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
  }

  const defined = new Map<string, number>();
  const addDefinedIcon = (icon: string) => {
    defined.set(icon, (defined.get(icon) || 0) + 1);
  };

  for (const match of html.matchAll(ICON_RULE_PATTERN)) {
    addDefinedIcon(`i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
  }

  const cssFiles = [...html.matchAll(/href="([^"]+\.css)"/g)].map(
    (match) => match[1],
  );
  for (const cssPath of cssFiles) {
    try {
      const fullCssPath = join(
        DIST_DIR,
        cssPath.startsWith("/") ? cssPath : join(filePath, "..", cssPath),
      );
      if (existsSync(fullCssPath)) {
        const cssContent = readFileSync(fullCssPath, "utf8");
        for (const match of cssContent.matchAll(ICON_RULE_PATTERN)) {
          addDefinedIcon(
            `i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`,
          );
        }
      }
    } catch {
      /* ignore */
    }
  }

  return { used, defined };
}

/** Every text source UnoCSS's extractors read (components, pages, content). */
const SOURCE_EXTENSIONS = new Set([
  ".astro",
  ".ts",
  ".tsx",
  ".mdx",
  ".md",
  ".yaml",
  ".yml",
  ".json",
  ".css",
]);

/**
 * Recursively lists the source files UnoCSS scans for icon tokens.
 *
 * @param dir - Directory to walk.
 * @param allFiles - Accumulator.
 * @returns Paths of every scannable source file.
 */
function collectSourceFiles(dir: string, allFiles: string[] = []): string[] {
  if (!existsSync(dir)) return allFiles;
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      collectSourceFiles(fullPath, allFiles);
    } else if (SOURCE_EXTENSIONS.has(extname(file))) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

const htmlFiles = getHtmlFiles(DIST_DIR);

test.describe("UnoCSS Icons Consistency", () => {
  htmlFiles.forEach((filePath) => {
    const pageName = relative(DIST_DIR, filePath);

    test(`Page: ${pageName} - should have consistent icons`, async () => {
      const { used, defined } = collectIcons(filePath);

      if (used.size > 0 || defined.size > 0) {
        // Check 1: every icon used in the markup must have a rule the page
        // can actually reach.
        const missingCss = [...used].filter((icon) => !defined.has(icon));
        expect(
          missingCss,
          `Icons used in HTML but missing CSS rules in ${pageName}`,
        ).toEqual([]);

        // Check 2: a rule must not be defined twice for the same page (that
        // means two sheets are shipping the same bytes).
        const duplicatedIcons = [...defined]
          .filter(([_, count]) => count > 1)
          .map(([icon, count]) => `${icon} (defined ${count} times)`);

        expect(
          duplicatedIcons,
          `Duplicated icon CSS rules found in ${pageName}`,
        ).toEqual([]);
      }

      // Satisfy @typescript-eslint/require-await
      await Promise.resolve();
    });
  });

  test("every generated icon rule traces back to a source token", async () => {
    const allUsed = new Set<string>();
    const allDefined = new Set<string>();

    for (const filePath of htmlFiles) {
      const { used, defined } = collectIcons(filePath);
      used.forEach((icon) => allUsed.add(icon));
      defined.forEach((_, icon) => allDefined.add(icon));
    }

    // Everything UnoCSS scans: the safelist plus every source file the
    // extractors read. An icon rule whose token appears in none of them is a
    // rule nothing asked for.
    const sourceText = [
      readFileSync("./uno.config.ts", "utf8"),
      ...collectSourceFiles("./src").map((file) => readFileSync(file, "utf8")),
    ].join("\n");

    const orphaned = [...allDefined]
      .filter((icon) => !allUsed.has(icon))
      .filter((icon) => !sourceText.includes(icon.replace(/^i-/, "")));

    expect(
      orphaned,
      "Icon CSS rules generated from no source token (stale CSS)",
    ).toEqual([]);

    // Satisfy @typescript-eslint/require-await
    await Promise.resolve();
  });
});
