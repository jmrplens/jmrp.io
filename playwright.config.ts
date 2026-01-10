import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : "list",

  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "functional",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /functional\.spec\.ts|integration\.spec\.ts|seo\.spec\.ts/,
    },
    {
      name: "mobile-functional",
      use: { ...devices["Pixel 5"] },
      testMatch: /functional\.spec\.ts/, // Integration tests might need specific mobile adjustments, starting with functional
    },
    {
      name: "accessibility",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /accessibility\.spec\.ts/,
      timeout: 60_000, // 60 seconds per test for accessibility scanning
    },
  ],

  webServer: {
    command: "pnpm astro preview",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
