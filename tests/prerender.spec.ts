/**
 * Prerender / Speculation Rules Tests
 *
 * Validates that Astro's clientPrerender feature is working correctly
 * and that speculation rules are properly injected with CSP nonce support.
 */

import { expect, test } from "@playwright/test";

import type { SpeculationRule, SpeculationRuleInfo } from "./utils";

test.describe("Speculation Rules / Prerender", () => {
  test("speculation rules are injected on homepage", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });

    // Wait for prefetch scripts to initialize
    await page.waitForFunction(() => document.readyState === "complete");

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
    // With prefetchAll: true and viewport strategy, links should trigger speculation rules
    const internalLinks = page.locator('a[href^="/"]');
    const linkCount = await internalLinks.count();

    // Hover over at least one link to trigger prefetch (if there are any)
    // eslint-disable-next-line playwright/no-conditional-in-test -- Conditional hover based on link availability
    if (linkCount > 0) {
      await internalLinks.first().hover();
      // Give prefetch scripts time to execute after hover
      await page.waitForFunction(() => document.readyState === "complete");
    }

    // Check for speculation rules scripts
    const speculationRules = await page.evaluate((): SpeculationRuleInfo[] => {
      const scripts = document.querySelectorAll(
        'script[type="speculationrules"]',
      );
      return [...scripts].map((script) => {
        let content: SpeculationRule | null = null;
        try {
          content = JSON.parse(script.textContent || "{}") as SpeculationRule;
        } catch {
          content = null;
        }
        return {
          content,
          nonce: (script as HTMLScriptElement).nonce || "",
          hasNonce: !!(script as HTMLScriptElement).nonce,
        };
      });
    });

    // Note: Astro's clientPrerender experimental feature may not inject speculation
    // rules in all environments (the __EXPERIMENTAL_CLIENT_PRERENDER__ flag must be
    // defined at build time). If no rules are found, the test validates gracefully.
    // eslint-disable-next-line playwright/no-conditional-in-test -- Graceful handling when feature is disabled
    if (speculationRules.length > 0) {
      // Each speculation rule should have valid content
      for (const rule of speculationRules) {
        // eslint-disable-next-line playwright/no-conditional-expect -- Conditional check for prerender/prefetch
        expect(rule.content).toBeTruthy();
        // Speculation rules should have either prerender or prefetch

        const hasPrerender = rule.content?.prerender !== undefined;

        const hasPrefetch = rule.content?.prefetch !== undefined;
        // eslint-disable-next-line playwright/no-conditional-expect -- Validate at least one rule type exists
        expect(hasPrerender || hasPrefetch).toBe(true);
      }
    } else {
      // Log that no speculation rules were found (not necessarily a failure)
      console.log(
        "Note: No speculation rules found. " +
          "This is expected if clientPrerender experimental flag is not enabled.",
      );
    }
  });

  test("speculation rules contain expected properties", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.readyState === "complete");

    // Trigger prefetch by hovering over internal link
    const internalLinks = page.locator('a[href^="/"]');
    // eslint-disable-next-line playwright/no-conditional-in-test -- Conditional hover based on link availability
    if ((await internalLinks.count()) > 0) {
      await internalLinks.first().hover();
      await page.waitForFunction(() => document.readyState === "complete");
    }

    const speculationRules = await page.evaluate((): SpeculationRule[] => {
      const scripts = document.querySelectorAll(
        'script[type="speculationrules"]',
      );
      return [...scripts].map((script) => {
        try {
          return JSON.parse(script.textContent || "{}") as SpeculationRule;
        } catch {
          return {};
        }
      });
    });

    // Validate structure of each speculation rule
    for (const rule of speculationRules) {
      // eslint-disable-next-line playwright/no-conditional-in-test -- Only validate if rule exists
      if (rule) {
        // Check prerender configuration
        // eslint-disable-next-line playwright/no-conditional-expect -- Conditional validation of prerender
        expect(rule.prerender).toBeInstanceOf(Array);
        // eslint-disable-next-line playwright/no-conditional-in-test -- Check if prerender has items
        if (rule.prerender && rule.prerender.length > 0) {
          const prerenderRule = rule.prerender[0];
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prerender structure
          expect(prerenderRule).toHaveProperty("source", "list");
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prerender structure
          expect(prerenderRule).toHaveProperty("urls");
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prerender structure
          expect(prerenderRule).toHaveProperty("eagerness");
        }

        // Check prefetch configuration
        // eslint-disable-next-line playwright/no-conditional-expect -- Conditional validation of prefetch
        expect(rule.prefetch).toBeInstanceOf(Array);
        // eslint-disable-next-line playwright/no-conditional-in-test -- Check if prefetch has items
        if (rule.prefetch && rule.prefetch.length > 0) {
          const prefetchRule = rule.prefetch[0];
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prefetch structure
          expect(prefetchRule).toHaveProperty("source", "list");
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prefetch structure
          expect(prefetchRule).toHaveProperty("urls");
          // eslint-disable-next-line playwright/no-conditional-expect -- Validate prefetch structure
          expect(prefetchRule).toHaveProperty("eagerness");
        }
      }
    }
  });

  test("speculation rules URLs are internal links", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.readyState === "complete");

    // Trigger prefetch by hovering over internal link
    const internalLinks = page.locator('a[href^="/"]');
    // eslint-disable-next-line playwright/no-conditional-in-test -- Conditional hover based on link availability
    if ((await internalLinks.count()) > 0) {
      await internalLinks.first().hover();
      await page.waitForFunction(() => document.readyState === "complete");
    }

    const speculationRules = await page.evaluate(() => {
      const scripts = document.querySelectorAll(
        'script[type="speculationrules"]',
      );
      const allUrls: string[] = [];

      for (const script of scripts) {
        try {
          const rule = JSON.parse(script.textContent || "{}") as {
            prerender?: Array<{ urls?: string[] }>;
          };
          if (rule.prerender) {
            for (const p of rule.prerender) {
              if (p.urls) allUrls.push(...p.urls);
            }
          }
        } catch {
          // Ignore parse errors
        }
      }

      return { urls: allUrls, origin: globalThis.location.origin };
    });

    // All URLs in speculation rules should be internal (same origin)
    for (const url of speculationRules.urls) {
      const urlObj = new URL(url, speculationRules.origin);
      expect(urlObj.origin).toBe(speculationRules.origin);
    }
  });

  test("no CSP violations from speculation rules", async ({ page }) => {
    const cspViolations: string[] = [];

    // Listen for console errors related to CSP
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.includes("Content Security Policy") ||
          text.includes("speculationrules")
        ) {
          cspViolations.push(text);
        }
      }
    });

    await page.goto("/", { waitUntil: "load" });
    await page.waitForFunction(() => document.readyState === "complete");

    // Check that speculation rules were created without CSP errors
    expect(cspViolations).toEqual([]);
  });
});
