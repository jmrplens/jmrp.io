import { test, expect } from "@playwright/test";

test.describe("Integration Flows", () => {
  test("Navigation from Home to Blog and check posts", async ({ page }) => {
    // 1. Go to Home
    await page.goto("/");
    await expect(page).toHaveTitle(/José Manuel Requena Plens/);

    // 2. Click on Blog link in Header
    // Assuming the header link is visible.
    await page.getByRole("link", { name: "Blog", exact: true }).click();

    // 3. Verify URL is /blog or /blog/
    await expect(page).toHaveURL(/\/blog\/?/);

    // 4. Check that at least one blog post is listed
    // Assuming blog posts are articles or have a specific class.
    // Based on common Astro patterns or previous observation (though I didn't see blog index code, checking list items is safe)
    // or looking for h2/h3 titles.
    const posts = page.locator("article");
    await expect(posts.first()).toBeVisible();
  });

  test("CV Page sections content", async ({ page }) => {
    await page.goto("/cv");

    // Check key sections from cv.astro
    await expect(page.locator("h1")).toHaveText("Curriculum Vitae");

    // Check Table of Contents
    const toc = page.locator(".cv-toc");
    await expect(toc).toBeVisible();
    await expect(toc.getByRole("link", { name: "Experience" })).toBeVisible();

    // Check Experience Section
    const experienceSection = page.locator("#experience");
    await expect(experienceSection).toBeVisible();
    await expect(experienceSection.locator("h2")).toHaveText("Experience");

    // Check Skills Section
    const skillsSection = page.locator("#technical-skills");
    await expect(skillsSection).toBeVisible();
  });

  test("Services page loads", async ({ page }) => {
    await page.goto("/services");
    await expect(page.locator("h1")).toContainText("Services");
  });
});
