/**
 * Integration Test Suite
 *
 * Tests user flows and page interactions across the site:
 * - Navigation flows (Home → Blog → Post)
 * - Page content verification (CV sections, Services)
 * - Component rendering (GitHub repos, Publications)
 * - Cross-page functionality
 */

import { expect, test } from "@playwright/test";

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

  test("GitHub page renders repository cards", async ({ page }) => {
    await page.goto("/github");

    // Verify page title
    await expect(page.locator("h1")).toBeVisible();

    // Check that repo cards are rendered
    const repoCards = page.locator(".repo-card");
    // Wait for the first card to appear (auto-retrying) to avoid race conditions with JS fetch
    await repoCards.first().waitFor({ state: "visible" });

    const cardCount = await repoCards.count();
    expect(cardCount).toBeGreaterThan(0);

    // Verify first card has expected structure
    const firstCard = repoCards.first();
    await expect(firstCard.locator("h3, h4")).toBeVisible(); // Repo name
    await expect(firstCard.locator("a")).toHaveAttribute("href", /.+/); // Link to repo

    // Verify search input exists
    const searchInput = page.getByRole("textbox", {
      name: /search/i,
    });
    await expect(searchInput).toBeVisible();
  });

  test("Publications page renders publication cards", async ({ page }) => {
    await page.goto("/publications");

    // Verify page title
    await expect(page.locator("h1")).toBeVisible();

    // Check that publication items exist
    const publications = page.locator(
      "article, .publication-item, [itemtype*='Article']",
    );
    // Wait for content to load
    await publications.first().waitFor({ state: "visible" });
    const pubCount = await publications.count();
    expect(pubCount).toBeGreaterThan(0);

    // Check for BibTeX toggle functionality
    const bibtexToggle = page.locator(".btn-bibtex-toggle").first();
    // eslint-disable-next-line playwright/no-conditional-in-test
    if ((await bibtexToggle.count()) > 0) {
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(bibtexToggle).toBeVisible();

      // Verify ARIA attributes for accordion
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(bibtexToggle).toHaveAttribute(
        "aria-expanded",
        /^(true|false)$/,
      );
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(bibtexToggle).toHaveAttribute("aria-controls", /.+/);
    }
  });

  test("Blog post opens and displays content", async ({ page }) => {
    // Navigate to blog index
    await page.goto("/blog");

    // Find first blog post link (the title link inside article)
    const postLinks = page
      .locator("article a[href*='/blog/'][href$='/']")
      .or(page.locator("article h2 a, article h3 a"));

    // Wait for content to load
    await postLinks.first().waitFor();
    const postCount = await postLinks.count();
    expect(postCount).toBeGreaterThan(0);

    // Verify link has href and click to navigate
    await expect(postLinks.first()).toHaveAttribute("href", /.+/);
    await postLinks.first().click();

    // Verify we're on the post page
    await expect(page).toHaveURL(/\/blog\/.+/);

    // Verify post has expected structure
    await expect(page.locator("h1")).toBeVisible(); // Post title
    await expect(page.locator("main").first()).toBeVisible(); // Main content

    // Verify reading time or date is shown (common blog elements)
    // Verify reading time or date is shown (common blog elements)
    const metadata = page.locator(
      "[class*='date'], [class*='reading'], time, .post-meta",
    );
    await expect(metadata.first()).toBeVisible();
  });
});
