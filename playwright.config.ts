import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [
        ["html", { open: "never" }],
        ["list"],
        ["json", { outputFile: "playwright-report/results.json" }],
      ]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "functional",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        /functional\.spec\.ts|integration\.spec\.ts|seo\.spec\.ts|prerender\.spec\.ts|security\.spec\.ts|icons\.spec\.ts|i18n\.spec\.ts|tools\.functional\.spec\.ts|schema-validation\.spec\.ts|content-integrity\.spec\.ts|ui-components\.spec\.ts|edge-cases\.spec\.ts/,
    },
    {
      name: "mobile-functional",
      use: { ...devices["Pixel 5"] },
      testMatch: /functional\.spec\.ts/,
    },
    {
      name: "accessibility",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /accessibility\.spec\.ts/,
      timeout: 30_000,
    },
  ],

  webServer: {
    command: "pnpm astro preview",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
