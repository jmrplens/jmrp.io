import fs from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// Load .env before anything reads process.env.
//
// `pnpm verify` loads it (scripts/run-verify.mjs) before spawning the suite,
// but a bare `pnpm test:e2e` — a documented command — does not, and this
// config only forwards process.env to the web server. Without this, the
// security spec's POSTBUILD_NGINX_SNIPPETS_DIR lookup would find nothing on
// the server after a successful deploy (staging is empty because deploy-live
// moved the snippets out of it) and all three CSP tests would fail for the
// wrong reason. loadEnvFile never overwrites an already-set variable, so the
// precedence stays shell > .env.
try {
  if (fs.existsSync(".env")) {
    process.loadEnvFile(".env");
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[Playwright] Warning: failed to load .env: ${message}`);
}

// Preview-server port. Overridable via PW_PORT so test runs can dodge an
// unrelated server already bound to 4321 on this shared host (with
// reuseExistingServer enabled, Playwright would otherwise silently test
// whatever site that foreign server is serving).
const PORT = process.env.PW_PORT ?? "4321";

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
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },

  projects: [
    {
      name: "functional",
      use: { ...devices["Desktop Chrome"] },
      testMatch: [
        /functional\.spec\.ts/,
        /integration\.spec\.ts/,
        /seo\.spec\.ts/,
        /prerender\.spec\.ts/,
        /security\.spec\.ts/,
        /icons\.spec\.ts/,
        /i18n\.spec\.ts/,
        /tools\.functional\.spec\.ts/,
        /schema-validation\.spec\.ts/,
        /content-integrity\.spec\.ts/,
        /ui-components\.spec\.ts/,
        /edge-cases\.spec\.ts/,
      ],
    },
    {
      name: "performance",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(^|\/)performance\.spec\.ts/,
      timeout: 60_000,
      retries: process.env.CI ? 2 : 1,
    },
    {
      name: "mobile-functional",
      use: { ...devices["Pixel 5"] },
      // Anchored regex no longer matches tools.functional.spec.ts (the old
      // unanchored /functional\.spec\.ts/ did), so it's listed explicitly to
      // keep tools running on mobile too.
      testMatch: [
        /(^|\/)functional\.spec\.ts/,
        /(^|\/)tools\.functional\.spec\.ts/,
      ],
    },
    {
      name: "accessibility",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /(^|\/)accessibility\.spec\.ts/,
      // 90s. This budget has been raised twice, both times for the same
      // reason: a full axe-core scan of the heaviest posts is slow, and the
      // margin that looks generous when the machine is idle disappears once
      // the whole suite runs in parallel.
      //
      // 30s → 60s: the longest posts took ~29s alone, leaving no headroom.
      // 60s → 90s: post 003 (7.2k words, Mermaid diagrams and two interactive
      // apps — the heaviest page on the site) takes ~36s in isolation but
      // exceeded 60s under full-suite contention, in both locales.
      //
      // Raising the ceiling rather than excluding the page: 003 is exactly the
      // kind of page where an accessibility regression would matter most, so
      // the fix is to let the scan finish, not to stop scanning it.
      timeout: 90_000,
    },
    {
      name: "a11y-static",
      use: { ...devices["Desktop Chrome"] },
      testMatch: [
        /deep\.accessibility\.spec\.ts/,
        /keyboard\.accessibility\.spec\.ts/,
        /tabs\.accessibility\.spec\.ts/,
      ],
      timeout: 30_000,
    },
  ],

  webServer: {
    command: `pnpm astro preview --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      ...(process.env as Record<string, string>),
      // Astro 7.2 auto-daemonizes dev/preview when it detects an AI-agent
      // environment; the parent then exits and Playwright reports "Process
      // from config.webServer exited early". Force foreground mode.
      ASTRO_PREVIEW_BACKGROUND: "0",
    },
  },
});
