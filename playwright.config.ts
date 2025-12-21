import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: process.env.CI ? "html" : "list",

    use: {
        baseURL: "http://localhost:4321",
        trace: "on-first-retry",
        screenshot: "only-on-failure",
    },

    projects: [
        {
            name: "accessibility",
            use: { ...devices["Desktop Chrome"] },
            testMatch: /accessibility\.spec\.ts/,
        },
    ],

    webServer: {
        command: "pnpm astro preview",
        url: "http://localhost:4321",
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});
