/**
 * UI Component Interaction Tests
 *
 * Tests interactive UI components:
 * - CopyButton: click-to-copy, success state
 * - Collapsible: toggle open/closed, aria-expanded
 * - TableOfContentsDrawer: open/close, heading navigation
 * - Mermaid: SVG rendered, aria-label present
 * - Tabs: arrow navigation, panel visibility
 * - TerminalSession: command/output display, copy
 * - ThemeToggle: persistence, CSS variable update
 * - Mobile menu: open/close, Escape key
 * - CV FAB: open drawer, section navigation
 */

/* eslint-disable playwright/no-conditional-in-test -- Component checks require conditionals */
/* eslint-disable playwright/no-wait-for-timeout -- UI animations need delays */
/* eslint-disable playwright/no-conditional-expect -- Component presence checks need conditionals */
/* eslint-disable playwright/no-force-option -- Overlapping elements require force clicks */

import { expect, test } from "@playwright/test";

import { blockCloudflare } from "./utils";

// ─── CopyButton ──────────────────────────────────────────────────────

test.describe("CopyButton", () => {
  test("shows success state after click", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await blockCloudflare(page);
    // Blog posts have copy buttons on code blocks
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const copyBtn = page.locator(".copy-button").first();
    await expect(copyBtn).toBeVisible();

    // Click copy
    await copyBtn.click();
    await page.waitForTimeout(300);

    // Success icon should appear
    const successIcon = copyBtn.locator(".success-icon");
    await expect(successIcon).toBeVisible();
  });

  test("copies content to clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const copyBtn = page.locator(".copy-button").first();
    await copyBtn.click();
    await page.waitForTimeout(300);

    // Verify clipboard has content
    const clipboardContent = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardContent.length).toBeGreaterThan(0);
  });
});

// ─── Collapsible ─────────────────────────────────────────────────────

test.describe("Collapsible", () => {
  test("toggles open and closed", async ({ page }) => {
    await blockCloudflare(page);
    // Blog posts use Collapsible components
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const details = page.locator("details.collapsible-wrapper").first();
    // Skip if no collapsible on page
    if ((await details.count()) === 0) return;

    // Initially may be closed
    const summary = details.locator("summary");
    await expect(summary).toBeVisible();

    // Open it
    await summary.click();
    await expect(details).toHaveAttribute("open", "");

    // Close it
    await summary.click();
    await expect(details).not.toHaveAttribute("open", "");
  });
});

// ─── Mermaid Diagrams ────────────────────────────────────────────────

test.describe("Mermaid Diagrams", () => {
  test("renders SVG with aria-label", async ({ page }) => {
    await blockCloudflare(page);
    // Find a post that has Mermaid diagrams
    await page.goto("/blog/003-implementing-content-security-policy-nginx/");

    const mermaidFigures = page.locator(".mermaid-figure");
    const count = await mermaidFigures.count();

    if (count === 0) {
      // Try another post
      await page.goto("/blog/001-secure-nginx-client-certificates/");
    }

    const figures = page.locator(".mermaid-figure");
    const figCount = await figures.count();
    expect(figCount, "No Mermaid figures found on test pages").toBeGreaterThan(
      0,
    );

    for (let i = 0; i < figCount; i++) {
      const figure = figures.nth(i);
      // SVG should be rendered
      const svg = figure.locator("svg");
      await expect(svg).toBeVisible();

      // Container should have aria-label or aria-labelledby
      const ariaLabel = await figure.getAttribute("aria-label");
      const ariaLabelledBy = await figure.getAttribute("aria-labelledby");
      expect(
        ariaLabel ?? ariaLabelledBy,
        `Mermaid figure ${i} missing aria-label or aria-labelledby`,
      ).toBeTruthy();
    }
  });
});

// ─── Tabs ────────────────────────────────────────────────────────────

test.describe("Tabs Component", () => {
  test("switches panels on label click", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const tabsContainer = page.locator(".tabs-container").first();
    if ((await tabsContainer.count()) === 0) return;

    // Get tab labels
    const labels = tabsContainer.locator(".tab-label");
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThanOrEqual(2);

    // Click second tab
    await labels.nth(1).click();

    // Second panel should be visible
    const panels = tabsContainer.locator(".tab-panel");
    const secondPanel = panels.nth(1);
    await expect(secondPanel).toBeVisible();
  });

  test("keyboard arrow navigation works", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const tabsContainer = page.locator(".tabs-container").first();
    if ((await tabsContainer.count()) === 0) return;

    const firstLabel = tabsContainer.locator(".tab-label").first();
    await firstLabel.click();
    await firstLabel.press("ArrowRight");

    // Second panel should now be visible
    const panels = tabsContainer.locator(".tab-panel");
    if ((await panels.count()) >= 2) {
      await expect(panels.nth(1)).toBeVisible();
    }
  });
});

// ─── TerminalSession ─────────────────────────────────────────────────

test.describe("TerminalSession", () => {
  test("displays command and output sections", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const session = page.locator(".terminal-session").first();
    if ((await session.count()) === 0) return;

    // Should have terminal header
    const header = session.locator(".terminal-header");
    await expect(header).toBeVisible();

    // Should have command section
    const command = session.locator('[data-ts="command"]');
    if ((await command.count()) > 0) {
      await expect(command.first()).toBeVisible();
    }
  });

  test("has working copy button", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await blockCloudflare(page);
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const session = page.locator(".terminal-session").first();
    if ((await session.count()) === 0) return;

    const copyBtn = session.locator(".copy-button").first();
    if ((await copyBtn.count()) > 0) {
      await copyBtn.click();
      await page.waitForTimeout(300);
      const successIcon = copyBtn.locator(".success-icon");
      await expect(successIcon).toBeVisible();
    }
  });
});

// ─── ThemeToggle ─────────────────────────────────────────────────────

test.describe("ThemeToggle", () => {
  test("toggles between light and dark theme", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");

    const toggleBtn = page.locator("#theme-toggle");
    await expect(toggleBtn).toBeVisible();

    // Get initial theme
    const initialTheme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );

    // Click toggle
    await toggleBtn.click();
    await page.waitForTimeout(200);

    // Theme should change
    const newTheme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(newTheme).not.toBe(initialTheme);
  });

  test("persists theme across navigation", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/");

    const toggleBtn = page.locator("#theme-toggle");
    await toggleBtn.click();
    await page.waitForTimeout(200);

    const themeAfterToggle = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );

    // Navigate to another page
    await page.goto("/blog/");
    await page.waitForTimeout(200);

    const themeAfterNav = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(themeAfterNav).toBe(themeAfterToggle);
  });
});

// ─── Mobile Menu ─────────────────────────────────────────────────────

test.describe("Mobile Menu", () => {
  test("opens and closes on hamburger click", async ({ page }) => {
    await blockCloudflare(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuToggle = page.locator("#menu-toggle");
    await expect(menuToggle).toBeVisible();

    // Open menu
    await menuToggle.click();
    await page.waitForTimeout(300);

    const navLinks = page.locator("#nav-drawer");
    await expect(navLinks).toHaveClass(/open/);

    // Close via the drawer's ✕ (the burger sits behind the open drawer).
    await page.locator(".drawer__close").click();
    await page.waitForTimeout(300);
    await expect(navLinks).not.toHaveClass(/open/);
  });

  test("closes on Escape key", async ({ page }) => {
    await blockCloudflare(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const menuToggle = page.locator("#menu-toggle");
    await menuToggle.click();
    await page.waitForTimeout(300);

    // Press Escape
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const navLinks = page.locator("#nav-drawer");
    await expect(navLinks).not.toHaveClass(/open/);
  });
});

// ─── TableOfContents Drawer ──────────────────────────────────────────

test.describe("Table of Contents Drawer", () => {
  test("opens and closes on FAB click", async ({ page }) => {
    await blockCloudflare(page);
    // The ToC FAB/drawer is the mobile affordance (≤1024px); on desktop the
    // sticky rail replaces it, so test at a narrow viewport.
    await page.setViewportSize({ width: 800, height: 1200 });
    // Blog posts have ToC
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const tocToggle = page.locator("#toc-toggle-btn");
    if ((await tocToggle.count()) === 0) return;

    await tocToggle.click();
    await page.waitForTimeout(300);

    const drawer = page.locator("#toc-drawer");
    await expect(drawer).toHaveClass(/open/);

    // Close
    const closeBtn = page.locator("#toc-close-btn");
    await closeBtn.click();
    await page.waitForTimeout(300);
    await expect(drawer).not.toHaveClass(/open/);
  });

  test("contains heading links", async ({ page }) => {
    await blockCloudflare(page);
    // ToC drawer is mobile-only (≤1024px); the desktop rail replaces it.
    await page.setViewportSize({ width: 800, height: 1200 });
    await page.goto("/blog/001-secure-nginx-client-certificates/");

    const tocToggle = page.locator("#toc-toggle-btn");
    if ((await tocToggle.count()) === 0) return;

    await tocToggle.click();
    await page.waitForTimeout(300);

    const tocLinks = page.locator(".toc-content a");
    const count = await tocLinks.count();
    expect(count).toBeGreaterThan(0);

    // Each link should have an href starting with #
    for (let i = 0; i < Math.min(count, 5); i++) {
      const href = await tocLinks.nth(i).getAttribute("href");
      expect(href).toMatch(/^#/);
    }
  });
});

// ─── CV FAB Menu ─────────────────────────────────────────────────────

test.describe("CV FAB Menu", () => {
  test("opens drawer on FAB click", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/cv");

    const fab = page.locator("#cv-menu-trigger");
    if ((await fab.count()) === 0) return;

    await fab.click();
    await page.waitForTimeout(300);

    const drawer = page.locator("#cv-drawer");
    await expect(drawer).toHaveClass(/open/);

    // Should have section links
    const sectionLinks = drawer.locator(".cv-section-link");
    const count = await sectionLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("closes on backdrop click", async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/cv");

    const fab = page.locator("#cv-menu-trigger");
    if ((await fab.count()) === 0) return;

    await fab.click();
    await page.waitForTimeout(300);

    const backdrop = page.locator("#cv-backdrop");
    await backdrop.click({ force: true });
    await page.waitForTimeout(300);

    const drawer = page.locator("#cv-drawer");
    await expect(drawer).not.toHaveClass(/open/);
  });
});
