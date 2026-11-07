/**
 * Tool Functional Tests
 *
 * Tests all 14 interactive tools for core functionality:
 * - Page load and component rendering
 * - Primary user interactions (input → output)
 * - Mode switching and presets
 * - Copy functionality
 */

/* eslint-disable playwright/no-wait-for-timeout -- Tools need delays for async DOM updates */
/* eslint-disable playwright/no-force-option -- Custom toggle overlays require force clicks */
/* eslint-disable playwright/no-conditional-in-test -- Conditional logic needed for dynamic tool UIs */

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { blockCloudflare, shouldIgnoreError } from "./utils";

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
    expect(initial).not.toBeNull();

    await container.locator(".pwd-refresh-btn").click();
    await page.waitForTimeout(300);

    // Statistically near-impossible to generate same password twice
    await expect(result).not.toHaveText(initial as string);
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

    // Results should show date information including the current year
    const containerText = await container.textContent();
    const currentYear = new Date().getFullYear().toString();
    expect(containerText).toContain(currentYear);
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

/**
 * Opens the WireGuard generator with its Advanced section (MTU card) shown.
 * Every field id is `<data-wg-id>-<suffix>`, so `field("mtu")` is the tunnel
 * MTU and never the WAN or client MTU, which an `[id$="-mtu"]` would also hit.
 */
async function openWireGuardAdvanced(page: Page) {
  await page.goto("/tools/wireguard-config-generator/");
  const container = page.locator("[data-wg-id]");
  await expect(container).toBeVisible();
  const id = await container.getAttribute("data-wg-id");
  const field = (suffix: string) => page.locator(`#${id}-${suffix}`);
  await field("advanced").check();
  await expect(field("advanced-section")).toBeVisible();
  return {
    field,
    routeros: field("output-routeros"),
    client: field("output-client"),
  };
}

/** Splits the RouterOS script into its blank-line separated commands. */
async function routerosBlocks(routeros: Locator) {
  const text = (await routeros.textContent()) ?? "";
  const blocks = text.split("\n\n");
  return {
    text,
    block: (command: string) => blocks.find((b) => b.includes(command)) ?? "",
  };
}

const wireGuardMtuCases = [
  {
    name: "a 1500 WAN and a dual-stack endpoint (defaults)",
    wan: "",
    family: "",
    mtu: 1420,
    mssV4: 1380,
    mssV6: 1360,
    comment: "# MTU: WAN 1500 - 80 (IPv6 or dual-stack endpoint) = 1420",
  },
  {
    name: "a 1480 WAN and a dual-stack endpoint",
    wan: "1480",
    family: "",
    mtu: 1400,
    mssV4: 1360,
    mssV6: 1340,
    comment: "# MTU: WAN 1480 - 80 (IPv6 or dual-stack endpoint) = 1400",
  },
  {
    name: "a 1500 WAN and an IPv4-only endpoint",
    wan: "",
    family: "ipv4",
    mtu: 1440,
    mssV4: 1400,
    mssV6: 1380,
    comment: "# MTU: WAN 1500 - 60 (IPv4-only endpoint) = 1440",
  },
];

test.describe("WireGuard Config Generator", () => {
  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
  });

  for (const c of wireGuardMtuCases) {
    test(`derives MTU, MSS and client MTU from ${c.name}`, async ({ page }) => {
      const { field, routeros, client } = await openWireGuardAdvanced(page);
      if (c.wan) await field("wan-mtu").fill(c.wan);
      if (c.family) await field("endpoint-family").selectOption(c.family);

      await expect(field("mtu")).toHaveValue(String(c.mtu));
      await expect(field("client-mtu")).toHaveValue(String(c.mtu));
      await expect(field("mss-v4")).toHaveValue(String(c.mssV4));
      await expect(field("mss-v6")).toHaveValue(String(c.mssV6));

      const { text, block } = await routerosBlocks(routeros);
      const iface = block("/interface wireguard add");
      expect(iface).toContain(c.comment);
      expect(iface).toContain(`\n    mtu=${c.mtu} \\`);

      const clampV4 = block("/ip firewall mangle add");
      expect(clampV4).toContain(`new-mss=${c.mssV4} \\`);
      expect(clampV4).toContain(`tcp-mss=${c.mssV4 + 1}-65535 \\`);
      const clampV6 = block("/ipv6 firewall mangle add");
      expect(clampV6).toContain(`new-mss=${c.mssV6} \\`);
      expect(clampV6).toContain(`tcp-mss=${c.mssV6 + 1}-65535 \\`);
      expect(clampV6).toContain('comment="WireGuard MSS clamping IPv6"');

      expect(text).toContain(
        "# MikroTik RouterOS 7.21 or later; client-mtu needs 7.25 or later",
      );
      expect(text).toContain(`client-mtu=${c.mtu} \\`);
      expect(text).toContain("responder=yes \\");
      expect(text).not.toContain("persistent-keepalive=");

      await expect(client).toContainText(`MTU = ${c.mtu}`);
      await expect(client).toContainText("PersistentKeepalive = 25");
    });
  }

  test("IPv4-only preset emits no IPv6 MSS clamp", async ({ page }) => {
    const { field, routeros } = await openWireGuardAdvanced(page);
    await page.locator('[data-preset="ipv4-only"]').click();

    await expect(field("mss-v6")).toBeHidden();
    await expect(routeros).toContainText("/ip firewall mangle add");
    await expect(routeros).not.toContainText("/ipv6 firewall mangle");
    await expect(routeros).toContainText("responder=yes");
  });

  test("site-to-site preset keeps the router keepalive", async ({ page }) => {
    const { field, routeros } = await openWireGuardAdvanced(page);
    await page.locator('[data-preset="site-to-site"]').click();

    await expect(field("responder")).not.toBeChecked();
    await expect(routeros).toContainText("persistent-keepalive=25s");
    await expect(routeros).not.toContainText("responder=yes");
    // The auto-key peer still emits client-allowed-address (RouterOS 7.21).
    await expect(routeros).toContainText("# MikroTik RouterOS 7.21 or later");
  });

  test("manual-key peers lower the RouterOS minimum", async ({ page }) => {
    const { field, routeros } = await openWireGuardAdvanced(page);
    await page.locator(".wg-peer-keygen").first().selectOption("manual");

    // No client-* block: responder=yes sets the floor at 7.17, and the
    // client-mtu note goes away with the block that would carry it.
    await expect(routeros).toContainText(
      /# MikroTik RouterOS 7\.17 or later\n/,
    );
    await expect(routeros).not.toContainText("client-mtu");

    // Without responder, peer name= (RouterOS 7.15) is the floor.
    await field("responder").uncheck();
    await expect(routeros).toContainText(
      /# MikroTik RouterOS 7\.15 or later\n/,
    );
  });

  test("clearing RouterOS 7.25 drops client-mtu", async ({ page }) => {
    const { field, routeros, client } = await openWireGuardAdvanced(page);
    await expect(routeros).toContainText("client-mtu=1420");

    await field("ros725").uncheck();

    await expect(routeros).not.toContainText("client-mtu");
    await expect(client).toContainText("MTU = 1420");
  });

  test("warns when the tunnel MTU falls below the IPv6 minimum", async ({
    page,
  }) => {
    const { field } = await openWireGuardAdvanced(page);
    const warning = field("mtu-warning");
    await expect(warning).toBeHidden();

    await field("wan-mtu").fill("1300");

    await expect(field("mtu")).toHaveValue("1220");
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Tunnel MTU 1220 is below 1280");

    // The 1280 floor only applies with IPv6 inside the tunnel.
    await field("enable-ipv6").uncheck();
    await expect(warning).toBeHidden();
  });

  test("warns when the tunnel MTU exceeds the WAN MTU minus the overhead", async ({
    page,
  }) => {
    const { field } = await openWireGuardAdvanced(page);
    const warning = field("mtu-warning");

    // The client MTU is not manual, so it follows: both messages show.
    await field("mtu").fill("1450");

    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Tunnel MTU 1450 is above 1420");
    await expect(warning).toContainText("Client MTU 1450 is above 1420");
  });

  test("a warning raised from outside Advanced reveals the section", async ({
    page,
  }) => {
    const { field } = await openWireGuardAdvanced(page);
    const warning = field("mtu-warning");

    await field("wan-mtu").fill("1300");
    await page.locator('[data-preset="ipv4-only"]').click();
    await expect(warning).toBeHidden();
    await field("advanced").uncheck();
    await expect(field("advanced-section")).toBeHidden();

    // Turning IPv6 back on puts the 1220 MTU under the IPv6 minimum.
    await page.locator('[data-preset="dual-stack"]').click();

    await expect(field("advanced")).toBeChecked();
    await expect(field("advanced-section")).toBeVisible();
    await expect(warning).toContainText("Tunnel MTU 1220 is below 1280");
  });

  test("a hand-edited MTU survives unrelated edits until the WAN changes", async ({
    page,
  }) => {
    const { field, routeros } = await openWireGuardAdvanced(page);

    await field("mtu").fill("1350");
    await expect(field("mss-v4")).toHaveValue("1310");
    await expect(field("mss-v6")).toHaveValue("1290");
    await expect(field("client-mtu")).toHaveValue("1350");

    await field("listen-port").fill("51820");
    await expect(field("mtu")).toHaveValue("1350");
    const manual = (await routerosBlocks(routeros)).block(
      "/interface wireguard add",
    );
    expect(manual).toContain("\n    mtu=1350 \\");
    expect(manual).toContain("(manual;");

    await field("wan-mtu").fill("1480");
    await expect(field("mtu")).toHaveValue("1400");
    await expect(field("mss-v4")).toHaveValue("1360");
    const recalculated = (await routerosBlocks(routeros)).block(
      "/interface wireguard add",
    );
    expect(recalculated).toContain("\n    mtu=1400 \\");
    expect(recalculated).not.toContain("(manual;");

    // Changing the endpoint family recalculates it too: 1480 - 60 = 1420.
    await field("mtu").fill("1350");
    await field("endpoint-family").selectOption("ipv4");
    await expect(field("mtu")).toHaveValue("1420");
    await expect(field("mss-v4")).toHaveValue("1380");
  });

  test("an implausible value goes back to the computed one on change", async ({
    page,
  }) => {
    const { field, routeros, client } = await openWireGuardAdvanced(page);

    // One zero too many, then the field loses focus.
    await field("mtu").fill("14000");
    await field("mtu").blur();
    await expect(field("mtu")).toHaveValue("1420");
    await expect(routeros).toContainText("new-mss=1380");
    await expect(routeros).not.toContainText("(manual;");

    await field("client-mtu").fill("14200");
    await field("client-mtu").blur();
    await expect(field("client-mtu")).toHaveValue("1420");
    await expect(client).toContainText("MTU = 1420");
  });

  test("an emptied client MTU goes back to the tunnel MTU", async ({
    page,
  }) => {
    const { field, client } = await openWireGuardAdvanced(page);

    await field("client-mtu").fill("1280");
    await expect(client).toContainText("MTU = 1280");

    await field("client-mtu").fill("");
    await expect(client).toContainText("MTU = 1420");
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
    const sampleCert = `-----BEGIN CERTIFICATE-----
MIIBkTCB+wIUEFbGcNPf1MTFZqa6FiV6FGhBa+Iw
DQYJKoZIhvcNAQELBQAwEjEQMA4GA1UEAwwHdGVzdC5pbzAe
Fw0yNDAxMDEwMDAwMDBaFw0yNTAxMDEwMDAwMDBaMBIxEDAO
BgNVBAMMB3Rlc3QuaW8wXDANBgkqhkiG9w0BAQEFAANLAEBI
AkEA0Z3VS5hJnMoubR1EQm5r6R4BPqF4l4h5JBhAFBJr0Bx7
rVTSR7XDkW5LRk7Kq3K0qThJYd+k2N0IYJuGlnU3QIDAQAB
oyMwITAfBgNVHREEGDAWhwR/AAABggpsb2NhbGhvc3QwDQYJ
KoZIhvcNAQELBQADQQAJr5aW9T0feLAHPSCiVlbTZpFkn4QF
7s0z/GpGORg/G3xPEMO6FzBe9PF0Fy6J2MX8lD4FnHdVnGbm
1VExjRz
-----END CERTIFICATE-----`;
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

// ─── Encrypt-then-MAC Envelope Visualizer ────────────────────────────

test.describe("Encrypt-then-MAC Envelope Visualizer", () => {
  // PBKDF2 runs at the firmware's 175,000 iterations in the page, so a seal
  // can take a moment on a loaded runner.
  const SEAL_TIMEOUT = 20_000;

  test.beforeEach(async ({ page }) => {
    await blockCloudflare(page);
    await page.goto("/tools/etm-envelope-visualizer/");
  });

  test("seals the example secret and verifies it", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    const root = page.locator("[data-ev-id]");
    await expect(root.locator("[data-ev-verdict]")).toHaveClass(
      /ev-verdict--ok/,
      { timeout: SEAL_TIMEOUT },
    );
    // 8-byte authenticated prefix: ver 01, type 01, slot 3 as u16 LE, gen 1 as u32 LE.
    await expect(root.locator("[data-ev-prefix]")).toHaveText(
      "0101030001000000",
    );
    expect(errors).toEqual([]);
  });

  test("rejects an unknown version byte before the MAC", async ({ page }) => {
    const root = page.locator("[data-ev-id]");
    const verdict = root.locator("[data-ev-verdict]");
    await expect(verdict).toHaveClass(/ev-verdict--ok/, {
      timeout: SEAL_TIMEOUT,
    });
    await root.locator('[data-ev-bytes="ver"] .ev-byte').first().click();
    await expect(verdict).toHaveClass(/ev-verdict--fail/);
  });

  test("a passphrase change rewraps without touching the envelope", async ({
    page,
  }) => {
    const root = page.locator("[data-ev-id]");
    const verdict = root.locator("[data-ev-verdict]");
    const status = root.locator("[data-ev-rekey-status]");
    const cipher = root.locator('[data-ev-bytes="cipher"]');
    await expect(verdict).toHaveClass(/ev-verdict--ok/, {
      timeout: SEAL_TIMEOUT,
    });
    const sealed = (await cipher.textContent()) ?? "";

    await root.locator("[data-ev-change-pass]").click();
    await expect(status).toHaveClass(/ev-rekey-status--ok/, {
      timeout: SEAL_TIMEOUT,
    });
    await expect(cipher).toHaveText(sealed);
    await expect(verdict).toHaveClass(/ev-verdict--ok/);

    // The retired passphrase plus the old meta.bin still opens the vault…
    await root.locator("[data-ev-retired]").click();
    await expect(status).toHaveClass(/ev-rekey-status--warn/, {
      timeout: SEAL_TIMEOUT,
    });

    // …until the vault is re-encrypted under a new vault key.
    await root.locator("[data-ev-reencrypt]").click();
    await expect(status).toHaveClass(/ev-rekey-status--ok/, {
      timeout: SEAL_TIMEOUT,
    });
    await expect(cipher).not.toHaveText(sealed);
    await root.locator("[data-ev-retired]").click();
    await expect(status).toHaveClass(/ev-rekey-status--ok/, {
      timeout: SEAL_TIMEOUT,
    });
  });
});
