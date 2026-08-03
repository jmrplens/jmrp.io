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
    await page.locator("body").focus();

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
    await page.locator("body").focus();

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

    // The burger is a <label> for the #nav-open checkbox (zero-JS base); the
    // checkbox is the focusable control. The drawer itself is #nav-drawer.
    const menuToggle = page.locator("#menu-toggle");
    const checkbox = page.locator("#nav-open");
    const drawer = page.locator("#nav-drawer");
    await expect(menuToggle).toBeVisible();

    // 1. Open by activating the burger (toggles the checkbox → JS enhances).
    await menuToggle.click();
    await expect(drawer).toHaveClass(/open/);
    await expect(page.locator("body")).toHaveClass(/menu-open/);

    // 2. Snapshot the open drawer with Axe.
    const results = await new AxeBuilder({ page })
      .include("#nav-drawer")
      .analyze();
    expect(results.violations).toEqual([]);

    // 3. Focus should have moved into the drawer (focus management).
    const focusInDrawer = await drawer.evaluate((el) =>
      el.contains(document.activeElement),
    );
    expect(focusInDrawer).toBe(true);

    // 4. Close with Escape.
    await page.keyboard.press("Escape");
    await expect(drawer).not.toHaveClass(/open/);

    // 5. Focus returns to the trigger control (the #nav-open checkbox).
    await expect(checkbox).toBeFocused();
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
    // No API mocks and no hydration wait: the homelab metrics ship no
    // client-side JavaScript any more. The components render statically with
    // HLM_* placeholder tokens that NGINX substitutes at serve time (see
    // src/components/homelab/ssr-tokens.ts) — `astro preview` has no nginx,
    // so this test sees the raw tokens, and every link it exercises is plain
    // server-rendered markup available immediately.
    await page.goto("/homelab/");

    // 1. Find the infrastructure section (first one is InfrastructureInsights/Nginx)
    const section = page.locator(".infrastructure-section").first();
    await expect(section).toBeVisible();
    await section.scrollIntoViewIfNeeded();

    // 2. Verify the section's blog links are keyboard-focusable and named.
    // The in-column "Port Scanners" row was removed (it duplicated Honeypot
    // hits), so the honeypot post is now linked from the explainer row
    // (.edge-links); the tarpit post stays linked in-column (.edge-col).
    const tarpitLink = section.locator(
      '.edge-col a[href*="implementing-tarpit-nginx"]',
    );
    const honeypotLink = section.locator(
      '.edge-links a[href*="mikrotik-honeypot"]',
    );

    // Wait for data to load and links to be visible
    await expect(tarpitLink).toBeVisible({ timeout: 10_000 });
    await expect(honeypotLink).toBeVisible({ timeout: 10_000 });

    // Each link is focusable and carries a descriptive accessible name that
    // satisfies WCAG 2.5.3 Label in Name — the aria-label must contain the
    // visible link text, not replace it with unrelated wording.
    await tarpitLink.focus();
    await expect(tarpitLink).toBeFocused();
    await expect(tarpitLink).toHaveAttribute(
      "aria-label",
      /Read blog post about implementing Nginx Tarpit/i,
    );
    const tarpitVisibleText = (await tarpitLink.innerText()).trim();
    const tarpitAriaLabel = await tarpitLink.getAttribute("aria-label");
    expect(tarpitAriaLabel).toContain(tarpitVisibleText);

    await honeypotLink.focus();
    await expect(honeypotLink).toBeFocused();
    await expect(honeypotLink).toHaveAttribute(
      "aria-label",
      /Read blog post about MikroTik Port Scanner Honeypot/i,
    );
    const honeypotVisibleText = (await honeypotLink.innerText()).trim();
    const honeypotAriaLabel = await honeypotLink.getAttribute("aria-label");
    expect(honeypotAriaLabel).toContain(honeypotVisibleText);

    // The footer explainer row (.edge-links) also carries its own "How the
    // tarpit works" link to the same post — a second, distinct anchor from
    // the in-column one (.edge-col) checked above — and it needs the same
    // label-in-name coverage.
    const tarpitFooterLink = section.locator(
      '.edge-links a[href*="implementing-tarpit-nginx"]',
    );
    await expect(tarpitFooterLink).toBeVisible({ timeout: 10_000 });
    await tarpitFooterLink.focus();
    await expect(tarpitFooterLink).toBeFocused();
    await expect(tarpitFooterLink).toHaveAttribute(
      "aria-label",
      /Read blog post about implementing Nginx Tarpit/i,
    );
    const tarpitFooterVisibleText = (await tarpitFooterLink.innerText()).trim();
    const tarpitFooterAriaLabel =
      await tarpitFooterLink.getAttribute("aria-label");
    expect(tarpitFooterAriaLabel).toContain(tarpitFooterVisibleText);

    // Tab from a link advances focus to another focusable element.
    await tarpitLink.focus();
    await page.keyboard.press("Tab");
    await expect(tarpitLink).not.toBeFocused();

    // 3. Run Axe on the section
    const results = await new AxeBuilder({ page })
      .include(".infrastructure-section:first-of-type")
      .analyze();

    expect(results.violations).toEqual([]);
  });
});
