// cspell:ignore allback FAKEOAUTHCODE
// Unit tests for edge-nonce-mcp. Run beside the worker: `node --test`. Nothing
// here touches the network: every fetch is a mock, and the code is made up.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import worker from "./worker.js";

const ORIGIN = "https://mcp.jmrp.io";
const FAKE = "FAKEOAUTHCODE123456";
const HTML = `<!doctype html><script nonce="NGINX_CSP_NONCE"></script><p>${"x".repeat(20)}</p>`;
const CSP = "default-src 'none'; script-src 'nonce-NGINX_CSP_NONCE'";

/** A worker run with a mock origin. Returns the response, the subrequests and the rows. */
async function run(path, { method = "GET", headers = {}, origin } = {}) {
  const calls = [];
  const rows = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const request = input instanceof Request ? input : new Request(input);
    calls.push(request);
    if (origin) return origin(request);
    return new Response(HTML, {
      status: 200,
      headers: {
        "content-type": "text/html",
        "content-security-policy": CSP,
        "cf-cache-status": "HIT",
      },
    });
  };
  const request = new Request(`${ORIGIN}${path}`, { method, headers });
  Object.defineProperty(request, "cf", {
    value: { country: "ES", city: "Madrid" },
  });
  const env = {
    EDGE_NONCE_KEY: "secret",
    REQS: {
      writeDataPoint: (row) => {
        rows.push(row);
      },
    },
  };
  try {
    const response = await worker.fetch(request, env);
    return { response, calls, rows };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const blobs = (row) => ({
  path: row.blobs[0],
  referer: row.blobs[17],
  query: row.blobs[18],
});

test("the callback's code reaches no record and no subrequest, and the browser's answer is whole", async () => {
  const { response, calls, rows } = await run(
    `/inspector/callback/?code=${FAKE}&state=${FAKE}`,
  );
  assert.equal(response.status, 200);
  assert.equal(new URL(calls[0].url).search, "");
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows[0]).includes(FAKE));
  assert.deepEqual(blobs(rows[0]), {
    path: "/inspector/callback/",
    referer: "",
    query: "code&state",
  });
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  const body = await response.text();
  assert.ok(!body.includes("NGINX_CSP_NONCE"));
  assert.ok(/nonce="[0-9a-f]{32}"/.test(body));
});

test("every callback spelling is redacted, an error's values too", async () => {
  for (const path of [
    `/inspector/callback?code=${FAKE}`,
    `/es/inspector/callback/?code=${FAKE}`,
    `/inspector/%63allback/?code=${FAKE}`,
    `/INSPECTOR/Callback/?code=${FAKE}`,
    `/inspector/callback/index.html?code=${FAKE}`,
    `/inspector/callback/?${FAKE}`,
    `/inspector/callback/?code%3D${FAKE}`,
    `/inspector/callback/?error=access_denied&error_description=${FAKE}`,
  ]) {
    const { rows, calls } = await run(path);
    assert.ok(!JSON.stringify(rows[0]).includes(FAKE), path);
    assert.ok(!calls[0].url.includes(FAKE), path);
  }
  const { rows } = await run(`/inspector/callback/?${FAKE}`);
  assert.equal(blobs(rows[0]).query, "other");
});

test("a Referer naming the callback is reduced to names, in the record and to the origin", async () => {
  const referer = `${ORIGIN}/inspector/callback/?code=${FAKE}&state=${FAKE}`;
  const { rows, calls } = await run("/favicon.svg", {
    headers: { referer },
    origin: () =>
      new Response("<svg/>", {
        headers: {
          "content-type": "image/svg+xml",
          "content-security-policy": CSP,
        },
      }),
  });
  assert.ok(!JSON.stringify(rows[0]).includes(FAKE));
  assert.equal(
    blobs(rows[0]).referer,
    `${ORIGIN}/inspector/callback/?code&state`,
  );
  assert.equal(
    calls[0].headers.get("referer"),
    `${ORIGIN}/inspector/callback/?code&state`,
  );
});

test("an unparseable Referer naming the callback loses its query", async () => {
  const { rows } = await run("/", {
    headers: { referer: `/inspector/callback/?code=${FAKE}` },
  });
  assert.ok(!JSON.stringify(rows[0]).includes(FAKE));
});

test("other queries and other Referers stay as they were in the record", async () => {
  const referer = `${ORIGIN}/inspector/?server=gitlab`;
  const { rows, calls } = await run("/?utm=1", { headers: { referer } });
  assert.deepEqual(blobs(rows[0]), { path: "/", referer, query: "utm=1" });
  assert.equal(new URL(calls[0].url).search, "");
  assert.equal(calls[0].headers.get("referer"), referer);
});

test("only the callback gets no-referrer", async () => {
  const { response } = await run("/inspector/");
  assert.equal(response.headers.get("referrer-policy"), null);
});

test("no pass-through path carries the code to the origin", async () => {
  const post = await run(`/inspector/callback/?code=${FAKE}`, {
    method: "POST",
    origin: () => new Response("no", { status: 405 }),
  });
  assert.ok(!post.calls[0].url.includes(FAKE));
  assert.ok(!JSON.stringify(post.rows[0]).includes(FAKE));

  const rail = await run(`/inspector/callback/?code=${FAKE}`, {
    origin: () =>
      new Response(HTML, {
        headers: {
          "content-type": "text/html",
          "content-security-policy": "script-src 'nonce-real'",
        },
      }),
  });
  assert.equal(rail.calls.length, 2);
  assert.ok(rail.calls.every((call) => !call.url.includes(FAKE)));
  assert.equal(
    rail.response.headers.get("x-edge-nonce"),
    "bypass-no-placeholder",
  );
  assert.equal(rail.response.headers.get("referrer-policy"), "no-referrer");

  let count = 0;
  const thrown = await run(`/inspector/callback/?code=${FAKE}`, {
    origin: () => {
      count += 1;
      if (count === 1) throw new Error("origin down");
      return new Response("fallback");
    },
  });
  assert.equal(thrown.calls.length, 2);
  assert.ok(thrown.calls.every((call) => !call.url.includes(FAKE)));

  // Elsewhere, a pass-through still carries its query: a POST owns its URL.
  const other = await run("/mcp?x=1", {
    method: "POST",
    origin: () => new Response("no", { status: 405 }),
  });
  assert.equal(new URL(other.calls[0].url).search, "?x=1");
});

test("Range is kept only on the listed binary types", async () => {
  const file = () =>
    new Response("x", {
      headers: { "content-type": "text/plain", "content-security-policy": CSP },
    });
  const headers = { range: "bytes=0-99", "if-range": '"x"' };
  for (const path of [
    "/llms.txt",
    "/index.md",
    "/",
    "/.well-known/api-catalog",
    "/robots.txt",
    "/x.svg",
    "/page.html",
  ]) {
    const { calls } = await run(path, { headers, origin: file });
    assert.equal(calls[0].headers.get("range"), null, path);
    assert.equal(calls[0].headers.get("if-range"), null, path);
  }
  for (const path of ["/og-en.png", "/x.woff2", "/X.PNG", "/a.pdf"]) {
    const { calls } = await run(path, { headers, origin: file });
    assert.equal(calls[0].headers.get("range"), "bytes=0-99", path);
    assert.equal(calls[0].headers.get("if-range"), '"x"', path);
  }
});

const redirect =
  (location, extra = {}) =>
  () =>
    new Response("<html></html>", {
      status: 308,
      headers: {
        location,
        "content-type": "text/html",
        "content-security-policy": CSP,
        "cache-control": "x",
        ...extra,
      },
    });

test("a redirect gets its query back, no CSP and a cacheable lifetime", async () => {
  const { response, calls, rows } = await run("/inspector?server=gitlab", {
    origin: redirect(`${ORIGIN}/inspector/`),
  });
  assert.equal(response.status, 308);
  assert.equal(
    response.headers.get("location"),
    `${ORIGIN}/inspector/?server=gitlab`,
  );
  assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("x-edge-nonce"), "redirect");
  assert.equal(new URL(calls[0].url).search, "");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].blobs[10], "308");
});

test("a redirect with its own query or fragment keeps it", async () => {
  for (const target of [`${ORIGIN}/a?b=1`, `${ORIGIN}/a#b`]) {
    const { response } = await run("/x?y=2", { origin: redirect(target) });
    assert.equal(response.headers.get("location"), target);
  }
});

test("a redirect carrying a real nonce still takes the rail", async () => {
  const { response } = await run("/x", {
    origin: redirect(`${ORIGIN}/x/`, {
      "content-security-policy": "script-src 'nonce-real'",
    }),
  });
  assert.equal(response.headers.get("x-edge-nonce"), "bypass-no-placeholder");
});

test("a 304 is no redirect", async () => {
  const { response } = await run("/llms.txt", {
    origin: () =>
      new Response(null, {
        status: 304,
        headers: { "content-security-policy": CSP },
      }),
  });
  assert.equal(response.status, 304);
  assert.equal(response.headers.get("x-edge-nonce"), "header-only");
});

test("negotiation follows prefersMarkdown, and its 302 is open to other origins", async () => {
  const twin = `${ORIGIN}/servers/libgen/index.md`;
  for (const accept of [
    "text/markdown",
    "TEXT/MARKDOWN",
    "text/markdown, text/html;q=0.1",
    "text/html,text/markdown",
  ]) {
    const { response, rows } = await run("/servers/libgen/?x=1", {
      headers: { accept },
    });
    assert.equal(response.status, 302, accept);
    assert.equal(response.headers.get("location"), twin);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
    assert.equal(response.headers.get("vary"), "Accept");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(rows[0].blobs[11], "markdown-negotiation");
  }
  for (const accept of [
    "text/markdown;q=0",
    "text/html, text/markdown;q=0.7",
    "*/*",
    "text/html",
  ]) {
    const { response } = await run("/servers/libgen/", { headers: { accept } });
    assert.equal(response.status, 200, accept);
  }
});

test("no twin is offered where there is none", async () => {
  for (const path of ["/inspector/callback/", "/es/404/"]) {
    const { response } = await run(path, {
      headers: { accept: "text/markdown" },
    });
    assert.equal(response.status, 200, path);
  }
  const { response } = await run("/nope/", {
    headers: { accept: "text/markdown" },
    origin: () =>
      new Response(HTML, {
        status: 404,
        headers: {
          "content-type": "text/html",
          "content-security-policy": CSP,
        },
      }),
  });
  assert.equal(response.status, 404);
});

test("the nonce differs per request and the validators stay off", async () => {
  const [a, b] = await Promise.all([run("/"), run("/")]);
  assert.notEqual(
    a.response.headers.get("content-security-policy"),
    b.response.headers.get("content-security-policy"),
  );
  assert.equal(a.response.headers.get("etag"), null);
  assert.equal(a.response.headers.get("cache-control"), "private, no-cache");
});

test("a Range the edge rejects: the whole file, never a 502", async () => {
  // Cloudflare throws on some ranges (`bytes=-0,-0`); the fail-open fallback
  // sends the request once more without Range and gets the whole file.
  const { response, calls } = await run("/og-en.png", {
    headers: { range: "bytes=-0,-0" },
    origin: (request) => {
      if (request.headers.has("range")) throw new TypeError("rejected range");
      return new Response("whole", { status: 200 });
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "whole");
  assert.equal(calls.at(-1).headers.has("range"), false);
});

test("the source logs nothing to the console", () => {
  const source = readFileSync(new URL("worker.js", import.meta.url), "utf8");
  assert.ok(!/\bconsole\./.test(source));
});

test("the copied parts match jmrp.io's worker byte for byte", () => {
  const read = (url) => readFileSync(url, "utf8");
  const reference = new URL("../edge-nonce/worker.js", import.meta.url);
  const mine = read(new URL("worker.js", import.meta.url));
  const other = read(reference);
  const fn = (source, name) =>
    source.match(
      new RegExp(
        String.raw`^(function ${name}\([^)]*\) \{\n[\s\S]*?\n\}\n)`,
        "m",
      ),
    )?.[1];
  for (const name of ["prefersMarkdown", "twinUrl"]) {
    assert.equal(fn(mine, name), fn(other, name), name);
    assert.ok(fn(mine, name));
  }
  const list = (source) =>
    source
      .match(/const RANGE_SAFE_EXTENSIONS = new Set\(\[([\s\S]*?)\]\)/)?.[1]
      .replaceAll(/\s+/g, " ")
      .trim();
  assert.equal(list(mine), list(other));
});
