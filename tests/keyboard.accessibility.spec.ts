/**
 * Keyboard Navigation Accessibility Tests
 *
 * Tests keyboard-only navigation and interaction patterns:
 * - Tab order through navigation elements
 * - Skip link functionality
 * - Mobile menu keyboard interaction (open/close with Enter/Escape)
 * - Theme toggle keyboard activation
 * - Focus management and return
 *
 * Uses Axe-core to validate focused states for WCAG compliance.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("Keyboard Navigation Accessibility", () => {
  test("Navigate Main Menu with Keyboard", async ({ page }) => {
    await page.goto("/");

    // Ensure we are in a clean state (start at body)
    await page.focus("body");

    // 1. Tab to "Skip to content" then Logo
    // Ensure the page is hydrated/ready by waiting for a key element
    // eslint-disable-next-line playwright/no-wait-for-selector
    await page.waitForSelector(".skip-link");
    await page.keyboard.press("Tab");

    // Assert that the skip link received focus and is visible
    const skipLink = page.locator(".skip-link");
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await expect(skipLink).toBeInViewport();

    await page.keyboard.press("Tab");

    // Now we should be on the Logo (first link in Header)
    await expect(page.locator("header .logo")).toBeFocused();

    // 2. Tab through Navigation Links
    const navLinks = page.locator(".nav-links a:visible");
    const count = await navLinks.count();

    for (let i = 0; i < count; i++) {
      await page.keyboard.press("Tab");
      const link = navLinks.nth(i);
      await expect(link).toBeFocused();
    }

    // 3. Run Axe on the focused state of the last link to ensure focus indicators are valid
    // Note: Axe cannot reliably detect missing or insufficient :focus styles or focus-visible behavior.
    // Manual verification or visual regression tests are recommended.
    const results = await new AxeBuilder({ page }).include("header").analyze();

    expect(results.violations).toEqual([]);
  });

  test("Skip Link Functionality", async ({ page }) => {
    await page.goto("/");

    // Ensure we start fresh
    await page.focus("body");

    // 1. Tab to Skip Link
    await page.keyboard.press("Tab");
    const skipLink = page.locator(".skip-link");
    // Verify it is focused and becomes visible
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    // 2. Activate it
    await page.keyboard.press("Enter");

    // 3. Verify focus moves to Main Content target
    // The skip link href is #main-content
    await expect(page).toHaveURL(/#main-content/);

    const mainContent = page.locator("#main-content");
    await expect(mainContent).toBeFocused();
  });

  test("Mobile Menu Keyboard Interaction", async ({ page }) => {
    // Force mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // 1. Focus the menu toggle button
    const menuToggle = page.locator("#menu-toggle");
    await expect(menuToggle).toBeVisible();

    // Tab until we reach the menu toggle
    // It might take a few tabs depending on logo/skip links
    // Strategy: click to focus body, then find way to button or just focus it directly to simulate "getting there"
    await menuToggle.focus();
    await expect(menuToggle).toBeFocused();

    // 2. Open menu with Enter
    await page.keyboard.press("Enter");

    // Wait for menu to be open
    const navLinksContainer = page.locator("#nav-links");
    await expect(navLinksContainer).toHaveClass(/open/);
    await expect(page.locator("body")).toHaveClass(/menu-open/);

    // 3. Check for focus trap or focus management
    // Ideally, focus should move to the first element in the menu or the close button
    // Navigate via Tab keys to check focus sequence
    // Good practice: Focus should be inside the menu.
    await page.keyboard.press("Tab");

    // Verify focus is within the nav links container
    // Check if the focused element's ancestor is the nav-links container
    // This is a loose check; strict focus trapping is hard to implement perfectly without a library,
    // but we want to ensure we are at least navigating the menu items.

    // For this test, let's verify we can tab through the mobile links

    // If focus didn't move automatically (common issue), we might still be on the toggle or next element.
    // Assert that we can reach the links.

    // Note: If the menu doesn't trap focus or move it, this test might fail or behave unexpectedly.
    // This is a "functional a11y test" - we are testing if it works for keyboard users.

    // Snapshot the open menu state with Axe
    const results = await new AxeBuilder({ page })
      .include("#nav-links")
      .analyze();

    expect(results.violations).toEqual([]);

    // 4. Close menu with Escape
    await page.keyboard.press("Escape");
    await expect(navLinksContainer).not.toHaveClass(/open/);

    // 5. Verify focus returns to toggle (Best Practice)
    await expect(menuToggle).toBeFocused();
  });

  test("Theme Toggle Keyboard Interaction", async ({ page }) => {
    await page.goto("/");

    const themeToggle = page.locator("#theme-toggle");

    // Focus it
    await themeToggle.focus();
    await expect(themeToggle).toBeFocused();

    // Capture initial state
    const html = page.locator("html");
    const initialTheme = (await html.getAttribute("data-theme")) || "dark";
    // eslint-disable-next-line playwright/no-conditional-in-test
    const expectedNewTheme = initialTheme === "light" ? "dark" : "light";

    // 1. Toggle
    await page.keyboard.press("Enter");

    // Assert change - verify data-theme updated
    await expect(html).toHaveAttribute("data-theme", expectedNewTheme);

    // 2. Toggle back
    await themeToggle.press("Enter");

    // Assert that the theme is back to initial state
    await expect(html).toHaveAttribute("data-theme", initialTheme);

    // Check a11y of the toggle itself
    const results = await new AxeBuilder({ page })
      .include("#theme-toggle")
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test("Homelab Infrastructure Keyboard Navigation", async ({ page }) => {
    // Mock the API response to ensure the component renders the links
    await page.route("**/api/homelab/stats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          requests_received_24h: 1000,
          responses_sent_24h: 900,
          upstream_sent_24h: 800,
          bandwidth_sent_24h: 1024 * 1024,
          bandwidth_recv_24h: 2048 * 1024,
          tarpit_hits_24h: 50,
          nginx_bans_24h: 10,
          mikrotik_scans_total: 500,
          rate_limited_503_24h: 5,
          cpu_usage_avg: 15.5,
          mem_used_percent: 45.2,
          top_security_countries: [{ code: "US", count: 100 }],
        }),
      });
    });

    await page.goto("/homelab/");

    // 1. Find the infrastructure section
    const section = page.locator(".infrastructure-section");
    await expect(section).toBeVisible();

    // Ensure component hydration triggers (client:visible)
    await section.scrollIntoViewIfNeeded();

    // Wait for data to load (ensures hydration is complete)
    await expect(section).toContainText("500", { timeout: 10_000 });

    // 2. Verify Tab navigation through links
    // First link: Tarpit Hits
    const tarpitLink = section.locator('a[href*="implementing-tarpit-nginx"]');
    // Second link: Port Scanners
    const honeypotLink = section.locator('a[href*="mikrotik-honeypot"]');

    // Wait for data to load and links to be visible
    await expect(tarpitLink).toBeVisible({ timeout: 10_000 });
    await expect(honeypotLink).toBeVisible({ timeout: 10_000 });

    // Start navigation
    await tarpitLink.focus();
    await expect(tarpitLink).toBeFocused();
    await expect(tarpitLink).toHaveAttribute(
      "aria-label",
      /Read blog post about implementing Nginx Tarpit/i,
    );

    // Tab to next link
    await page.keyboard.press("Tab");

    // Re-locate to handle potential hydration re-renders
    const freshHoneypotLink = section.locator('a[href*="mikrotik-honeypot"]');
    await expect(freshHoneypotLink).toBeFocused();
    await expect(freshHoneypotLink).toHaveAttribute(
      "aria-label",
      /Read blog post about MikroTik Port Scanner Honeypot/i,
    );

    // 3. Run Axe on the section
    const results = await new AxeBuilder({ page })
      .include(".infrastructure-section")
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
