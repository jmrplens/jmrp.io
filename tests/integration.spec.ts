/**
 * Integration Test Suite
 *
 * Tests user flows and page interactions across the site:
 * - Navigation flows (Home → Blog → Post)
 * - Page content verification (CV sections, Homelab)
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
    await page.getByRole("link", { name: /Blog/ }).first().click();

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

    // Check CV Menu (Floating Action Button)
    const menuTrigger = page.locator("#cv-menu-trigger");
    await expect(menuTrigger).toBeVisible();

    // Open Menu and check for links
    await menuTrigger.click();
    const drawer = page.locator("#cv-drawer");
    await expect(drawer).toBeVisible();
    await expect(
      drawer.getByRole("link", { name: "Experience", exact: true }),
    ).toBeVisible();

    // Close menu to reset state (optional but good practice)
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();

    // Check Experience Section
    const experienceSection = page.locator("#experience");
    await expect(experienceSection).toBeVisible();
    await expect(experienceSection.locator("h2")).toHaveText("Experience");

    // Check Skills Section
    const skillsSection = page.locator("#technical-skills");
    await expect(skillsSection).toBeVisible();
  });

  test("Homelab page loads", async ({ page }) => {
    await page.goto("/homelab");
    await expect(page.locator("h1")).toContainText("Homelab");
    // Verify Homelab-specific content is present
    await expect(page.locator(".infrastructure-section")).toBeVisible();
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
    const searchInput = page.getByRole("searchbox", {
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

    // Check for BibTeX toggle functionality (if present)
    const bibtexToggle = page.locator(".btn-bibtex-toggle").first();
    const bibtexVisible = await bibtexToggle.isVisible();
    /* eslint-disable playwright/no-conditional-in-test, playwright/no-conditional-expect */
    if (bibtexVisible) {
      // Verify ARIA attributes for accordion
      await expect(bibtexToggle).toHaveAttribute(
        "aria-expanded",
        /^(true|false)$/,
      );
      await expect(bibtexToggle).toHaveAttribute("aria-controls", /.+/);
    }
    /* eslint-enable playwright/no-conditional-in-test, playwright/no-conditional-expect */
  });

  test("Blog post opens and displays content", async ({ page }) => {
    // Navigate to blog index
    await page.goto("/blog");

    // Find first blog post link (the title link inside article)
    const postLinks = page
      .locator("article a[href*='/blog/'][href$='/']")
      .or(page.locator("article h2 a, article h3 a"));

    // Wait for content to load with explicit state
    await postLinks.first().waitFor({ state: "visible" });
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
    const metadata = page.locator(
      "[class*='date'], [class*='reading'], time, .post-meta",
    );
    await expect(metadata.first()).toBeVisible();
  });

  test("ES homepage loads and navigates to ES blog", async ({ page }) => {
    // Go to ES homepage
    await page.goto("/es/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    // Click Blog link
    await page.getByRole("link", { name: /Blog/ }).first().click();
    await expect(page).toHaveURL(/\/es\/blog\/?/);

    // Verify at least one blog post is listed
    const posts = page.locator("article");
    await expect(posts.first()).toBeVisible();
  });

  test("Theme persists across language switch", async ({ page }) => {
    await page.goto("/");

    // Set to dark mode
    await page.evaluate(() => {
      localStorage.setItem("theme", "dark");
    });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Navigate to ES version
    await page.goto("/es/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Internal links in ES pages use /es/ prefix", async ({ page }) => {
    await page.goto("/es/blog/");

    // Get all internal links (excluding anchors, external, and special protocols)
    const internalLinks = await page
      .locator(
        'main a[href^="/"]:not([href^="//"]):not([href*="mailto:"]):not([href*="tel:"]):not([href="/rss.xml"])',
      )
      .evaluateAll((links) =>
        links
          .map((l) => l.getAttribute("href"))
          .filter((href): href is string => href !== null),
      );

    // Blog-internal navigation links should use /es/ prefix
    // (skip links that go to /rss.xml, /sitemap, etc.)
    // Filter to navigation links that should have /es/ prefix
    const navLinks = internalLinks.filter(
      (href) =>
        href.startsWith("/blog/") ||
        href.startsWith("/tools/") ||
        href.startsWith("/cv") ||
        href.startsWith("/publications") ||
        href.startsWith("/github") ||
        href.startsWith("/homelab"),
    );

    for (const href of navLinks) {
      expect
        .soft(
          href.startsWith("/es/"),
          `Internal link ${href} should have /es/ prefix in ES pages`,
        )
        .toBe(true);
    }

    expect(test.info().errors).toHaveLength(0);
  });
});
