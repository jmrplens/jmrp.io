import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { name: "Home", url: "/" },
  { name: "Publications", url: "/publications" },
  { name: "CV", url: "/cv" },
  { name: "GitHub", url: "/github" },
  { name: "Services", url: "/services" },
  { name: "Blog Index", url: "/blog" },
];

test.describe("Accessibility Tests (Axe-core WCAG 2.1 AA)", () => {
  for (const page of pages) {
    test(`${page.name} should have no accessibility violations`, async ({
      page: browserPage,
    }) => {
      await browserPage.goto(page.url);

      // Wait for page to be fully loaded
      await browserPage.waitForLoadState("networkidle");

      const accessibilityScanResults = await new AxeBuilder({
        page: browserPage,
      })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();

      // Log violations for debugging
      if (accessibilityScanResults.violations.length > 0) {
        console.log(
          `\n⚠️  ${page.name} has ${accessibilityScanResults.violations.length} accessibility violations:\n`,
        );
        accessibilityScanResults.violations.forEach((violation, index) => {
          console.log(
            `${index + 1}. ${violation.id}: ${violation.description}`,
          );
          console.log(`   Impact: ${violation.impact}`);
          console.log(`   Help: ${violation.helpUrl}`);
          console.log(`   Affected elements: ${violation.nodes.length}\n`);
        });
      }

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});
