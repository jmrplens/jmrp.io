// cspell:ignore NONC NONCENGINX
// Unit tests for edge-nonce. Run beside the worker: `node --test`. Nothing here
// touches the network: every fetch is a mock.
import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "./worker.js";

const ORIGIN = "https://jmrp.io";
const CSP =
  "default-src 'self'; script-src 'nonce-NGINX_CSP_NONCE' 'strict-dynamic'; style-src 'nonce-NGINX_CSP_NONCE'";

/** A worker run over a mock origin that answers `html` with the placeholder CSP. */
async function run(html, { path = "/", method = "GET" } = {}) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(method === "HEAD" ? null : html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": CSP,
        "cf-cache-status": "HIT",
      },
    });
  const request = new Request(`${ORIGIN}${path}`, { method });
  Object.defineProperty(request, "cf", {
    value: { country: "ES", city: "Madrid" },
  });
  const env = { EDGE_NONCE_KEY: "secret", REQS: { writeDataPoint() {} } };
  try {
    return await worker.fetch(request, env);
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** The nonce the CSP header carries. */
function cspNonce(response) {
  const match = /'nonce-([0-9a-f]{32})'/.exec(
    response.headers.get("content-security-policy") ?? "",
  );
  assert.ok(match, "the CSP carries a 128-bit hex nonce");
  return match[1];
}

test("the body is the old text rewrite, byte for byte, multibyte characters included", async () => {
  // Placeholders at the very start and end, next to multibyte UTF-8 (2, 3 and
  // 4 bytes) and back to back; a near miss that must stay.
  const html =
    'NGINX_CSP_NONCE<p>áéí ñ</p><script nonce="NGINX_CSP_NONCE">€</script>' +
    "😀NGINX_CSP_NONCENGINX_CSP_NONCE😀 NGINX_CSP_NONC ¿NGINX_CSP_NONCE?" +
    "NGINX_CSP_NONCE";
  const response = await run(html);
  assert.equal(response.headers.get("x-edge-nonce"), "minted");
  const nonce = cspNonce(response);
  const expected = new TextEncoder().encode(
    html.replaceAll("NGINX_CSP_NONCE", () => nonce),
  );
  const body = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual(body, expected);
  assert.ok(!new TextDecoder().decode(body).includes("NGINX_CSP_NONCE"));
});

test("every visitor gets a different nonce, the same in the body and the header", async () => {
  const html =
    '<style nonce="NGINX_CSP_NONCE"></style><script nonce="NGINX_CSP_NONCE"></script>';
  const nonces = new Set();
  for (let i = 0; i < 5; i++) {
    const response = await run(html);
    const nonce = cspNonce(response);
    const body = await response.text();
    assert.equal(body.split(nonce).length - 1, 2);
    nonces.add(nonce);
  }
  assert.equal(nonces.size, 5);
});

test("a body with no placeholder leaves unchanged", async () => {
  const html =
    "<p>no inline code here, but NGINX_CSP_NONC and N at the end N</p>";
  const response = await run(html);
  assert.equal(await response.text(), html);
});

test("a large page with many placeholders keeps every byte around them", async () => {
  const chunk =
    '<div class="é">' +
    "x".repeat(997) +
    '</div><script nonce="NGINX_CSP_NONCE"></script>';
  const html = chunk.repeat(800); // ~840 KB, the size of /projects/contributions/
  const response = await run(html);
  const nonce = cspNonce(response);
  assert.equal(
    await response.text(),
    html.replaceAll("NGINX_CSP_NONCE", () => nonce),
  );
});

test("a HEAD request mints the header and returns no body", async () => {
  const response = await run("", { method: "HEAD" });
  assert.equal(response.status, 200);
  cspNonce(response);
  assert.equal((await response.arrayBuffer()).byteLength, 0);
});
