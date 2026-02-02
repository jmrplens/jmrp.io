import { expect, test } from "@playwright/test";

test.describe("Tabs & Code Block Accessibility", () => {
  test("Tabs (Zero-JS Radio Group) Keyboard Navigation", async ({ page }) => {
    // Navigate to a post with Tabs (001 has tabs for OS selection)
    await page.goto("/blog/001-secure-nginx-client-certificates");
    // Ensure styles/scripts are loaded by waiting for the component
    const tabsContainer = page.locator(".tabs-container").first();
    await tabsContainer.waitFor({ state: "visible" });

    // Locate the labels (which act as tabs) and inputs
    const inputs = tabsContainer.locator("input[type='radio']");
    const panels = tabsContainer.locator(".tab-panel");

    // 1. Initial State: First tab selected
    await expect(inputs.nth(0)).toBeChecked();
    await expect(panels.nth(0)).toBeVisible();
    await expect(panels.nth(1)).toBeHidden();

    // 2. Focus the first label (the group)
    // The radio input is visually hidden (via clip-path) but remains focusable.
    // Keyboard navigation focuses the input, not the label, so we focus it directly here.
    await inputs.nth(0).focus();
    await expect(inputs.nth(0)).toBeFocused();

    // 3. Arrow Right -> Selects Next Tab (Standard Radio behavior)
    await page.keyboard.press("ArrowRight");

    // Verify 2nd input is checked
    await expect(inputs.nth(1)).toBeChecked();

    // Verify 2nd panel is visible, 1st is hidden
    await expect(panels.nth(1)).toBeVisible();
    await expect(panels.nth(0)).toBeHidden();

    // 4. Arrow Left -> Back to First Tab
    await page.keyboard.press("ArrowLeft");
    await expect(inputs.nth(0)).toBeChecked();
    await expect(panels.nth(0)).toBeVisible();
  });

  test("FileContent Focus Navigation (No Ghost Focus)", async ({ page }) => {
    // Navigate to a post with FileContent
    await page.goto("/blog/001-secure-nginx-client-certificates");
    await page.waitForLoadState("domcontentloaded");

    // Find a FileContent block
    const fileContent = page.locator(".file-content-wrapper").first();
    await expect(fileContent).toBeVisible();

    const copyBtn = fileContent.locator(".copy-button");
    const codeContainer = fileContent.locator(".file-code-container");

    // 1. Focus the Copy Button
    await copyBtn.focus();
    await expect(copyBtn).toBeFocused();

    // 2. Tab -> Should land on Code Container
    await page.keyboard.press("Tab");
    await expect(codeContainer).toBeFocused();

    // 3. Tab -> Should leave the component (Next element)
    await page.keyboard.press("Tab");

    // Verify we are NOT focused on the code container anymore
    await expect(codeContainer).not.toBeFocused();
    // And NOT focused on the copy button
    await expect(copyBtn).not.toBeFocused();

    // Verify we didn't land on some internal ghost element
    // The next element should be distinct.
    // We can check that the active element is NOT inside the fileContent wrapper
    const focusMovedOut = await fileContent.evaluate((wrapper) => {
      return !wrapper.contains(document.activeElement);
    });

    expect(
      focusMovedOut,
      "Focus should have moved out of FileContent wrapper",
    ).toBe(true);
  });
});
