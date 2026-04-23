/**
 * Prerender / Speculation Rules Tests
 *
 * Validates Astro's `clientPrerender` feature (Speculation Rules API).
 *
 * This suite ensures that:
 * 1. Speculation rules are correctly injected into the HTML.
 * 2. Prerender rules contain expected properties (source, action, urls).
 * 3. Projected prerender URLs are strictly internal to the site.
 * 4. Speculation rules scripts do not trigger CSP violations.
 */

import { expect, test } from "@playwright/test";

import type { SpeculationRule, SpeculationRuleInfo } from "./utils";

/**
 * Helper to extract all URLs from a set of speculation rules.
 */
function getUrlsFromRules(rules: (SpeculationRule | null)[]): string[] {
  return rules.flatMap((rule) => {
    if (!rule) return [];
    const prerenderUrls = (rule.prerender || []).flatMap((p) => p.urls || []);
    const prefetchUrls = (rule.prefetch || []).flatMap((p) => p.urls || []);
    return [...prerenderUrls, ...prefetchUrls];
  });
}

/**
 * Helper to get speculation rules from the page.
 * Handles navigation, hovering, and parsing.
 */
async function getSpeculationRules(
  page: import("@playwright/test").Page,
): Promise<(SpeculationRule | null)[]> {
  await page.goto("/", { waitUntil: "load" });

  // Trigger prefetch by hovering over internal link
  const internalLinks = page.locator('a[href^="/"]');

  // Verify links exist
  expect(await internalLinks.count()).toBeGreaterThan(0);

  await internalLinks.first().hover();
  try {
    // eslint-disable-next-line playwright/no-wait-for-selector
    await page.waitForSelector('script[type="speculationrules"]', {
      timeout: 1000,
    });
  } catch {
    // ignore
  }

  return page.evaluate((): (SpeculationRule | null)[] => {
    const scripts = document.querySelectorAll(
      'script[type="speculationrules"]',
    );

    return [...scripts].map((script): SpeculationRule | null => {
      const content = script.textContent;
      if (!content?.trim()) return null;
      try {
        return JSON.parse(content) as SpeculationRule;
      } catch {
        return null;
      }
    });
  });
}

test.describe("Speculation Rules / Prerender", () => {
  test("speculation rules are injected on homepage", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    // Check if the browser supports speculation rules
    const browserSupportsSpecRules = await page.evaluate(() => {
      return HTMLScriptElement.supports?.("speculationrules") ?? false;
    });

    // Skip test if browser doesn't support speculation rules
    // eslint-disable-next-line playwright/no-skipped-test -- Intentional: skip for unsupported browsers
    test.skip(
      !browserSupportsSpecRules,
      "Browser does not support speculation rules",
    );

    // Trigger prefetch by hovering over internal links
    const internalLinks = page.locator('a[href^="/"]');
    const linkCount = await internalLinks.count();

    // Verify we have internal links to test with
    expect(linkCount).toBeGreaterThan(0);

    // Hover over the first link to trigger prefetch
    await internalLinks.first().hover();

    // Give prefetch scripts time to execute after hover using a deterministic wait
    try {
      // eslint-disable-next-line playwright/no-wait-for-selector -- Intentional wait for speculation rules script
      await page.waitForSelector('script[type="speculationrules"]', {
        state: "attached",
        timeout: 2000,
      });
    } catch {
      // Fallback or ignore if not found
    }

    // Check for speculation rules scripts
    const speculationRules = await page.evaluate((): SpeculationRuleInfo[] => {
      const scripts = document.querySelectorAll(
        'script[type="speculationrules"]',
      );
      return [...scripts].map((script) => {
        let content: SpeculationRule | null = null;
        const textContent = script.textContent;
        if (textContent?.trim()) {
          try {
            content = JSON.parse(textContent) as SpeculationRule;
          } catch {
            content = null;
          }
        }
        return {
          content,
          nonce: (script as HTMLScriptElement).nonce || "",
          hasNonce: !!(script as HTMLScriptElement).nonce,
        };
      });
    });

    // Guard: Ensure speculation rules are present (not just an empty array)
    expect(
      speculationRules.length,
      "Expected speculation rules to be injected",
    ).toBeGreaterThan(0);

    for (const rule of speculationRules) {
      expect(rule.content).toBeTruthy();
      const hasPrerender = rule.content?.prerender !== undefined;
      const hasPrefetch = rule.content?.prefetch !== undefined;
      expect(hasPrerender || hasPrefetch).toBe(true);
    }
  });

  test("speculation rules contain expected properties", async ({ page }) => {
    const speculationRules = await getSpeculationRules(page);
    const validRules = speculationRules.filter(
      (rule): rule is SpeculationRule => rule !== null,
    );

    // Guard: Fail test if no valid rules parsed
    expect(
      validRules.length,
      "Expected at least one valid speculation rule",
    ).toBeGreaterThan(0);

    for (const rule of validRules) {
      // Ensure at least one of prerender or prefetch has non-empty urls
      const prerenderRules = rule.prerender || [];
      const prefetchRules = rule.prefetch || [];
      expect(
        prerenderRules.length > 0 || prefetchRules.length > 0,
        "Expected rule to have prerender or prefetch entries",
      ).toBe(true);

      for (const prerenderRule of prerenderRules) {
        expect(prerenderRule).toHaveProperty("source", "list");
        expect(prerenderRule).toHaveProperty("urls");
        expect(prerenderRule).toHaveProperty("eagerness");
        // Validate urls array is non-empty
        expect(
          Array.isArray(prerenderRule.urls) && prerenderRule.urls.length > 0,
          "Expected prerender rule to have non-empty urls array",
        ).toBe(true);
      }

      for (const prefetchRule of prefetchRules) {
        expect(prefetchRule).toHaveProperty("source", "list");
        expect(prefetchRule).toHaveProperty("urls");
        expect(prefetchRule).toHaveProperty("eagerness");
        // Validate urls array is non-empty
        expect(
          Array.isArray(prefetchRule.urls) && prefetchRule.urls.length > 0,
          "Expected prefetch rule to have non-empty urls array",
        ).toBe(true);
      }
    }
  });

  test("speculation rules URLs are internal links", async ({ page }) => {
    const rules = await getSpeculationRules(page);
    const urls = getUrlsFromRules(rules);

    // Guard: Fail if no URLs found in speculation rules
    expect(
      urls.length,
      "Expected speculation rules to contain URLs",
    ).toBeGreaterThan(0);

    const origin = await page.evaluate(() => globalThis.location.origin);

    for (const url of urls) {
      const urlObj = new URL(url, origin);
      expect(urlObj.origin).toBe(origin);
    }
  });

  test("no CSP violations from speculation rules", async ({ page }) => {
    const cspViolations: string[] = [];

    await page.exposeFunction("reportCspViolation", (uri: string) => {
      cspViolations.push(uri);
    });

    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        (
          globalThis as unknown as { reportCspViolation: (uri: string) => void }
        ).reportCspViolation(e.blockedURI);
      });
    });

    await page.goto("/", { waitUntil: "load" });
    // Note: waitUntil: "load" already waits for document.readyState === "complete"

    const internalLinks = page.locator('a[href^="/"]');
    // eslint-disable-next-line playwright/no-conditional-in-test
    if ((await internalLinks.count()) > 0) {
      await internalLinks.first().hover();
    }

    // Wait for any async violation handlers to fire
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(150);

    expect(cspViolations).toEqual([]);
  });
});
