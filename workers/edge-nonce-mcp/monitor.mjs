#!/usr/bin/env node
/**
 * Probes for mcp.jmrp.io's nonce Worker, run daily by a systemd timer.
 *
 * It watches what breaks without any visible error:
 *  1. Nonces stay unique per request. If the Worker stopped minting them and
 *     the cached copy went out as it is, every visitor would share a nonce,
 *     the very weakness nonces exist to prevent.
 *  2. No unreplaced placeholder leaks out, which would mean the Worker's
 *     secret and the one in nginx's `map` no longer match.
 *  3. The MCP endpoints stay OUT of the Worker: if a bypass route were lost,
 *     /libgen/health would be served from a 24 hour cache.
 *  4. The HTML carries no validators. The Worker serves `private, no-cache`
 *     rather than `no-store` to keep the back/forward cache, and that is only
 *     safe while there is no `ETag` or `Last-Modified`: with a validator the
 *     browser could revalidate, get a 304 and reuse the stored body, the same
 *     nonce twice. The two are one mechanism, not two separate settings.
 *
 * Exits with 1 when anything fails, so systemd marks the run as failed.
 */
const SITE = "https://mcp.jmrp.io/";
const MCP = "https://mcp.jmrp.io/libgen/health";
const fails = [];

const pages = await Promise.all(
  [1, 2, 3].map(() =>
    fetch(SITE, { cache: "no-store" }).then(async (r) => ({
      headers: r.headers,
      body: await r.text(),
    })),
  ),
);

const nonces = pages.map((p) => /nonce="([^"]+)"/.exec(p.body)?.[1]);
if (new Set(nonces).size !== nonces.length) {
  fails.push(`nonces repeated across requests: ${nonces.join(", ")}`);
}
if (pages.some((p) => p.body.includes("NGINX_CSP_NONCE"))) {
  fails.push(
    "placeholder not replaced: the Worker's secret and nginx's do not match",
  );
}
if (pages.every((p) => !p.headers.get("x-edge-nonce"))) {
  fails.push("the Worker is not handling the page (no X-Edge-Nonce)");
}

// The invariant behind `private, no-cache`: with no validators the browser
// cannot revalidate, so no 304 is possible and no minted nonce is reused. If
// someone brings back ETag or Last-Modified on the HTML, the guarantee weakens
// silently and nothing else would notice.
for (const [i, page] of pages.entries()) {
  for (const header of ["etag", "last-modified"]) {
    if (page.headers.get(header)) {
      fails.push(
        `response ${i + 1}: the HTML carries ${header}, and with a validator a ` +
          "304 can return a nonce already used (cache-control is private, no-cache)",
      );
    }
  }
  const cc = page.headers.get("cache-control") ?? "";
  if (!cc.includes("no-cache") && !cc.includes("no-store")) {
    fails.push(`response ${i + 1}: unexpected cache-control (${cc})`);
  }
}

const mcp = await fetch(MCP, { cache: "no-store" });
if (mcp.headers.get("x-edge-nonce")) {
  fails.push(
    "BYPASS LOST: /libgen/health goes through the Worker and would be cached",
  );
}

// A conditional request for a page must never get a 304: the edge cache
// answered with its fill time as Last-Modified and without Vary: Accept, the
// two headers the 200 corrects (GEO audit #4, 2026-09-22). The Worker drops
// If-Modified-Since and If-None-Match before the cache.
const conditional = await fetch(SITE, {
  cache: "no-store",
  headers: { "if-modified-since": new Date().toUTCString() },
});
if (conditional.status === 304) {
  fails.push(
    "a conditional request for a page returns 304: the Worker is not " +
      "dropping If-Modified-Since before the cache",
  );
}

// Negotiating text/markdown for a page that does not exist must give a 404,
// not a 302 to a twin that does not exist either.
const nope = await fetch(`${SITE}no-such-page/`, {
  cache: "no-store",
  redirect: "manual",
  headers: { accept: "text/markdown" },
});
if (nope.status === 302) {
  fails.push(
    "Markdown negotiation on a page that does not exist returns 302 " +
      "instead of 404",
  );
}

if (fails.length > 0) {
  console.error(`✗ ${new Date().toISOString()}: nonce Worker problems:`);
  for (const f of fails) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(
  `✓ ${new Date().toISOString()}: unique nonces, no placeholder, no ` +
    "validators on the HTML, no 304 on pages, 404 when negotiating what does " +
    "not exist, and MCP bypassed",
);
