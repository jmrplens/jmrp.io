import { test, expect } from "@playwright/test";

test.describe("Core Functionality", () => {
  test("homepage has correct title and metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/José Manuel Requena Plens/);

    // Check for critical elements
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("footer")).toBeVisible();
    await expect(page.locator("h1")).toContainText("José Manuel");
  });

  test("theme toggle works", async ({ page }) => {
    await page.goto("/");

    const html = page.locator("html");
    const toggle = page.locator("#theme-toggle");

    // Check initial state (should be consistent with system or default)
    // We can force a state to test toggle
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "light";
      document.documentElement.classList.add("light-mode");
      document.documentElement.classList.remove("dark-mode");
    });

    await expect(html).toHaveAttribute("data-theme", "light");

    // Click toggle
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(html).toHaveClass(/dark-mode/);

    // Click toggle again
    await toggle.click();
    await expect(html).toHaveAttribute("data-theme", "light");
    await expect(html).toHaveClass(/light-mode/);
  });

  test("navigation links work", async ({ page }) => {
    await page.goto("/");

    // Test CV link
    await page.click('nav a[href="/cv"]');
    await expect(page).toHaveURL(/\/cv/);
    await expect(page.locator("h1")).toContainText("Curriculum Vitae");

    // Go back
    await page.goto("/");

    // Test Blog link
    await page.click('nav a[href="/blog"]');
    await expect(page).toHaveURL(/\/blog/);
    await expect(page.locator("h1")).toContainText("Blog");
  });
});
