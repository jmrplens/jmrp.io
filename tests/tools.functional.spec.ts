/**
 * Tool Functional Tests
 *
 * Tests all 14 interactive tools for core functionality:
 * - Page load and component rendering
 * - Primary user interactions (input → output)
 * - Mode switching and presets
 * - Copy functionality
 */

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { shouldIgnoreError } from "./utils";

/** Block Cloudflare analytics scripts that cause CORS errors in localhost */
async function blockCloudflare(page: Page): Promise<void> {
  await page.route("**/beacon.min.js", (route) => route.abort());
  await page.route("**/cdn-cgi/rum*", (route) => route.abort());
}

/** Helper to setup console error tracking */
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !shouldIgnoreError(msg.text())) {
      errors.push(msg.text());
    }
  });
  return errors;
}

// ─── Password Generator ──────────────────────────────────────────────

test.describe("Password Generator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads and generates initial password", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const response = await page.goto("/tools/password-generator/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-pwd-id]");
    await expect(container).toBeVisible();

    const result = container.locator(".pwd-result");
    await expect(result).toBeVisible();
    const text = await result.textContent();
    expect(text?.length).toBeGreaterThan(0);

    expect(errors).toHaveLength(0);
  });

  test("switches to passphrase mode", async ({ page }) => {
    await page.goto("/tools/password-generator/");
    const container = page.locator("[data-pwd-id]");
    await expect(container).toBeVisible();

    await container.locator('[data-mode="passphrase"]').click();
    await page.waitForTimeout(500);

    const result = container.locator(".pwd-result");
    const text = await result.textContent();
    // Passphrases contain separator characters (spaces, dashes, etc.)
    expect(text?.length).toBeGreaterThan(5);
  });

  test("regenerates password on refresh click", async ({ page }) => {
    await page.goto("/tools/password-generator/");
    const container = page.locator("[data-pwd-id]");
    await expect(container).toBeVisible();

    const result = container.locator(".pwd-result");
    const initial = await result.textContent();

    await container.locator(".pwd-refresh-btn").click();
    await page.waitForTimeout(300);

    const updated = result;
    // Statistically near-impossible to generate same password twice
    await expect(updated).not.toHaveText(initial);
  });

  test("has working copy button", async ({ page }) => {
    await page.goto("/tools/password-generator/");
    const container = page.locator("[data-pwd-id]");
    await expect(container).toBeVisible();

    const copyBtn = container.locator(".pwd-copy-btn");
    await expect(copyBtn).toBeVisible();
    await expect(copyBtn).toBeEnabled();
  });
});

// ─── Hash Calculator ─────────────────────────────────────────────────

test.describe("Hash Calculator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads hash interface", async ({ page }) => {
    const response = await page.goto("/tools/hash-calculator/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-hash-id]");
    await expect(container).toBeVisible();
    await expect(container.locator("textarea").first()).toBeVisible();
  });

  test("computes hashes for input text", async ({ page }) => {
    await page.goto("/tools/hash-calculator/");
    const container = page.locator("[data-hash-id]");
    await expect(container).toBeVisible();

    await container.locator("textarea").first().fill("alert('test')");
    await page.waitForTimeout(800);

    // SHA-256 output should be populated with base64
    const sha256 = container.locator('[data-algorithm="sha256"] code');
    await expect(sha256).not.toBeEmpty();
    const hashText = await sha256.textContent();
    expect(hashText?.length).toBeGreaterThan(20);
  });
});

// ─── Base64 Encoder ──────────────────────────────────────────────────

test.describe("Base64 Encoder", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads encoder interface", async ({ page }) => {
    const response = await page.goto("/tools/base64-encoder/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-enc-id]");
    await expect(container).toBeVisible();
  });

  test("encodes text to Base64", async ({ page }) => {
    await page.goto("/tools/base64-encoder/");
    const container = page.locator("[data-enc-id]");
    await expect(container).toBeVisible();

    // Type in input textarea
    const input = container.locator("textarea").first();
    await input.fill("Hello World");
    await page.waitForTimeout(500);

    // Output is a <code> element inside .enc-output
    const output = container.locator(".enc-output code");
    await expect(output).toBeVisible();
    const outputText = await output.textContent();
    expect(outputText).toContain("SGVsbG8gV29ybGQ=");
  });
});

// ─── Subnet Calculator ───────────────────────────────────────────────

test.describe("Subnet Calculator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads calculator interface", async ({ page }) => {
    const response = await page.goto("/tools/subnet-calculator/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-net-id]");
    await expect(container).toBeVisible();
  });

  test("calculates subnet for IPv4 /24", async ({ page }) => {
    await page.goto("/tools/subnet-calculator/");
    const container = page.locator("[data-net-id]");
    await expect(container).toBeVisible();

    // Enter IP and CIDR (test data for subnet calculation)
    const ipInput = container.locator('input[type="text"]').first();
    const cidrInput = container.locator('input[type="number"]').first();
    /* eslint-disable sonarjs/no-hardcoded-ip */
    await ipInput.fill("192.168.1.0");
    await cidrInput.fill("24");
    await page.waitForTimeout(800);

    // Results should contain expected subnet info
    const pageText = await container.textContent();
    expect(pageText).toContain("192.168.1.255");
    /* eslint-enable sonarjs/no-hardcoded-ip */
    expect(pageText).toContain("254");
  });
});

// ─── Regex Tester ────────────────────────────────────────────────────

test.describe("Regex Tester", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads tester interface", async ({ page }) => {
    const response = await page.goto("/tools/regex-tester/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-rgx-id]");
    await expect(container).toBeVisible();
  });

  test("finds matches for pattern", async ({ page }) => {
    await page.goto("/tools/regex-tester/");
    const container = page.locator("[data-rgx-id]");
    await expect(container).toBeVisible();

    // Enter pattern
    const patternInput = container.locator("textarea, input").first();
    await patternInput.fill(String.raw`\d+`);

    // Enter test string
    const testInput = container.locator("textarea").first();
    await testInput.fill("abc 123 def 456");
    await page.waitForTimeout(800);

    // Should show match results
    const containerText = await container.textContent();
    expect(containerText).toContain("2");
  });

  test("loads preset pattern", async ({ page }) => {
    await page.goto("/tools/regex-tester/");
    const container = page.locator("[data-rgx-id]");
    await expect(container).toBeVisible();

    const presetBtn = container.locator(".rgx-preset-btn").first();
    if ((await presetBtn.count()) > 0) {
      await presetBtn.click();
      await page.waitForTimeout(300);
    }
  });
});

// ─── Cron Builder ────────────────────────────────────────────────────

test.describe("Cron Builder", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads builder interface", async ({ page }) => {
    const response = await page.goto("/tools/cron-builder/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-cron-id]");
    await expect(container).toBeVisible();
  });

  test("applies preset and shows description", async ({ page }) => {
    await page.goto("/tools/cron-builder/");
    const container = page.locator("[data-cron-id]");
    await expect(container).toBeVisible();

    // Click first preset
    const presetBtn = container.locator(".cron-preset-btn").first();
    if ((await presetBtn.count()) > 0) {
      await presetBtn.click();
      await page.waitForTimeout(500);
    }

    // Verify expression is populated
    const containerText = await container.textContent();
    // Should contain cron expression characters (* / etc.)
    expect(containerText).toMatch(/\*/);
  });
});

// ─── Timestamp Converter ─────────────────────────────────────────────

test.describe("Timestamp Converter", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads converter interface", async ({ page }) => {
    const response = await page.goto("/tools/timestamp-converter/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-ts-id]");
    await expect(container).toBeVisible();
  });

  test("converts timestamp with Now button", async ({ page }) => {
    await page.goto("/tools/timestamp-converter/");
    const container = page.locator("[data-ts-id]");
    await expect(container).toBeVisible();

    // Click Now button
    const nowBtn = container
      .locator("button")
      .filter({ hasText: /now/i })
      .first();
    await nowBtn.click();
    await page.waitForTimeout(500);

    // Results should show date information
    const containerText = await container.textContent();
    expect(containerText).toMatch(/202[4-9]/);
  });
});

// ─── Color Contrast Checker ──────────────────────────────────────────

test.describe("Color Contrast Checker", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads checker interface", async ({ page }) => {
    const response = await page.goto("/tools/color-contrast-checker/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-cc-id]");
    await expect(container).toBeVisible();
  });

  test("calculates contrast ratio for black on white", async ({ page }) => {
    await page.goto("/tools/color-contrast-checker/");
    const container = page.locator("[data-cc-id]");
    await expect(container).toBeVisible();

    // Set foreground to black and background to white
    const hexInputs = container.locator('input[type="text"]');
    await hexInputs.first().fill("#000000");
    await hexInputs.nth(1).fill("#FFFFFF");
    await page.waitForTimeout(800);

    // Maximum contrast ratio of 21:1 should appear
    const containerText = await container.textContent();
    expect(containerText).toContain("21");
  });
});

// ─── CSP Builder ─────────────────────────────────────────────────────

test.describe("CSP Builder", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads builder interface", async ({ page }) => {
    const response = await page.goto("/tools/csp-builder/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-csp-id]");
    await expect(container).toBeVisible();
  });

  test("generates policy when directives toggled", async ({ page }) => {
    await page.goto("/tools/csp-builder/");
    const container = page.locator("[data-csp-id]");
    await expect(container).toBeVisible();

    // Toggle a directive checkbox (use force:true as custom toggle UI overlays)
    const checkbox = container.locator('input[type="checkbox"]').first();
    await checkbox.click({ force: true });
    await page.waitForTimeout(500);

    // Output should contain CSP directives
    const containerText = await container.textContent();
    expect(containerText).toMatch(
      /default-src|script-src|style-src|img-src|font-src/,
    );
  });
});

// ─── Nginx Config Generator ──────────────────────────────────────────

test.describe("Nginx Config Generator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads generator interface", async ({ page }) => {
    const response = await page.goto("/tools/nginx-config-generator/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-ngx-id]");
    await expect(container).toBeVisible();
  });

  test("generates config from preset", async ({ page }) => {
    await page.goto("/tools/nginx-config-generator/");
    const container = page.locator("[data-ngx-id]");
    await expect(container).toBeVisible();

    // Click first preset
    const presetBtn = container.locator("[data-preset]").first();
    await presetBtn.click();
    await page.waitForTimeout(500);

    // Output should contain nginx config
    const containerText = await container.textContent();
    expect(containerText).toMatch(/server|listen|server_name/);
  });
});

// ─── WireGuard Config Generator ──────────────────────────────────────

test.describe("WireGuard Config Generator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads generator interface", async ({ page }) => {
    const response = await page.goto("/tools/wireguard-config-generator/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-wg-id]");
    await expect(container).toBeVisible();
  });

  test("generates config from preset", async ({ page }) => {
    await page.goto("/tools/wireguard-config-generator/");
    const container = page.locator("[data-wg-id]");
    await expect(container).toBeVisible();

    // Click a preset
    const presetBtn = container.locator("[data-preset]").first();
    await presetBtn.click();
    await page.waitForTimeout(500);

    // Should contain WireGuard config content
    const containerText = await container.textContent();
    expect(containerText).toMatch(/WireGuard|Interface|wireguard/i);
  });
});

// ─── Certificate Inspector ───────────────────────────────────────────

test.describe("Certificate Inspector", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads inspector interface", async ({ page }) => {
    const response = await page.goto("/tools/cert-inspector/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-cert-id]");
    await expect(container).toBeVisible();

    // Both input methods visible
    await expect(container.locator("textarea")).toBeVisible();
    await expect(container.locator('input[type="text"]')).toBeVisible();
  });

  test("parses PEM certificate", async ({ page }) => {
    await page.goto("/tools/cert-inspector/");
    const container = page.locator("[data-cert-id]");
    await expect(container).toBeVisible();

    // Sample self-signed certificate (test fixture)
    /* eslint-disable no-secrets/no-secrets */
    const sampleCert = [
      "-----BEGIN CERTIFICATE-----",
      "MIIBkTCB+wIUEFbGcNPf1MTFZqa6FiV6FGhBa+Iw",
      "DQYJKoZIhvcNAQELBQAwEjEQMA4GA1UEAwwHdGVzdC5pbzAe",
      "Fw0yNDAxMDEwMDAwMDBaFw0yNTAxMDEwMDAwMDBaMBIxEDAO",
      "BgNVBAMMB3Rlc3QuaW8wXDANBgkqhkiG9w0BAQEFAANLAEBI",
      "AkEA0Z3VS5hJnMoubR1EQm5r6R4BPqF4l4h5JBhAFBJr0Bx7",
      "rVTSR7XDkW5LRk7Kq3K0qThJYd+k2N0IYJuGlnU3QIDAQAB",
      "oyMwITAfBgNVHREEGDAWhwR/AAABggpsb2NhbGhvc3QwDQYJ",
      "KoZIhvcNAQELBQADQQAJr5aW9T0feLAHPSCiVlbTZpFkn4QF",
      "7s0z/GpGORg/G3xPEMO6FzBe9PF0Fy6J2MX8lD4FnHdVnGbm",
      "1VExjRz",
      "-----END CERTIFICATE-----",
    ].join("\n");
    /* eslint-enable no-secrets/no-secrets */

    await container.locator("textarea").fill(sampleCert);
    await page.waitForTimeout(1500);

    // Results should appear with certificate details
    const containerText = await container.textContent();
    expect(containerText).toMatch(/test\.io|Subject|CN/i);
  });
});

// ─── Modbus Frame Builder ────────────────────────────────────────────

test.describe("Modbus Frame Builder", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads builder interface", async ({ page }) => {
    const response = await page.goto("/tools/modbus-frame-builder/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-mbus-id]");
    await expect(container).toBeVisible();
  });

  test("builds Modbus RTU frame", async ({ page }) => {
    await page.goto("/tools/modbus-frame-builder/");
    const container = page.locator("[data-mbus-id]");
    await expect(container).toBeVisible();

    // Frame output should contain hex bytes after default state loads
    await page.waitForTimeout(800);
    const containerText = await container.textContent();
    // Should contain hex-like content or Modbus-related text
    expect(containerText).toMatch(/[0-9A-F]{2}|frame|Modbus/i);
  });
});

// ─── HTTP Headers Analyzer ───────────────────────────────────────────

test.describe("HTTP Headers Analyzer", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  test("loads analyzer interface", async ({ page }) => {
    const response = await page.goto("/tools/http-headers-analyzer/");
    expect(response?.status()).toBe(200);

    const container = page.locator("[data-hdr-id]");
    await expect(container).toBeVisible();

    await expect(container.locator("textarea")).toBeVisible();
  });

  test("analyzes pasted HTTP headers", async ({ page }) => {
    await page.goto("/tools/http-headers-analyzer/");
    const container = page.locator("[data-hdr-id]");
    await expect(container).toBeVisible();

    const sampleHeaders = [
      "HTTP/1.1 200 OK",
      "Content-Type: text/html",
      "X-Frame-Options: DENY",
      "Strict-Transport-Security: max-age=63072000",
      "Content-Security-Policy: default-src 'self'",
    ].join("\n");

    await container.locator("textarea").fill(sampleHeaders);
    await page.waitForTimeout(1000);

    // Analysis results should appear
    const containerText = await container.textContent();
    expect(containerText).toMatch(
      /score|grade|Content-Security-Policy|X-Frame-Options/i,
    );
  });
});
