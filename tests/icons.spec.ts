/* eslint-disable playwright/no-conditional-expect */
/* eslint-disable playwright/no-conditional-in-test */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Icons Consistency Test
 * Ensures that:
 * 1. Every icon used in HTML has a corresponding CSS rule.
 * 2. Every icon CSS rule is actually used in the page (no leaking icons).
 */

const DIST_DIR = "./dist";

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

const htmlFiles = getHtmlFiles(DIST_DIR);

test.describe("UnoCSS Icons Consistency", () => {
  htmlFiles.forEach((filePath) => {
    const pageName = relative(DIST_DIR, filePath);

    test(`Page: ${pageName} - should have consistent icons`, async () => {
      const html = readFileSync(filePath, "utf8");

      // Extract used icon classes
      const iconPattern = /\bi-([a-z0-9-]+):([a-z0-9-]+)\b/gi;
      const usedIcons = new Set<string>();
      let m;
      while ((m = iconPattern.exec(html)) !== null) {
        usedIcons.add(`i-${m[1].toLowerCase()}:${m[2].toLowerCase()}`);
      }

      // Extract defined CSS rules for icons
      const iconRuleRegex = /\.i-([a-z0-9-]+)\\:([a-z0-9-]+)\s*\{/gi;
      const definedIcons = new Map<string, number>();

      const addDefinedIcon = (icon: string) => {
        definedIcons.set(icon, (definedIcons.get(icon) || 0) + 1);
      };

      // Inline styles
      const inlineMatches = html.matchAll(iconRuleRegex);
      for (const match of inlineMatches) {
        addDefinedIcon(`i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
      }

      // External CSS
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
            const cssMatches = cssContent.matchAll(iconRuleRegex);
            for (const match of cssMatches) {
              addDefinedIcon(
                `i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`,
              );
            }
          }
        } catch {
          /* ignore */
        }
      }

      // Assertions
      if (usedIcons.size > 0 || definedIcons.size > 0) {
        // Check 1: All used icons must have CSS
        const missingCss = [...usedIcons].filter(
          (icon) => !definedIcons.has(icon),
        );
        expect(
          missingCss,
          `Icons used in HTML but missing CSS rules in ${pageName}`,
        ).toEqual([]);

        // Check 2: All defined icon rules must be used
        const unusedCss = [...definedIcons.keys()].filter(
          (icon) => !usedIcons.has(icon),
        );
        expect(
          unusedCss,
          `Icon CSS rules defined but not used in HTML in ${pageName} (Leaking CSS)`,
        ).toEqual([]);

        // Check 3: Each icon rule must be defined ONLY ONCE
        const duplicatedIcons = [...definedIcons]
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
});
