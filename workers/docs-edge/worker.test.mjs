// cspell:ignore noextension pdfx
// Unit tests for docs-edge's Markdown negotiation (decision D6, 2026-10-29).
// Run beside the worker: `node --test` in workers/docs-edge. Nothing here
// touches the network: every fetch is a mock.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  announceTwin,
  EDGE_CACHE_CF,
  isTwinResponse,
  markdownRedirect,
  markdownTwin,
  prefersMarkdown,
  PROBE_TIMEOUT_MS,
  probeTwin,
  startTwinProbe,
  twinUrl,
  varyWithAccept,
  VERDICT_CACHE,
  VERDICT_TTL_S,
} from "./markdown-negotiation.js";
import worker from "./worker.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://docs.jmrp.io";
const EDGE_NONCE = path.join(here, "..", "edge-nonce", "worker.js");

/**
 * The source of `function <name>(...) {` through its closing brace at column
 * 0, with any leading `export ` left out, or null when the file has none.
 */
function functionSource(file, name) {
  const re = new RegExp(
    String.raw`^(?:export )?(function ${name}\([^)]*\) \{\n[\s\S]*?\n\}\n)`,
    "m",
  );
  return readFileSync(file, "utf8").match(re)?.[1] ?? null;
}

// The eight Accept values of the D6 curl matrix (d6-baseline.sh), by id.
const ACCEPTS = {
  D: "*/*", // curl's default
  N: null, // no Accept header at all
  M: "text/markdown",
  MH: "text/markdown, text/html;q=0.1",
  HM: "text/html, text/markdown;q=0.9",
  S: "*/*",
  P: "text/plain",
  B: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};
const MARKDOWN_IDS = new Set(["M", "MH"]);

function req(
  pathname,
  { accept = null, method = "GET", body = null, headers = {} } = {},
) {
  const all = accept === null ? { ...headers } : { ...headers, accept };
  return new Request(`${ORIGIN}${pathname}`, { method, headers: all, body });
}

// GitHub's validators for a page, and the request headers that make the edge
// answer with a 304 (a revalidation) or a 206 (one range, or several).
const LAST_MODIFIED = "Tue, 03 Nov 2026 20:19:02 GMT";
const ETAG = 'W/"6aea41b6-38bf6"';
const CONDITIONAL = {
  "If-Modified-Since": { "if-modified-since": LAST_MODIFIED },
  "If-None-Match": { "if-none-match": ETAG },
};
const RANGES = {
  "one range": { range: "bytes=0-8" },
  "two ranges": { range: "bytes=0-3,5-8" },
};

/** A fetch mock that records its calls and answers with `respond(input, init)`. */
function mockFetch(respond) {
  const calls = [];
  const fn = async (input, init) => {
    calls.push({ input, init });
    return respond(input, init);
  };
  fn.calls = calls;
  return fn;
}

function twinResponse(
  contentType = "text/markdown; charset=utf-8",
  status = 200,
) {
  return new Response(status === 204 || status === 304 ? null : "# twin\n", {
    status,
    headers: contentType === null ? {} : { "content-type": contentType },
  });
}

function notFound() {
  return new Response("<!doctype html><title>404</title>", {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// ── prefersMarkdown ─────────────────────────────────────────────────────────

describe("prefersMarkdown", () => {
  test("is a verbatim copy of edge-nonce's (change both together)", () => {
    const ours = functionSource(
      path.join(here, "markdown-negotiation.js"),
      "prefersMarkdown",
    );
    const theirs = functionSource(EDGE_NONCE, "prefersMarkdown");
    assert.ok(ours, "prefersMarkdown not found in markdown-negotiation.js");
    assert.ok(theirs, "prefersMarkdown not found in edge-nonce/worker.js");
    assert.equal(ours, theirs);
  });

  test("a pathological q parameter is parsed in linear time (64 KB Accept)", () => {
    // `q=`, 65,536 spaces and one other character: the former pattern, with
    // `\s*` on both sides of a group that can match empty, took about 6 s on
    // each of these (quadratic backtracking), far past the Workers Free CPU
    // budget of 10 ms. The q is unparseable, so it keeps the default of 1.
    for (const [accept, expected] of [
      [`text/markdown;q=${" ".repeat(65_536)}x`, true],
      [`text/html;q=${" ".repeat(65_536)}x`, false],
      [`text/markdown, text/html;q=${"\t".repeat(65_536)}.`, true], // a tie: Markdown
    ]) {
      const started = performance.now();
      assert.equal(prefersMarkdown(accept), expected, accept.slice(0, 20));
      const ms = performance.now() - started;
      assert.ok(ms < 100, `${accept.slice(0, 20)}...: ${ms.toFixed(0)} ms`);
    }
  });

  test("whitespace and malformed q values: the results of the original pattern", () => {
    // trim() replaced the pattern's outer `\s*`; these pin that nothing else
    // moved, including the forms a stricter grammar would read differently.
    assert.equal(prefersMarkdown("text/markdown;q=0., text/html;q=0.9"), true); // `0.` unparseable: q=1
    assert.equal(prefersMarkdown("text/html;q=2, text/markdown;q=5."), false); // `5.` unparseable: q=1
    assert.equal(
      prefersMarkdown("text/markdown; q = 0.5 , text/html;q=0.6"),
      false,
    );
    assert.equal(
      prefersMarkdown("text/markdown;\tQ=0.7\t, text/html;q=0.6"),
      true,
    );
    assert.equal(
      prefersMarkdown("text/markdown;q=\u{A0}0.5\u{A0}, text/html;q=0.6"),
      false,
    );
    assert.equal(prefersMarkdown("text/markdown;q=, text/html;q=0.9"), true); // empty: q=1
    assert.equal(
      prefersMarkdown("text/markdown;q= 0 .5, text/html;q=0.1"),
      true,
    ); // inner space: q=1
    assert.equal(prefersMarkdown("text/markdown;level=1;q=0"), false);
  });

  test("the matrix Accepts: true for M and MH only", () => {
    for (const [id, accept] of Object.entries(ACCEPTS)) {
      assert.equal(prefersMarkdown(accept), MARKDOWN_IDS.has(id), id);
    }
  });

  test("the Accepts measured on docs.jmrp.io (measure-D6.md)", () => {
    // ExaSearchBot, ShapBot, Claude-User, curl: all name Markdown first.
    assert.equal(
      prefersMarkdown(
        "text/markdown,text/html;q=0.9,application/xhtml+xml;q=0.8",
      ),
      true,
    );
    assert.equal(
      prefersMarkdown("text/markdown, text/html;q=0.9, */*;q=0.8"),
      true,
    );
    assert.equal(prefersMarkdown("text/markdown, text/html, */*"), true);
  });

  test("weights, wildcards, ties and q=0", () => {
    assert.equal(prefersMarkdown(""), false);
    assert.equal(prefersMarkdown("text/html;q=0.9,text/markdown;q=0.8"), false);
    assert.equal(prefersMarkdown("text/html,text/markdown"), true); // tie
    assert.equal(prefersMarkdown("text/markdown;q=0.5, */*"), true); // specificity beats q
    assert.equal(prefersMarkdown("text/markdown;q=0.8, text/*;q=0.9"), true);
    assert.equal(prefersMarkdown("text/markdown;q=0, text/html"), false);
    assert.equal(prefersMarkdown("text/markdown;q=.8"), true);
    assert.equal(prefersMarkdown("TEXT/MARKDOWN"), true);
    assert.equal(prefersMarkdown("text/*"), false);
    assert.equal(prefersMarkdown("application/json"), false);
  });
});

// ── twin URL, by project ────────────────────────────────────────────────────

describe("twinUrl: <pathname>index.md, the one convention of every project", () => {
  const cases = [
    // Projects that publish twins (d6-survey.md): the candidate is the twin.
    [
      "phonometry",
      "/phonometry/start/getting-started/",
      "/phonometry/start/getting-started/index.md",
    ],
    [
      "phonometry",
      "/phonometry/es/aircraft/anp-fleet/",
      "/phonometry/es/aircraft/anp-fleet/index.md",
    ],
    ["mikroscope", "/mikroscope/", "/mikroscope/index.md"],
    [
      "mikroscope",
      "/mikroscope/playbooks/cpu/",
      "/mikroscope/playbooks/cpu/index.md",
    ],
    [
      "libgen-mcp",
      "/libgen-mcp/how-search-works/",
      "/libgen-mcp/how-search-works/index.md",
    ],
    [
      "libgen-mcp",
      "/libgen-mcp/es/citations/",
      "/libgen-mcp/es/citations/index.md",
    ],
    [
      "ghchronicle",
      "/ghchronicle/start/token/",
      "/ghchronicle/start/token/index.md",
    ],
    ["ghchronicle", "/ghchronicle/es/card/", "/ghchronicle/es/card/index.md"],
    // Pages with no twin: same rule, the probe answers 404 and they fall through.
    ["phonometry home", "/phonometry/", "/phonometry/index.md"],
    ["phonometry ES home", "/phonometry/es/", "/phonometry/es/index.md"],
    // The Spanish API fallback: its OWN candidate, never the English twin its
    // head link declares (/phonometry/reference/api/.../index.md).
    [
      "phonometry ES API fallback",
      "/phonometry/es/reference/api/hearing/occupational-exposure/",
      "/phonometry/es/reference/api/hearing/occupational-exposure/index.md",
    ],
    [
      "gitlab-mcp-server",
      "/gitlab-mcp-server/getting-started/",
      "/gitlab-mcp-server/getting-started/index.md",
    ],
    [
      "cs-routeros-bouncer",
      "/cs-routeros-bouncer/",
      "/cs-routeros-bouncer/index.md",
    ],
    [
      "Cloudflare-DNS-Updater",
      "/Cloudflare-DNS-Updater/configuration/",
      "/Cloudflare-DNS-Updater/configuration/index.md",
    ],
    ["hub", "/", "/index.md"],
  ];
  for (const [project, page, twin] of cases) {
    test(`${project}: ${page}`, () => {
      assert.equal(
        twinUrl(new URL(`${ORIGIN}${page}`)).href,
        `${ORIGIN}${twin}`,
      );
    });
  }

  test("no candidate for a path that does not end in /", () => {
    for (const page of [
      "/phonometry/start/getting-started", // GitHub 301s it to the slash form
      "/mikroscope",
      "/mikroscope/start/walkthrough/index.html",
      "/phonometry/start/getting-started/index.md", // already the twin
      "/robots.txt",
      "/llms.txt",
      "/phonometry/llms.txt",
    ]) {
      assert.equal(twinUrl(new URL(`${ORIGIN}${page}`)), null, page);
    }
  });

  test("the query and the fragment are dropped", () => {
    const twin = twinUrl(
      new URL(`${ORIGIN}/phonometry/start/getting-started/?utm_source=x#top`),
    );
    assert.equal(
      twin.href,
      `${ORIGIN}/phonometry/start/getting-started/index.md`,
    );
  });

  test("a percent-encoded path is kept as it is", () => {
    const twin = twinUrl(new URL(`${ORIGIN}/phonometry/caf%C3%A9/`));
    assert.equal(twin.href, `${ORIGIN}/phonometry/caf%C3%A9/index.md`);
  });

  test("a path starting with // never names another host", () => {
    const twin = twinUrl(new URL(`${ORIGIN}//evil.example/`));
    assert.equal(twin.host, "docs.jmrp.io");
    assert.equal(twin.href, `${ORIGIN}//evil.example/index.md`);
  });

  test("is a verbatim copy of edge-nonce's (change both together)", () => {
    const ours = functionSource(
      path.join(here, "markdown-negotiation.js"),
      "twinUrl",
    );
    const theirs = functionSource(EDGE_NONCE, "twinUrl");
    assert.ok(ours, "twinUrl not found in markdown-negotiation.js");
    assert.ok(theirs, "twinUrl not found in edge-nonce/worker.js");
    assert.equal(ours, theirs);
  });

  test("edge-nonce's probe and 302 stay on jmrp.io for a path starting with //", async () => {
    // jmrp.io's handler, run with fetch mocked: every probe answers a twin, so
    // the 302 names whatever URL the probe fetched. String resolution of
    // `${pathname}index.md` would make both https://evil.example/index.md;
    // only the zone's slash merging hides that on the live site.
    const edgeNonce = (await import(pathToFileURL(EDGE_NONCE).href)).default;
    for (const page of [
      "//evil.example/",
      "///evil.example/",
      "/.//evil.example/",
    ]) {
      const calls = [];
      const saved = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        calls.push({ input, init });
        return twinResponse();
      };
      let response;
      try {
        response = await edgeNonce.fetch(
          new Request(`https://jmrp.io${page}`, {
            headers: { accept: "text/markdown" },
          }),
          { REQS: { writeDataPoint() {} } },
        );
      } finally {
        globalThis.fetch = saved;
      }
      assert.equal(calls.length, 1, page);
      assert.equal(new URL(calls[0].input).host, "jmrp.io", page);
      assert.equal(response.status, 302, page);
      assert.equal(
        new URL(response.headers.get("location")).host,
        "jmrp.io",
        page,
      );
    }
  });
});

describe("isTwinResponse: a literal 200 with a text/markdown type", () => {
  test("accepts the twins' own type, parameters and case aside", () => {
    assert.equal(isTwinResponse(twinResponse()), true);
    assert.equal(isTwinResponse(twinResponse("text/markdown")), true);
    assert.equal(
      isTwinResponse(twinResponse("Text/Markdown ; charset=UTF-8")),
      true,
    );
  });
  test("refuses any other status or type", () => {
    assert.equal(
      isTwinResponse(twinResponse("text/html; charset=utf-8")),
      false,
    );
    assert.equal(isTwinResponse(twinResponse("text/plain")), false);
    assert.equal(isTwinResponse(twinResponse("text/x-markdown")), false);
    assert.equal(isTwinResponse(twinResponse(null)), false);
    for (const status of [
      201, 203, 204, 206, 301, 302, 304, 404, 410, 500, 503,
    ]) {
      assert.equal(
        isTwinResponse(twinResponse(undefined, status)),
        false,
        String(status),
      );
    }
  });
});

// ── the routing decision, with a mocked probe ───────────────────────────────

describe("markdownTwin: the routing decision", () => {
  const page = "/phonometry/start/getting-started/";
  const twin = `${ORIGIN}${page}index.md`;

  test("twin found: one probe GET, manual redirects, through the edge cache", async () => {
    const fetch = mockFetch(() => twinResponse());
    const r = req(page, { accept: ACCEPTS.M });
    assert.equal(await markdownTwin(r, new URL(r.url), fetch), twin);
    assert.equal(fetch.calls.length, 1);
    const { input, init } = fetch.calls[0];
    assert.equal(input, twin);
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    // The pass-through's own cf options (worker.js; the pre-D6 comparison
    // below ties those to the deployed worker), with no per-status TTL: the
    // probe shares the `<page>/index.md` cache entry with a direct request and
    // must store exactly what that request would. A "300-399": 0 band would
    // also catch the 304 of a revalidation and leave the entry at TTL 0; a
    // "404": 300 band would outlive the pass-through's 180 s.
    assert.deepEqual(init.cf, { cacheEverything: true });
    assert.deepEqual(init.cf, { ...EDGE_CACHE_CF });
  });

  test("twin found for MH as for M, on every project that publishes twins", async () => {
    for (const p of [
      "/mikroscope/",
      "/libgen-mcp/es/citations/",
      "/ghchronicle/start/token/",
    ]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(p, { accept: ACCEPTS.MH });
      assert.equal(
        await markdownTwin(r, new URL(r.url), fetch),
        `${ORIGIN}${p}index.md`,
        p,
      );
    }
  });

  test("the probe body is released", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("# twin\n"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const fetch = mockFetch(
      () =>
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/markdown" },
        }),
    );
    const r = req(page, { accept: ACCEPTS.M });
    assert.equal(await markdownTwin(r, new URL(r.url), fetch), twin);
    assert.equal(cancelled, true);
  });

  test("HEAD is negotiated, and still probes with a GET", async () => {
    const fetch = mockFetch(() => twinResponse());
    const r = req(page, { accept: ACCEPTS.M, method: "HEAD" });
    assert.equal(await markdownTwin(r, new URL(r.url), fetch), twin);
    assert.equal(fetch.calls[0].init.method, "GET");
  });

  test("twin missing (404): falls through, on every project without twins", async () => {
    for (const p of [
      "/gitlab-mcp-server/",
      "/cs-routeros-bouncer/getting-started/quickstart/",
      "/Cloudflare-DNS-Updater/es/development/building/",
      "/",
      "/phonometry/",
      "/phonometry/es/reference/api/hearing/occupational-exposure/",
      "/phonometry/nonexistent/",
    ]) {
      const fetch = mockFetch(() => notFound());
      const r = req(p, { accept: ACCEPTS.M });
      assert.equal(await markdownTwin(r, new URL(r.url), fetch), null, p);
      assert.equal(fetch.calls.length, 1, p);
      assert.equal(fetch.calls[0].input, `${ORIGIN}${p}index.md`, p);
    }
  });

  test("non-200 probe: falls through (a redirect is never followed)", async () => {
    for (const status of [201, 204, 206, 301, 302, 304, 307, 410, 500, 503]) {
      const fetch = mockFetch(() => twinResponse(undefined, status));
      const r = req(page, { accept: ACCEPTS.M });
      assert.equal(
        await markdownTwin(r, new URL(r.url), fetch),
        null,
        String(status),
      );
    }
  });

  test("a 200 of the wrong content type: falls through", async () => {
    for (const type of [
      "text/html; charset=utf-8",
      "text/plain",
      "application/octet-stream",
      null,
    ]) {
      const fetch = mockFetch(() => twinResponse(type));
      const r = req(page, { accept: ACCEPTS.M });
      assert.equal(
        await markdownTwin(r, new URL(r.url), fetch),
        null,
        String(type),
      );
    }
  });

  test("a probe that throws: falls through", async () => {
    const fetch = mockFetch(() => {
      throw new TypeError("network down");
    });
    const r = req(page, { accept: ACCEPTS.M });
    assert.equal(await markdownTwin(r, new URL(r.url), fetch), null);
  });

  test("a request that does not prefer Markdown: null, and no probe", async () => {
    for (const [id, accept] of Object.entries(ACCEPTS)) {
      if (MARKDOWN_IDS.has(id)) continue;
      for (const method of ["GET", "HEAD"]) {
        const fetch = mockFetch(() => twinResponse());
        const r = req(page, { accept, method });
        assert.equal(
          await markdownTwin(r, new URL(r.url), fetch),
          null,
          `${method} ${id}`,
        );
        assert.equal(fetch.calls.length, 0, `${method} ${id}`);
      }
    }
  });

  test("a method other than GET or HEAD: null, and no probe", async () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(page, { accept: ACCEPTS.M, method });
      assert.equal(await markdownTwin(r, new URL(r.url), fetch), null, method);
      assert.equal(fetch.calls.length, 0, method);
    }
  });

  test("a path that does not end in /: null, and no probe", async () => {
    for (const p of [
      "/phonometry/start/getting-started",
      "/mikroscope/start/walkthrough/index.html",
      `${page}index.md`,
    ]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(p, { accept: ACCEPTS.M });
      assert.equal(await markdownTwin(r, new URL(r.url), fetch), null, p);
      assert.equal(fetch.calls.length, 0, p);
    }
  });

  test("a path that does not end in /: the Accept header is never read", async () => {
    // The path is tested before the Accept is parsed, as on jmrp.io, so an
    // asset, robots.txt or llms.txt never pays for parsing whatever Accept it
    // carries. A request whose header reads are counted:
    for (const p of [
      "/robots.txt",
      "/phonometry/llms.txt",
      "/phonometry/_astro/app.js",
      "/mikroscope",
    ]) {
      const reads = [];
      const request = {
        method: "GET",
        headers: {
          get(name) {
            reads.push(name);
            return ACCEPTS.M;
          },
        },
      };
      const fetch = mockFetch(() => twinResponse());
      assert.equal(
        await markdownTwin(request, new URL(`${ORIGIN}${p}`), fetch),
        null,
        p,
      );
      assert.deepEqual(reads, [], p);
      assert.equal(fetch.calls.length, 0, p);
    }
  });

  test("the redirect: 302, Location, Vary: Accept, no-store, no body", async () => {
    const res = markdownRedirect(twin);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), twin);
    assert.equal(res.headers.get("vary"), "Accept");
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("content-type"), null);
    assert.equal(res.body, null);
  });
});

// ── announceTwin ────────────────────────────────────────────────────────────

describe("announceTwin: an HTML page names the twin it has", () => {
  const page = "/libgen-mcp/how-search-works/";
  const twin = `${ORIGIN}${page}index.md`;
  const LINK = `<${twin}>; rel="alternate"; type="text/markdown"`;
  const html = (status = 200, type = "text/html; charset=utf-8") =>
    new Response("<!doctype html><title>p</title>", {
      status,
      headers: {
        "content-type": type,
        "cache-control": "max-age=600",
        vary: "Accept-Encoding",
      },
    });
  // The answers that stand for the page: GitHub's 304, with no Content-Type
  // (as it comes live), and a 206 of one range or of several.
  const notModified = (headers = {}) =>
    new Response(null, {
      status: 304,
      headers: {
        "cache-control": "max-age=600",
        vary: "Accept-Encoding",
        "last-modified": LAST_MODIFIED,
        etag: ETAG,
        ...headers,
      },
    });
  const partial = (type = "text/html; charset=utf-8") =>
    new Response("<!doctype", {
      status: 206,
      headers: {
        "content-type": type,
        "content-range": "bytes 0-8/31",
        "cache-control": "max-age=600",
        vary: "Accept-Encoding",
      },
    });

  test("twin found: a copy of the response with the Link header and Accept in its Vary, everything else kept", async () => {
    for (const method of ["GET", "HEAD"]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(page, { method });
      const upstream = html();
      const out = await announceTwin(r, new URL(r.url), upstream, fetch);
      assert.notEqual(out, upstream, method);
      assert.equal(out.status, 200, method);
      assert.equal(out.headers.get("link"), LINK, method);
      assert.equal(out.headers.get("vary"), "Accept-Encoding, Accept", method);
      assert.equal(out.headers.get("cache-control"), "max-age=600", method);
      assert.equal(
        out.headers.get("content-type"),
        "text/html; charset=utf-8",
        method,
      );
      assert.equal(fetch.calls.length, 1, method);
      assert.equal(fetch.calls[0].input, twin, method);
      assert.equal(fetch.calls[0].init.redirect, "manual", method);
      assert.deepEqual(fetch.calls[0].init.cf, { ...EDGE_CACHE_CF }, method);
    }
  });

  test("no twin, a twin of the wrong type, or a failing probe: the response object itself", async () => {
    for (const respond of [
      () => notFound(),
      () => twinResponse("text/html; charset=utf-8"),
      () => twinResponse(null),
      () =>
        new Response(null, {
          status: 301,
          headers: { location: "/elsewhere/" },
        }),
      () => {
        throw new TypeError("network down");
      },
    ]) {
      for (const upstream of [html(), notModified(), partial()]) {
        const fetch = mockFetch(respond);
        const r = req(page);
        const at = String(upstream.status);
        assert.equal(
          await announceTwin(r, new URL(r.url), upstream, fetch),
          upstream,
          at,
        );
        assert.equal(
          upstream.headers.get("vary"),
          "Accept-Encoding",
          `${at}: the origin's Vary, untouched`,
        );
        assert.equal(fetch.calls.length, 1, at);
      }
    }
  });

  test("the 304 and the 206 of a page with a twin: the Vary of its 200, no Link, everything else kept", async () => {
    for (const method of ["GET", "HEAD"]) {
      for (const [upstream, body] of [
        [notModified(), ""],
        [notModified({ "content-type": "text/html; charset=utf-8" }), ""],
        [partial(), "<!doctype"],
        [partial("multipart/byteranges; boundary=B"), "<!doctype"],
      ]) {
        const at = `${method} ${upstream.status} ${upstream.headers.get("content-type")}`;
        const fetch = mockFetch(() => twinResponse());
        const r = req(page, { method });
        const out = await announceTwin(r, new URL(r.url), upstream, fetch);
        assert.notEqual(out, upstream, at);
        assert.equal(out.status, upstream.status, at);
        assert.equal(out.headers.get("vary"), "Accept-Encoding, Accept", at);
        assert.equal(out.headers.has("link"), false, at);
        assert.deepEqual(
          [...out.headers].filter(([k]) => k !== "vary"),
          [...upstream.headers].filter(([k]) => k !== "vary"),
          at,
        );
        assert.equal(await out.text(), body, at);
        assert.equal(fetch.calls.length, 1, at);
        assert.equal(fetch.calls[0].input, twin, at);
        assert.deepEqual(fetch.calls[0].init.cf, { ...EDGE_CACHE_CF }, at);
      }
    }
    // The 200 to the same request: the same Vary, and the Link.
    const r = req(page);
    const out = await announceTwin(
      r,
      new URL(r.url),
      html(),
      mockFetch(() => twinResponse()),
    );
    assert.equal(out.headers.get("vary"), "Accept-Encoding, Accept");
    assert.equal(out.headers.get("link"), LINK);
  });

  test("the announced Vary: Accept appended to the origin's, never twice, nothing lost", async () => {
    for (const [vary, expected] of [
      [null, "Accept"],
      ["", "Accept"],
      ["Accept-Encoding", "Accept-Encoding, Accept"],
      ["accept-encoding", "accept-encoding, Accept"],
      ["Origin, Accept-Encoding", "Origin, Accept-Encoding, Accept"],
      ["Accept-Encoding,Origin", "Accept-Encoding, Origin, Accept"],
      ["Accept-Encoding, ", "Accept-Encoding, Accept"],
      ["Accept-Language", "Accept-Language, Accept"],
      ["Accept-Encoding, Accept", "Accept-Encoding, Accept"],
      ["Accept-Encoding,Accept", "Accept-Encoding, Accept"],
      ["Accept, Accept-Encoding", "Accept, Accept-Encoding"],
      ["accept", "accept"],
      ["ACCEPT", "ACCEPT"],
      [" Accept ", "Accept"],
      ["*", "*"],
      ["Accept-Encoding, *", "Accept-Encoding, *"],
    ]) {
      assert.equal(varyWithAccept(vary), expected, JSON.stringify(vary));
      const headers = new Headers({ "content-type": "text/html" });
      if (vary !== null) headers.set("vary", vary);
      const r = req(page);
      const out = await announceTwin(
        r,
        new URL(r.url),
        new Response("<p>", { status: 200, headers }),
        mockFetch(() => twinResponse()),
      );
      assert.equal(out.headers.get("vary"), expected, JSON.stringify(vary));
    }
    // Two Vary lines from the origin: both kept, Accept added once.
    const headers = new Headers({ "content-type": "text/html" });
    headers.append("vary", "Accept-Encoding");
    headers.append("vary", "Origin");
    const r = req(page);
    const out = await announceTwin(
      r,
      new URL(r.url),
      new Response("<p>", { status: 200, headers }),
      mockFetch(() => twinResponse()),
    );
    assert.equal(out.headers.get("vary"), "Accept-Encoding, Origin, Accept");
  });

  test("no probe unless the page's 200 HTML, 304 or 206 answers a GET or HEAD for a slash path", async () => {
    const cases = [
      ["POST", page, html()],
      ["PUT", page, html()],
      ["POST", page, notModified()],
      ["GET", "/libgen-mcp/how-search-works", html()],
      ["GET", "/libgen-mcp/how-search-works", notModified()],
      ["GET", "/libgen-mcp/how-search-works", partial()],
      ["GET", "/libgen-mcp/how-search-works/index.md", twinResponse()],
      ["GET", "/libgen-mcp/llms.txt", html(200, "text/plain")],
      ["GET", page, html(404)],
      ["GET", page, html(416)],
      ["GET", page, html(200, "application/xhtml+xml")],
      ["GET", page, html(200, "text/markdown")],
      ["GET", page, notModified({ "content-type": "text/plain" })],
      ["GET", page, partial("text/plain")],
      [
        "GET",
        page,
        new Response(null, {
          status: 206,
          headers: { vary: "Accept-Encoding" },
        }),
      ],
    ];
    for (const [method, p, upstream] of cases) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(p, {
        method,
        body: method === "GET" || method === "HEAD" ? null : "x=1",
      });
      assert.equal(
        await announceTwin(r, new URL(r.url), upstream, fetch),
        upstream,
        `${method} ${p} ${upstream.status}`,
      );
      assert.equal(fetch.calls.length, 0, `${method} ${p} ${upstream.status}`);
    }
  });

  test("the Spanish fallback of an English twin is probed by convention, not by its head link", async () => {
    // phonometry's Spanish API pages link the ENGLISH twin in their head; the
    // convention candidate of the Spanish URL is what decides.
    const es = "/phonometry/es/reference/api/hearing/occupational-exposure/";
    const fetch = mockFetch(() => notFound());
    const r = req(es);
    const upstream = html();
    assert.equal(
      await announceTwin(r, new URL(r.url), upstream, fetch),
      upstream,
    );
    assert.equal(fetch.calls[0].input, `${ORIGIN}${es}index.md`);
  });

  test("probeTwin is the probe markdownTwin makes", async () => {
    const a = mockFetch(() => twinResponse());
    const b = mockFetch(() => twinResponse());
    const r = req(page, { accept: ACCEPTS.M });
    assert.equal(await probeTwin(new URL(r.url), a), twin);
    assert.equal(await markdownTwin(r, new URL(r.url), b), twin);
    assert.deepEqual(a.calls, b.calls);
  });
});

// ── the whole handler, with fetch and Analytics Engine mocked ───────────────

/**
 * Runs a worker module's fetch handler with global fetch replaced by
 * `respond` and an Analytics Engine binding that records the datapoints.
 */
async function run(mod, request, respond) {
  const fetch = mockFetch(respond);
  const points = [];
  const env = {
    REQS: {
      writeDataPoint: (p) => {
        points.push(p);
      },
    },
  };
  const saved = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    const response = await mod.fetch(request, env);
    return { response, calls: fetch.calls, points };
  } finally {
    globalThis.fetch = saved;
  }
}

/**
 * The GitHub side: twins exist for `withTwin` pages, every page answers 200
 * HTML, or, with `passThroughThrows`, the pass-through fetch throws (the
 * origin-error path) while the probe still answers. As the edge does live, a
 * conditional request (If-Modified-Since, If-None-Match) gets a 304 with no
 * Content-Type, and a Range request a 206: `text/html` for one range,
 * `multipart/byteranges` for several.
 */
function origin(
  withTwin,
  {
    passThroughThrows = false,
    rangeCoding = null,
    wholeFileThrows = false,
  } = {},
) {
  const upstream = [];
  const respond = (input, init) => {
    if (init?.redirect === "manual") {
      const p = new URL(input).pathname.replace(/index\.md$/, "");
      return withTwin.has(p) ? twinResponse() : notFound();
    }
    if (passThroughThrows) throw new TypeError("origin unreachable");
    const common = {
      "cache-control": "max-age=600",
      vary: "Accept-Encoding",
      "last-modified": LAST_MODIFIED,
      etag: ETAG,
      "cf-cache-status": "HIT",
    };
    const range = input.headers.get("range");
    if (wholeFileThrows && !range) throw new TypeError("origin unreachable");
    const coding = rangeCoding ? { "content-encoding": rangeCoding } : {};
    let res;
    if (
      input.headers.has("if-modified-since") ||
      input.headers.has("if-none-match")
    ) {
      res = new Response(null, { status: 304, headers: common });
    } else if (range?.includes(",")) {
      res = new Response(
        "--B\r\ncontent-type: text/html\r\n\r\n<!do\r\n--B--\r\n",
        {
          status: 206,
          headers: {
            "content-type": "multipart/byteranges; boundary=B",
            ...coding,
            ...common,
          },
        },
      );
    } else if (range) {
      res = new Response("<!doctype", {
        status: 206,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-range": "bytes 0-8/34",
          ...coding,
          ...common,
        },
      });
    } else {
      res = new Response("<!doctype html><title>page</title>", {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...coding,
          ...common,
        },
      });
    }
    // As the runtime does: a HEAD answer has no body at all.
    if (input.method === "HEAD") {
      res = new Response(null, { status: res.status, headers: res.headers });
    }
    upstream.push(res);
    return res;
  };
  respond.upstream = upstream;
  return respond;
}

const WITH_TWIN = new Set([
  "/phonometry/start/getting-started/",
  "/mikroscope/",
  "/libgen-mcp/how-search-works/",
  "/ghchronicle/es/card/",
]);
const PAGES = [
  ...WITH_TWIN,
  "/",
  "/phonometry/",
  "/phonometry/es/reference/api/hearing/occupational-exposure/",
  "/gitlab-mcp-server/",
  "/cs-routeros-bouncer/getting-started/quickstart/",
  "/Cloudflare-DNS-Updater/configuration/",
  "/phonometry/start/getting-started",
  "/phonometry/start/getting-started/index.md",
  "/phonometry/start/getting-started/?utm_source=x",
  "/mikroscope/start/walkthrough/index.html",
  "/robots.txt",
  "/llms.txt",
];

describe("worker.fetch", () => {
  test("Markdown-preferring request on a page with a twin: 302, logged as markdown-negotiation", async () => {
    for (const method of ["GET", "HEAD"]) {
      const { response, calls, points } = await run(
        worker,
        req("/phonometry/start/getting-started/?utm_source=x", {
          accept: ACCEPTS.MH,
          method,
        }),
        origin(WITH_TWIN),
      );
      assert.equal(response.status, 302, method);
      assert.equal(
        response.headers.get("location"),
        `${ORIGIN}/phonometry/start/getting-started/index.md`,
      );
      assert.equal(response.headers.get("vary"), "Accept");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(calls.length, 1, "the probe only, no pass-through");
      assert.equal(points.length, 1);
      const [point] = points;
      assert.deepEqual(point.indexes, ["page"]);
      assert.equal(point.blobs.length, 20);
      assert.equal(point.doubles.length, 9);
      assert.equal(point.blobs[0], "/phonometry/start/getting-started/");
      assert.equal(point.blobs[10], "302");
      assert.equal(point.blobs[11], "markdown-negotiation");
      assert.equal(point.blobs[12], ACCEPTS.MH);
      assert.equal(point.blobs[13], method);
      assert.equal(point.blobs[18], "utm_source=x");
    }
  });

  test("Markdown-preferring request on a page with no twin: probe, the pass-through, the announcement probe", async () => {
    const respond = origin(WITH_TWIN);
    const request = req("/gitlab-mcp-server/", { accept: ACCEPTS.M });
    const { response, calls, points } = await run(worker, request, respond);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].init.redirect, "manual");
    assert.equal(calls[1].input, request);
    assert.deepEqual(calls[1].init, { cf: { cacheEverything: true } });
    // The announcement asks again, of the entry the first probe just filled.
    assert.deepEqual(calls[2], calls[0]);
    // The probe and the pass-through fill the edge cache the same way, so a
    // probe leaves the shared `<page>/index.md` entry as a direct request would.
    assert.deepEqual(calls[0].init.cf, calls[1].init.cf);
    assert.equal(
      response,
      respond.upstream[0],
      "the origin's response, untouched",
    );
    assert.equal(
      response.headers.get("vary"),
      "Accept-Encoding",
      "no twin: GitHub's Vary as it came",
    );
    assert.equal(points[0].blobs[10], "200");
    assert.equal(points[0].blobs[11], "HIT");
  });

  test("a throwing probe falls through to the pass-through", async () => {
    const request = req("/phonometry/start/getting-started/", {
      accept: ACCEPTS.M,
    });
    const upstream = new Response("html", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    const { response, calls } = await run(worker, request, (input, init) => {
      if (init?.redirect === "manual") throw new TypeError("network down");
      return upstream;
    });
    assert.equal(
      calls.length,
      3,
      "negotiation probe, pass-through, announcement probe",
    );
    assert.equal(response, upstream);
  });

  test("the legacy /assets/pdf/ redirect wins whatever the Accept, with no probe", async () => {
    const { response, calls, points } = await run(
      worker,
      req("/assets/pdf/x/", { accept: ACCEPTS.M }),
      origin(WITH_TWIN),
    );
    assert.equal(response.status, 301);
    assert.equal(response.headers.get("location"), "https://jmrp.io/pdf/x/");
    assert.equal(calls.length, 0);
    assert.equal(points[0].blobs[11], "legacy-redirect");
  });

  test("a request that does not prefer Markdown: one pass-through fetch, the origin's response as is", async () => {
    for (const page of PAGES) {
      for (const [id, accept] of Object.entries(ACCEPTS)) {
        if (MARKDOWN_IDS.has(id)) continue;
        for (const method of ["GET", "HEAD"]) {
          const respond = origin(WITH_TWIN);
          const request = req(page, { accept, method });
          const { response, calls } = await run(worker, request, respond);
          const at = `${method} ${id} ${page}`;
          const pathname = new URL(`${ORIGIN}${page}`).pathname;
          const slash = pathname.endsWith("/");
          assert.equal(calls.length, slash ? 2 : 1, at);
          assert.equal(calls[0].input, request, at);
          assert.deepEqual(
            calls[0].init,
            { cf: { cacheEverything: true } },
            at,
          );
          if (slash)
            assert.equal(calls[1].input, `${ORIGIN}${pathname}index.md`, at);
          if (WITH_TWIN.has(pathname)) {
            assert.notEqual(response, respond.upstream[0], at);
            assert.equal(
              response.headers.get("link"),
              `<${ORIGIN}${pathname}index.md>; rel="alternate"; type="text/markdown"`,
              at,
            );
            assert.equal(
              response.headers.get("vary"),
              "Accept-Encoding, Accept",
              at,
            );
          } else {
            assert.equal(response, respond.upstream[0], at);
            assert.equal(
              response.headers.get("vary"),
              respond.upstream[0].headers.get("vary"),
              at,
            );
          }
        }
      }
    }
  });

  test("a Range answer cut from the compressed copy: the whole file, never a fragment nothing can decode", async () => {
    // Measured live on 2026-11-04: the edge stores the gzip GitHub sends and
    // cuts the range from it, so a client that does not take gzip got a 206
    // with an empty body, and one that does got a piece of a gzip stream.
    // RFC 9110 section 14.2 lets a server ignore Range; the whole file is
    // right for every client.
    for (const page of PAGES) {
      const pathname = new URL(`${ORIGIN}${page}`).pathname;
      for (const method of ["GET", "HEAD"]) {
        for (const [name, headers] of Object.entries(RANGES)) {
          const respond = origin(WITH_TWIN, { rangeCoding: "gzip" });
          const { response, calls, points } = await run(
            worker,
            new Request(req(page, { accept: ACCEPTS.B, method, headers }), {
              redirect: "manual",
            }),
            respond,
          );
          const at = `${method} ${name} ${page}`;
          assert.equal(response.status, 200, at);
          assert.equal(response.headers.has("content-range"), false, at);
          assert.equal(response.headers.get("content-encoding"), "gzip", at);
          if (method === "GET") {
            assert.equal(
              await response.text(),
              "<!doctype html><title>page</title>",
              at,
            );
          }
          // A page is not a listed type, so its Range is never sent: one
          // pass-through for the whole page, and no fragment to release.
          const passes = calls.filter(
            ({ init }) => init?.redirect !== "manual",
          );
          assert.equal(passes.length, 1, at);
          assert.equal(passes[0].input.headers.has("range"), false, at);
          assert.equal(passes[0].input.method, method, at);
          assert.equal(passes[0].input.redirect, "manual", at);
          assert.deepEqual(passes[0].init.cf, EDGE_CACHE_CF, at);
          assert.equal(points.length, 1, at);
          assert.equal(points[0].blobs[10], "200", at);
          if (WITH_TWIN.has(pathname)) {
            assert.equal(
              response.headers.get("vary"),
              "Accept-Encoding, Accept",
              at,
            );
            assert.match(response.headers.get("link"), /rel="alternate"/, at);
          } else {
            assert.equal(response, respond.upstream[0], at);
            assert.equal(response.headers.get("vary"), "Accept-Encoding", at);
          }
        }
      }
    }
  });

  test("the whole-file request drops Range and If-Range, and keeps every other header", async () => {
    // An If-None-Match that does not match is why this request got a 206 and
    // not a 304, and it must still be there when the whole file is asked for.
    const answers = [
      new Response("x", { status: 206, headers: { "content-encoding": "br" } }),
      new Response("whole", {
        status: 200,
        headers: { "content-encoding": "br" },
      }),
    ];
    const { calls } = await run(
      worker,
      req("/phonometry/llms.txt", {
        headers: {
          range: "bytes=0-8",
          "if-range": ETAG,
          "if-none-match": '"another"',
          "accept-encoding": "identity",
          "user-agent": "a client",
        },
      }),
      () => answers.shift(),
    );
    assert.equal(calls.length, 2);
    const { headers } = calls[1].input;
    assert.equal(headers.has("range"), false);
    assert.equal(headers.has("if-range"), false);
    assert.equal(headers.get("accept-encoding"), "identity");
    assert.equal(headers.get("user-agent"), "a client");
    assert.equal(headers.get("if-none-match"), '"another"');
  });

  test("a 206 that is not compressed stays a 206 on a listed type, with one pass-through", async () => {
    for (const file of [
      "/phonometry/media/clip.webm",
      "/phonometry/media/CLIP.WEBM",
      "/a/b.pdf",
      "/a/f.woff2",
      "/a/i.png",
    ]) {
      for (const rangeCoding of [null, "identity", "IDENTITY"]) {
        for (const [name, headers] of Object.entries(RANGES)) {
          const respond = origin(WITH_TWIN, { rangeCoding });
          const { response, calls } = await run(
            worker,
            req(file, { headers }),
            respond,
          );
          const at = `${file} ${rangeCoding} ${name}`;
          assert.equal(response.status, 206, at);
          assert.equal(calls.length, 1, at);
          assert.equal(response, respond.upstream[0], at);
        }
      }
    }
  });

  test("a Range the edge rejects: the whole file, never a 502", async () => {
    // Cloudflare throws on some ranges instead of answering them
    // (`bytes=-0,-0`, measured 2026-11-05; the origin answers 416). On a text
    // type the Range is never sent, so nothing throws; on a listed type the
    // request is sent once more without it.
    const rejectRange = (input, init) => {
      if (init?.redirect !== "manual" && input.headers.has("range")) {
        throw new TypeError("rejected range");
      }
      return new Response("whole", { status: 200 });
    };
    // bytes=-0,-0 is no longer sent on at all; a valid range the edge throws
    // on still gets the whole file through the retry.
    for (const [file, range, sends] of [
      ["/phonometry/llms.txt", "bytes=-0,-0", 1],
      ["/phonometry/media/clip.webm", "bytes=-0,-0", 1],
      ["/phonometry/media/clip.webm", "bytes=0-99", 2],
    ]) {
      for (const method of ["GET", "HEAD"]) {
        const { response, calls } = await run(
          worker,
          req(file, { method, headers: { range } }),
          rejectRange,
        );
        const at = `${method} ${file} ${range}`;
        assert.equal(response.status, 200, at);
        assert.equal(calls.length, sends, at);
        assert.equal(calls.at(-1).input.headers.has("range"), false, at);
        assert.equal(calls.at(-1).input.headers.has("if-range"), false, at);
      }
    }
  });

  test("a Range is sent on only when every part of it is valid, on a listed type", async () => {
    // An empty suffix, a first byte after the last or a malformed part are
    // answered wrongly by the edge (a 502, an empty 206, a 416): the whole
    // file is sent instead. Valid single and multiple ranges reach the edge.
    const file = "/phonometry/media/clip.webm";
    for (const [range, kept] of [
      ["bytes=0-99", true],
      ["bytes=100-", true],
      ["bytes=-100", true],
      ["bytes=5-5", true],
      ["bytes=-0,-0", false],
      ["bytes=0-3,-0", false],
      ["bytes=0-1,4-5", true],
      ["bytes=0-3,-4", true],
      ["bytes=-0", false],
      ["bytes=5-1", false],
      ["bytes=-", false],
      ["items=0-1", false],
    ]) {
      const { calls } = await run(
        worker,
        req(file, { headers: { range } }),
        () => new Response("whole", { status: 200 }),
      );
      assert.equal(calls[0].input.headers.has("range"), kept, range);
    }
  });

  test("a 206 that is not compressed on a type outside the list: the whole file (F07)", async () => {
    // sitemap-index.xml, pagefind-entry.json and BingSiteAuth.xml are too small
    // for GitHub to gzip, so their 206 was a real one; the list makes the rule
    // independent of the label, at the price of a whole download for them.
    for (const file of [
      "/robots.txt",
      "/phonometry/sitemap-index.xml",
      "/phonometry/pagefind/pagefind-entry.json",
      "/BingSiteAuth.xml",
      "/x/file.webm.txt",
      "/x/noextension",
    ]) {
      for (const rangeCoding of [null, "identity"]) {
        for (const [name, headers] of Object.entries(RANGES)) {
          for (const method of ["GET", "HEAD"]) {
            const respond = origin(WITH_TWIN, { rangeCoding });
            const { response, calls, points } = await run(
              worker,
              req(file, { method, headers }),
              respond,
            );
            const at = `${method} ${file} ${rangeCoding} ${name}`;
            assert.equal(response.status, 200, at);
            assert.equal(response, respond.upstream[0], at);
            assert.equal(calls.length, 1, at);
            assert.equal(calls[0].input.headers.has("range"), false, at);
            assert.equal(calls[0].input.method, method, at);
            assert.equal(points[0].blobs[10], "200", at);
          }
        }
      }
    }
  });

  test("a compressed answer that is not a 206 is never asked for twice", async () => {
    // Almost every answer the edge gives is compressed, so this is the guard
    // on the cost of the rule above: one subrequest more only for the 206.
    for (const status of [200, 404]) {
      for (const headers of [{}, { range: "bytes=0-8" }]) {
        const upstream = new Response("<!doctype html>", {
          status,
          headers: { "content-type": "text/plain", "content-encoding": "gzip" },
        });
        const { response, calls } = await run(
          worker,
          req("/robots.txt", { headers }),
          () => upstream,
        );
        assert.equal(calls.length, 1, `${status} ${JSON.stringify(headers)}`);
        assert.equal(response, upstream);
      }
    }
  });

  test("an edge that answers a compressed 206 twice is asked twice, never more", async () => {
    let passes = 0;
    const { response } = await run(
      worker,
      req("/robots.txt", { headers: { range: "bytes=0-8" } }),
      () => {
        passes += 1;
        if (passes > 3) throw new TypeError("looping");
        return new Response("x", {
          status: 206,
          headers: { "content-encoding": "gzip" },
        });
      },
    );
    assert.equal(passes, 2);
    assert.equal(response.status, 206);
  });

  test("a 416 measured against the gzip: the whole file, so a resume cannot pass for a complete download", async () => {
    // Live on 2026-11-04, llms.txt of 67420 bytes, 12408 of gzip: bytes=20000-
    // answered 416 with `bytes */12408`, and curl -C - and wget -c took that
    // for a finished file, leaving 20000 bytes and exit 0.
    for (const method of ["GET", "HEAD"]) {
      const first = new Response(method === "GET" ? "" : null, {
        status: 416,
        headers: { "content-range": "bytes */12408" },
      });
      const whole = new Response(method === "GET" ? "the whole file" : null, {
        status: 200,
        headers: { "content-type": "text/plain", "content-encoding": "gzip" },
      });
      const answers = [first, whole];
      const { response, calls, points } = await run(
        worker,
        req("/phonometry/llms.txt", {
          method,
          headers: { range: "bytes=20000-", "if-range": ETAG },
        }),
        () => answers.shift(),
      );
      assert.equal(response, whole, method);
      assert.equal(calls.length, 2, method);
      assert.equal(calls[1].input.headers.has("range"), false, method);
      assert.equal(calls[1].input.headers.has("if-range"), false, method);
      assert.deepEqual(calls[1].init.cf, EDGE_CACHE_CF, method);
      assert.equal(points[0].blobs[10], "200", method);
    }
  });

  test("a 416 on an HTML page: the whole page, though it reaches the Worker with no Content-Encoding", async () => {
    // Measured live on 2026-11-04 with a version at 0%: on all eight HTML pages
    // tried, a range past the gzip kept its 416 under a check of the label
    // alone, where txt, md, JS and SVG were corrected.
    const page = new Response("<!doctype html>", {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        vary: "Accept-Encoding",
      },
    });
    const answers = [
      new Response("", {
        status: 416,
        headers: { "content-range": "bytes */33287" },
      }),
      page,
    ];
    const { response, calls } = await run(
      worker,
      req("/gitlab-mcp-server/page.html", {
        headers: { range: "bytes=60000-" },
      }),
      () => answers.shift(),
    );
    assert.equal(calls.length, 2);
    assert.equal(response, page);
  });

  test("a 416 for a file the edge holds as it is stands, and the whole file is released", async () => {
    for (const [status, coding] of [
      [200, null],
      [200, "identity"],
      [404, "gzip"],
      [503, null],
    ]) {
      const first = new Response("", {
        status: 416,
        headers: { "content-range": "bytes */4096" },
      });
      const whole = new Response("the file", {
        status,
        headers: coding ? { "content-encoding": coding } : {},
      });
      const answers = [first, whole];
      const { response, calls } = await run(
        worker,
        req("/phonometry/media/clip.webm", {
          headers: { range: "bytes=99999-" },
        }),
        () => answers.shift(),
      );
      const at = `${status} ${coding}`;
      assert.equal(response, first, at);
      assert.equal(calls.length, 2, at);
      assert.equal(whole.bodyUsed, true, at);
    }
  });

  test("the whole file failing after a 416 is the origin error it would be on its own", async () => {
    let passes = 0;
    const { response, points } = await run(
      worker,
      req("/robots.txt", { headers: { range: "bytes=99999-" } }),
      () => {
        passes += 1;
        if (passes === 1) return new Response("", { status: 416 });
        throw new TypeError("origin unreachable");
      },
    );
    assert.equal(response.status, 502);
    assert.equal(points[0].blobs[11], "origin-error");
  });

  test("a body that cannot be cancelled changes nothing about the answer", async () => {
    const stuck = (status, headers) => {
      const res = new Response("x", { status, headers });
      Object.defineProperty(res, "body", {
        value: { cancel: () => Promise.reject(new Error("cannot cancel")) },
      });
      return res;
    };
    for (const firstStatus of [206, 416]) {
      const answers = [
        stuck(firstStatus, { "content-encoding": "gzip" }),
        new Response("whole", {
          status: 200,
          headers: { "content-encoding": "gzip" },
        }),
      ];
      const { response } = await run(
        worker,
        req("/robots.txt", { headers: { range: "bytes=0-8" } }),
        () => answers.shift(),
      );
      assert.equal(response.status, 200, String(firstStatus));
    }
    // the same for the whole file of a 416 that stands (a listed type)
    const answers = [new Response("", { status: 416 }), stuck(200, {})];
    const { response } = await run(
      worker,
      req("/phonometry/media/clip.webm", {
        headers: { range: "bytes=99999-" },
      }),
      () => answers.shift(),
    );
    assert.equal(response.status, 416);
  });

  test("another method's 206 or 416 is passed on: its body is never asked for twice", async () => {
    for (const method of ["POST", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
      for (const [status, headers] of [
        [206, { "content-encoding": "gzip" }],
        [416, {}],
      ]) {
        const upstream = new Response("x", { status, headers });
        const body = ["POST", "PUT", "PATCH"].includes(method) ? "data" : null;
        const { response, calls } = await run(
          worker,
          req("/robots.txt", { method, body, headers: { range: "bytes=0-8" } }),
          () => upstream,
        );
        assert.equal(response, upstream, `${method} ${status}`);
        assert.equal(calls.length, 1, `${method} ${status}`);
      }
    }
  });

  test("a conditional Range request still gets its 304, with one pass-through", async () => {
    for (const conditional of Object.values(CONDITIONAL)) {
      const respond = origin(WITH_TWIN, { rangeCoding: "gzip" });
      const { response, calls } = await run(
        worker,
        req("/robots.txt", { headers: { ...conditional, range: "bytes=0-8" } }),
        respond,
      );
      assert.equal(response.status, 304);
      assert.equal(calls.length, 1);
    }
  });

  test("the whole-file request failing is the origin error it would be on its own", async () => {
    const { response, points } = await run(
      worker,
      req("/robots.txt", { headers: { range: "bytes=0-8" } }),
      origin(WITH_TWIN, { rangeCoding: "gzip", wholeFileThrows: true }),
    );
    assert.equal(response.status, 502);
    assert.equal(points.length, 1);
    assert.equal(points[0].blobs[10], "502");
    assert.equal(points[0].blobs[11], "origin-error");
  });

  test("a revalidation or a Range request: the 304 carries the Vary of the 200 to the same request, and no Link; a Range gets the whole page", async () => {
    // RFC 9110 sections 15.4.5 and 15.3.7. A cache that freshens its stored
    // page with the 304 takes the 304's Vary (RFC 9111 section 4.3.4), so a
    // 304 with GitHub's Vary alone would drop Accept at every revalidation.
    // Since F07 no page is a listed type, so a Range request for one gets the
    // whole page (as the compressed ones already did), Link and Vary included.
    const variants = [
      ...Object.entries(CONDITIONAL).map(([name, headers]) => [
        304,
        name,
        headers,
      ]),
      ...Object.entries(RANGES).map(([name, headers]) => [200, name, headers]),
    ];
    for (const page of PAGES) {
      const pathname = new URL(`${ORIGIN}${page}`).pathname;
      for (const [id, accept] of Object.entries(ACCEPTS)) {
        if (MARKDOWN_IDS.has(id)) continue;
        for (const method of ["GET", "HEAD"]) {
          const plain = await run(
            worker,
            req(page, { accept, method }),
            origin(WITH_TWIN),
          );
          assert.equal(plain.response.status, 200);
          for (const [status, name, headers] of variants) {
            const respond = origin(WITH_TWIN);
            const { response, calls } = await run(
              worker,
              req(page, { accept, method, headers }),
              respond,
            );
            const at = `${method} ${id} ${name} ${page}`;
            const whole = status === 200;
            const answer = respond.upstream[0];
            assert.equal(response.status, status, at);
            assert.equal(
              response.headers.get("vary"),
              plain.response.headers.get("vary"),
              at,
            );
            assert.equal(
              response.headers.get("link"),
              whole ? plain.response.headers.get("link") : null,
              at,
            );
            assert.equal(
              calls.length,
              1 + (pathname.endsWith("/") ? 1 : 0),
              at,
            );
            if (WITH_TWIN.has(pathname)) {
              assert.notEqual(response, answer, at);
              assert.equal(
                response.headers.get("vary"),
                "Accept-Encoding, Accept",
                at,
              );
              assert.deepEqual(
                [...response.headers].filter(
                  ([k]) => k !== "vary" && k !== "link",
                ),
                [...answer.headers].filter(([k]) => k !== "vary"),
                at,
              );
            } else {
              assert.equal(response, answer, at);
              assert.equal(response.headers.get("vary"), "Accept-Encoding", at);
            }
          }
        }
      }
    }
  });

  test("a Markdown-preferring revalidation of a page with a twin still gets the 302", async () => {
    for (const headers of Object.values(CONDITIONAL)) {
      const { response, calls } = await run(
        worker,
        req("/phonometry/start/getting-started/", {
          accept: ACCEPTS.M,
          headers,
        }),
        origin(WITH_TWIN),
      );
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("vary"), "Accept");
      assert.equal(calls.length, 1, "the probe only, no pass-through");
    }
  });

  // Two tests compare against the Worker as it was before decision D6
  // (2026-10-29). That copy is not in the repository: get it with
  // `git show <commit>:workers/docs-edge/worker.js` from a commit before the
  // change you are checking, and point DOCS_EDGE_BEFORE at it.
  const backup = process.env.DOCS_EDGE_BEFORE ?? "";
  const noBackup =
    backup && existsSync(backup)
      ? false
      : "no earlier copy of the Worker: set DOCS_EDGE_BEFORE to compare against one";

  // URL forms beyond the page list: percent-encoding, doubled slashes, a path
  // that reads as a //host, the edges of the legacy /assets/pdf/ tree, index
  // files, a trailing slash after a file name, queries.
  const FORMS = [
    "/x/",
    "/phonometry/caf%C3%A9/",
    "//evil.example/",
    "/a//b/",
    "/a/b%2Fc/",
    "/assets/pdf",
    "/assets/pdf/",
    "/assets/pdfx/",
    "/assets/pdf/a/b/",
    "/assets/pdf/x",
    "/x/index.md/",
    "/x/index.html",
    "/x/index.md",
    "/x?y=1",
    "/x/?y=1",
  ];
  const METHODS = ["GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"];

  test(
    "against the pre-D6 worker: same fetch, same response, same datapoint for every request it does not negotiate",
    { skip: noBackup },
    async () => {
      const old = (await import(pathToFileURL(backup).href)).default;
      // Wall-clock doubles: 7 (worker time) and 9 (request time).
      const stable = (p) => ({
        ...p,
        doubles: p.doubles.filter((_, i) => i !== 6 && i !== 8),
      });
      const pass = (calls) =>
        calls.filter((c) => c.init?.redirect !== "manual");
      const host = (input) =>
        new URL(typeof input === "string" ? input : input.url).host;
      // The origin answers (twins on WITH_TWIN), the pass-through throws (the
      // 502 origin-error path), or no page has a twin (every probe a 404);
      // and the origin answers a revalidation with a 304, or a Range request
      // with a 206.
      const MODES = [
        ["answers", WITH_TWIN, false, {}],
        ["throws", WITH_TWIN, true, {}],
        ["no twin", new Set(), false, {}],
        ["revalidates", WITH_TWIN, false, CONDITIONAL["If-Modified-Since"]],
        ["ranges", WITH_TWIN, false, RANGES["one range"]],
      ];
      let compared = 0;
      const announcedBy = new Map(); // status -> how many announced copies
      for (const [mode, twins, passThroughThrows, headers] of MODES) {
        for (const page of [...PAGES, ...FORMS]) {
          for (const [id, accept] of Object.entries(ACCEPTS)) {
            for (const method of METHODS) {
              const pathname = new URL(`${ORIGIN}${page}`).pathname;
              const readOnly = method === "GET" || method === "HEAD";
              const mayProbe =
                MARKDOWN_IDS.has(id) &&
                readOnly &&
                pathname.endsWith("/") &&
                !pathname.startsWith("/assets/pdf/");
              if (mayProbe && twins.has(pathname)) continue; // negotiated: tested above
              const at = `${mode} ${method} ${id} ${page}`;
              const body = readOnly ? null : "name=value";
              const legacy = pathname.startsWith("/assets/pdf/");
              // F07: a Range request for a type outside RANGE_SAFE_EXTENSIONS
              // (every URL here) gets the whole file, so it is compared with
              // what the pre-D6 worker answers to the same request without Range.
              const wholeFile = mode === "ranges" && readOnly && !legacy;
              const a = origin(twins, { passThroughThrows });
              const b = origin(twins, { passThroughThrows });
              const requestA = req(page, {
                accept,
                method,
                body,
                headers: wholeFile ? {} : headers,
              });
              const requestB = req(page, { accept, method, body, headers });
              const before = await run(old, requestA, a);
              const after = await run(worker, requestB, b);
              // The same pass-through: as many fetches (one more for the whole
              // file), of the request itself, with the same options.
              assert.equal(
                pass(after.calls).length,
                pass(before.calls).length + (wholeFile ? 1 : 0),
                at,
              );
              for (const c of pass(before.calls))
                assert.equal(c.input, requestA, at);
              const [first, ...rest] = pass(after.calls);
              if (first) assert.equal(first.input, requestB, at);
              for (const c of rest) {
                assert.equal(c.input.url, requestB.url, at);
                assert.equal(c.input.method, method, at);
                assert.equal(c.input.headers.has("range"), false, at);
              }
              for (const c of [...pass(before.calls), ...pass(after.calls)]) {
                assert.deepEqual(c.init, { cf: { cacheEverything: true } }, at);
              }
              // The one difference since 2026-10-31: a GET or HEAD for a slash
              // page the origin answered (not the legacy tree, not a throwing
              // pass-through) is probed for its twin, and gets a copy of the
              // origin's response with the Link header when the twin exists,
              // and (N13, 2026-11-03) `Accept` appended to GitHub's Vary; the
              // 304 and the 206 of that page get the same Vary and no Link.
              // Since F07 the probe starts beside the pass-through, so a slash
              // GET or HEAD is probed even when the pass-through throws.
              const announces = readOnly && pathname.endsWith("/") && !legacy;
              const announced =
                announces && !passThroughThrows && twins.has(pathname);
              // The same answer: the origin's own response object, or an equal
              // one the worker built (the legacy 301, the 502).
              const fromOrigin = a.upstream.indexOf(before.response);
              if (announced) {
                const status = before.response.status;
                announcedBy.set(status, (announcedBy.get(status) ?? 0) + 1);
                assert.equal(b.upstream.includes(after.response), false, at);
                assert.equal(after.response.status, before.response.status, at);
                assert.deepEqual(
                  [...after.response.headers].filter(
                    ([k]) => k !== "link" && k !== "vary",
                  ),
                  [...before.response.headers].filter(([k]) => k !== "vary"),
                  at,
                );
                if (before.response.status === 200) {
                  assert.equal(
                    after.response.headers.get("link"),
                    `<${ORIGIN}${pathname}index.md>; rel="alternate"; type="text/markdown"`,
                    at,
                  );
                } else {
                  assert.equal(after.response.headers.has("link"), false, at);
                }
                assert.equal(
                  before.response.headers.get("vary"),
                  "Accept-Encoding",
                  at,
                );
                assert.equal(
                  after.response.headers.get("vary"),
                  "Accept-Encoding, Accept",
                  at,
                );
                assert.equal(
                  await after.response.text(),
                  await before.response.text(),
                  at,
                );
              } else if (fromOrigin === -1) {
                assert.equal(b.upstream.includes(after.response), false, at);
                assert.equal(after.response.status, before.response.status, at);
                assert.deepEqual(
                  [...after.response.headers],
                  [...before.response.headers],
                  at,
                );
                assert.equal(
                  await after.response.text(),
                  await before.response.text(),
                  at,
                );
              } else {
                assert.equal(
                  after.response,
                  b.upstream[fromOrigin + (wholeFile ? 1 : 0)],
                  at,
                );
              }
              // Without a twin (or off the announcement path) the Vary is the
              // pre-D6 one: GitHub's own on a page, none on the 301 and 502.
              if (!announced) {
                assert.equal(
                  after.response.headers.get("vary"),
                  before.response.headers.get("vary"),
                  at,
                );
              }
              assert.deepEqual(
                after.points.map(stable),
                before.points.map(stable),
                at,
              );
              // The request body is never read, so the pass-through still has it.
              assert.equal(requestB.bodyUsed, false, at);
              // A negotiation probe only for a Markdown-preferring GET/HEAD on a
              // slash path outside the legacy tree, an announcement probe for
              // every answered slash GET/HEAD, and every fetch stays on
              // docs.jmrp.io.
              assert.equal(
                after.calls.length - pass(after.calls).length,
                (mayProbe ? 1 : 0) + (announces ? 1 : 0),
                at,
              );
              for (const c of after.calls)
                assert.equal(host(c.input), "docs.jmrp.io", at);
              compared += 1;
            }
          }
        }
      }
      assert.ok(compared > 4000, `${compared} requests compared`);
      // Each kind of announced answer was compared, not only the 200. No 206
      // since F07: a Range request for a page gets the whole page.
      assert.deepEqual(
        [...announcedBy.keys()].sort((a, b) => a - b),
        [200, 304],
        JSON.stringify([...announcedBy]),
      );
    },
  );

  test(
    "the probe fills the edge cache with the deployed pass-through's options, on every slash page",
    { skip: noBackup },
    async () => {
      // The pre-D6 worker's pass-through options are what fills `<page>/index.md`
      // today; a probe of that URL must store exactly what they store.
      const old = (await import(pathToFileURL(backup).href)).default;
      for (const page of [...PAGES, ...FORMS]) {
        const pathname = new URL(`${ORIGIN}${page}`).pathname;
        if (!pathname.endsWith("/") || pathname.startsWith("/assets/pdf/"))
          continue;
        for (const twins of [WITH_TWIN, new Set()]) {
          const direct = await run(
            old,
            req(`${pathname}index.md`),
            origin(twins),
          );
          const negotiated = await run(
            worker,
            req(page, { accept: ACCEPTS.M }),
            origin(twins),
          );
          const probes = negotiated.calls.filter(
            (c) => c.init?.redirect === "manual",
          );
          // One when the twin exists (the 302); two when it does not (the
          // negotiation, then the announcement after the pass-through).
          assert.equal(probes.length, twins.has(pathname) ? 1 : 2, page);
          assert.equal(direct.calls.length, 1, page);
          for (const probe of probes) {
            assert.equal(probe.input, `${ORIGIN}${pathname}index.md`, page);
            assert.deepEqual(probe.init.cf, direct.calls[0].init.cf, page);
          }
        }
      }
    },
  );
});

// ── F07 (2026-11-04): the probe beside the pass-through, its limit, its verdict ──

/** A Cache API namespace stand-in: match and put by URL, with call records. */
function memoryCache({ failMatch = false, failPut = false } = {}) {
  const entries = new Map();
  const log = [];
  return {
    entries,
    log,
    async match(key) {
      log.push(["match", String(key)]);
      if (failMatch) throw new Error("cache down");
      return entries.get(String(key))?.clone();
    },
    async put(key, response) {
      log.push(["put", String(key)]);
      if (failPut) throw new Error("cache down");
      entries.set(String(key), response);
    },
  };
}

/** Runs worker.fetch with a ctx whose waitUntil promises are awaited after. */
async function runWithCtx(request, respond, cache = null) {
  const fetch = mockFetch(respond);
  const points = [];
  const env = {
    REQS: {
      writeDataPoint: (p) => {
        points.push(p);
      },
    },
  };
  const deferred = [];
  const ctx = {
    waitUntil: (promise) => {
      deferred.push(promise);
    },
  };
  const savedFetch = globalThis.fetch;
  const savedCaches = globalThis.caches;
  const opened = [];
  globalThis.fetch = fetch;
  if (cache) {
    globalThis.caches = {
      open: async (name) => {
        opened.push(name);
        return cache;
      },
    };
  }
  try {
    const response = await worker.fetch(request, env, ctx);
    await Promise.all(deferred);
    return { response, calls: fetch.calls, points, deferred, opened };
  } finally {
    globalThis.fetch = savedFetch;
    if (cache) {
      if (savedCaches === undefined) delete globalThis.caches;
      else globalThis.caches = savedCaches;
    }
  }
}

describe("F07: the announcement probe runs beside the pass-through", () => {
  test("startTwinProbe: a running probe for a slash GET or HEAD, null and no subrequest otherwise", async () => {
    for (const method of ["GET", "HEAD"]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req("/mikroscope/", { method });
      const probe = startTwinProbe(r, new URL(r.url), fetch);
      assert.equal(await probe, `${ORIGIN}/mikroscope/index.md`, method);
    }
    for (const [method, p] of [
      ["POST", "/mikroscope/"],
      ["OPTIONS", "/mikroscope/"],
      ["GET", "/mikroscope"],
      ["GET", "/llms.txt"],
      ["HEAD", "/x/index.md"],
    ]) {
      const fetch = mockFetch(() => twinResponse());
      const r = req(p, { method, body: method === "POST" ? "x" : null });
      assert.equal(
        startTwinProbe(r, new URL(r.url), fetch),
        null,
        `${method} ${p}`,
      );
      assert.equal(fetch.calls.length, 0, `${method} ${p}`);
    }
  });

  test("the probe is asked before the pass-through has answered", async () => {
    // A pass-through that answers only once the probe has been sent: a handler
    // that waited for the pass-through before probing would never finish.
    const { promise: probeSent, resolve: probed } = Promise.withResolvers();
    const respond = async (input, init) => {
      if (init?.redirect === "manual") {
        probed();
        return twinResponse();
      }
      await probeSent;
      return new Response("<!doctype html>", {
        status: 200,
        headers: { "content-type": "text/html", vary: "Accept-Encoding" },
      });
    };
    const timeout = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error("sequential: the probe waited for the pass-through"),
          ),
        2000,
      ),
    );
    const { response } = await Promise.race([
      runWithCtx(req("/mikroscope/"), respond),
      timeout,
    ]);
    assert.equal(
      response.headers.get("link"),
      `<${ORIGIN}/mikroscope/index.md>; rel="alternate"; type="text/markdown"`,
    );
    assert.equal(response.headers.get("vary"), "Accept-Encoding, Accept");
  });

  test("the running probe is handed to waitUntil, and a slash path that answers 404 is probed too", async () => {
    const { response, calls, deferred } = await runWithCtx(
      req("/nothing-here/"),
      () => notFound(),
    );
    assert.equal(response.status, 404);
    assert.equal(calls.filter((c) => c.init?.redirect === "manual").length, 1);
    assert.ok(deferred.length > 0);
  });

  test("announceTwin uses the probe it is handed and makes none of its own", async () => {
    const fetch = mockFetch(() => twinResponse());
    const r = req("/mikroscope/");
    const html = new Response("<p>", {
      status: 200,
      headers: { "content-type": "text/html", vary: "Accept-Encoding" },
    });
    const out = await announceTwin(
      r,
      new URL(r.url),
      html,
      fetch,
      Promise.resolve(`${ORIGIN}/mikroscope/index.md`),
    );
    assert.equal(out.headers.get("vary"), "Accept-Encoding, Accept");
    assert.equal(fetch.calls.length, 0);
    const none = await announceTwin(
      r,
      new URL(r.url),
      html,
      fetch,
      Promise.resolve(null),
    );
    assert.equal(none, html);
    assert.equal(fetch.calls.length, 0);
  });
});

describe("F07: the probe gives up after PROBE_TIMEOUT_MS", () => {
  test("the probe fetch carries an abort signal, and a probe past the limit means no twin", async () => {
    assert.equal(PROBE_TIMEOUT_MS, 1000);
    let signal;
    const fetch = mockFetch((input, init) => {
      signal = init.signal;
      return new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(init.signal.reason));
      });
    });
    const r = req("/mikroscope/", { accept: ACCEPTS.M });
    const started = Date.now();
    assert.equal(await markdownTwin(r, new URL(r.url), fetch), null);
    const took = Date.now() - started;
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, true);
    assert.ok(
      took >= PROBE_TIMEOUT_MS - 50 && took < PROBE_TIMEOUT_MS + 1500,
      `${took} ms`,
    );
  });

  test("a probe that answers in time is not aborted", async () => {
    const fetch = mockFetch(() => twinResponse());
    const r = req("/mikroscope/");
    assert.equal(
      await probeTwin(new URL(r.url), fetch),
      `${ORIGIN}/mikroscope/index.md`,
    );
    assert.equal(fetch.calls[0].init.signal.aborted, false);
  });
});

describe("F07: a literal 404 is remembered as 'no twin' for VERDICT_TTL_S", () => {
  const page = "/gitlab-mcp-server/";
  const key = `${ORIGIN}${page}index.md`;
  const opts = (cache, deferred = null) => ({
    verdicts: () => cache,
    defer: deferred
      ? (p) => {
          deferred.push(p);
        }
      : null,
  });

  test("a 404 stores a verdict; the next probe answers from it with no subrequest", async () => {
    const cache = memoryCache();
    const first = mockFetch(() => notFound());
    assert.equal(
      await probeTwin(new URL(`${ORIGIN}${page}`), first, opts(cache)),
      null,
    );
    assert.equal(first.calls.length, 1);
    const stored = cache.entries.get(key);
    assert.ok(stored, "verdict stored under the candidate URL");
    assert.equal(stored.status, 200);
    assert.equal(
      stored.headers.get("cache-control"),
      `public, max-age=${VERDICT_TTL_S}`,
    );
    assert.equal(VERDICT_TTL_S, 600);
    const second = mockFetch(() => twinResponse());
    assert.equal(
      await probeTwin(new URL(`${ORIGIN}${page}?q=1`), second, opts(cache)),
      null,
    );
    assert.equal(second.calls.length, 0, "answered from the verdict");
  });

  test("only a literal 404 is remembered: a twin, another status, a wrong type, a throw or a timeout are not", async () => {
    for (const respond of [
      () => twinResponse(),
      () => twinResponse(undefined, 500),
      () => twinResponse(undefined, 503),
      () => twinResponse(undefined, 301),
      () => twinResponse(undefined, 410),
      () => twinResponse("text/html"),
      () => {
        throw new TypeError("network down");
      },
      () => {
        throw new DOMException("timed out", "TimeoutError");
      },
    ]) {
      const cache = memoryCache();
      await probeTwin(
        new URL(`${ORIGIN}${page}`),
        mockFetch(respond),
        opts(cache),
      );
      assert.equal(cache.entries.size, 0, String(respond));
    }
  });

  test("an entry without the marker is not a verdict", async () => {
    const cache = memoryCache();
    cache.entries.set(key, new Response("whatever", { status: 200 }));
    const fetch = mockFetch(() => twinResponse());
    assert.equal(
      await probeTwin(new URL(`${ORIGIN}${page}`), fetch, opts(cache)),
      key,
    );
    assert.equal(fetch.calls.length, 1);
  });

  test("a failing cache costs the verdict, never the probe", async () => {
    for (const cache of [
      memoryCache({ failMatch: true }),
      memoryCache({ failPut: true }),
    ]) {
      const fetch = mockFetch(() => twinResponse());
      assert.equal(
        await probeTwin(new URL(`${ORIGIN}/mikroscope/`), fetch, opts(cache)),
        `${ORIGIN}/mikroscope/index.md`,
      );
      const missing = mockFetch(() => notFound());
      assert.equal(
        await probeTwin(new URL(`${ORIGIN}${page}`), missing, opts(cache)),
        null,
      );
    }
    const fetch = mockFetch(() => twinResponse());
    const throwing = { verdicts: () => Promise.reject(new Error("no cache")) };
    assert.equal(
      await probeTwin(new URL(`${ORIGIN}/mikroscope/`), fetch, throwing),
      `${ORIGIN}/mikroscope/index.md`,
    );
    const sync = {
      verdicts: () => {
        throw new Error("no cache");
      },
    };
    assert.equal(
      await probeTwin(new URL(`${ORIGIN}/mikroscope/`), fetch, sync),
      `${ORIGIN}/mikroscope/index.md`,
    );
  });

  test("with defer, storing the verdict is handed to it and not awaited", async () => {
    const cache = memoryCache();
    const deferred = [];
    assert.equal(
      await probeTwin(
        new URL(`${ORIGIN}${page}`),
        mockFetch(() => notFound()),
        opts(cache, deferred),
      ),
      null,
    );
    assert.equal(deferred.length, 1);
    await Promise.all(deferred);
    assert.ok(cache.entries.has(key));
  });

  test("the handler opens its own namespace, once, and never caches.default", async () => {
    const cache = memoryCache();
    const first = await runWithCtx(
      req(page, { accept: ACCEPTS.M }),
      origin(new Set()),
      cache,
    );
    assert.deepEqual(first.opened, [VERDICT_CACHE]);
    assert.equal(VERDICT_CACHE, "docs-edge-twin-verdicts");
    assert.ok(cache.entries.has(key));
    // The next request for that page: no probe at all, the HTML as GitHub sent it.
    const second = await runWithCtx(
      req(page, { accept: ACCEPTS.M }),
      origin(new Set()),
      cache,
    );
    assert.equal(
      second.calls.filter((c) => c.init?.redirect === "manual").length,
      0,
    );
    assert.equal(second.calls.length, 1);
    assert.equal(second.response.status, 200);
    assert.equal(second.response.headers.get("vary"), "Accept-Encoding");
    // A request that probes nothing opens nothing.
    const asset = await runWithCtx(
      req("/gitlab-mcp-server/llms.txt"),
      origin(new Set()),
      cache,
    );
    assert.deepEqual(asset.opened, []);
  });
});

describe("F07: Range on a type outside RANGE_SAFE_EXTENSIONS", () => {
  test("a real 416 on an unlisted type is answered with the whole file, even uncompressed", async () => {
    for (const method of ["GET", "HEAD"]) {
      const whole = new Response(method === "GET" ? "<?xml?>" : null, {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
      const answers = [
        new Response("", {
          status: 416,
          headers: { "content-range": "bytes */194" },
        }),
        whole,
      ];
      const { response, calls } = await run(
        worker,
        req("/phonometry/sitemap-index.xml", {
          method,
          headers: { range: "bytes=99999-" },
        }),
        () => answers.shift(),
      );
      assert.equal(response, whole, method);
      assert.equal(calls.length, 2, method);
    }
  });
});

describe("the visitor location headers stay at the edge (2026-11-04)", () => {
  const LOCATION = {
    "cf-ipcity": "Somewhere",
    "cf-ipcountry": "XX",
    "cf-ipcontinent": "EU",
    "cf-iplatitude": "1.0",
    "cf-iplongitude": "2.0",
    "cf-region": "Region",
    "cf-region-code": "RC",
    "cf-metro-code": "000",
    "cf-postal-code": "00000",
    "cf-timezone": "Etc/UTC",
  };
  const KEPT = {
    "cf-ray": "abc-MAD",
    "cf-connecting-ip": "192.0.2.1",
    "user-agent": "a client",
    "accept-language": "es",
  };

  test("the pass-through, and its whole-file request, leave them out and keep everything else", async () => {
    for (const method of ["GET", "HEAD", "POST", "PUT", "OPTIONS"]) {
      for (const headers of [{}, { range: "bytes=0-8" }]) {
        const body =
          method === "POST" || method === "PUT" ? "name=value" : null;
        const request = new Request(
          req("/robots.txt", {
            method,
            body,
            headers: { ...LOCATION, ...KEPT, ...headers },
          }),
          { redirect: "manual" },
        );
        const answers = [
          new Response("x", {
            status: headers.range ? 206 : 200,
            headers: { "content-encoding": "gzip" },
          }),
          new Response("whole", {
            status: 200,
            headers: { "content-encoding": "gzip" },
          }),
        ];
        const seen = [];
        const { calls, points } = await run(worker, request, async (input) => {
          seen.push(
            input.method === "GET" || input.method === "HEAD"
              ? null
              : await input.text(),
          );
          return answers.shift();
        });
        const at = `${method} ${JSON.stringify(headers)}`;
        const passes = calls.filter((c) => c.init?.redirect !== "manual");
        assert.ok(passes.length > 0, at);
        for (const { input } of passes) {
          assert.notEqual(input, request, at);
          for (const name of Object.keys(LOCATION))
            assert.equal(input.headers.has(name), false, `${at} ${name}`);
          for (const [name, value] of Object.entries(KEPT))
            assert.equal(input.headers.get(name), value, `${at} ${name}`);
          assert.equal(input.method, method, at);
          assert.equal(input.url, request.url, at);
          assert.equal(input.redirect, "manual", at);
        }
        if (body) assert.equal(seen[0], body, `${at}: the body reaches GitHub`);
        // The log reads the client's own request, as before.
        assert.equal(points[0].blobs[15], "192.0.2.1", at);
        assert.equal(points[0].blobs[14], "a client", at);
      }
    }
  });

  test("a request without them is forwarded as the very same object", async () => {
    const request = req("/robots.txt", { headers: KEPT });
    const { calls } = await run(
      worker,
      request,
      () => new Response("x", { status: 200 }),
    );
    assert.equal(calls[0].input, request);
  });

  test("the probe is a fetch of a bare URL, so it forwards none of the client's headers", async () => {
    const request = req("/mikroscope/", {
      accept: ACCEPTS.M,
      headers: { ...LOCATION, ...KEPT },
    });
    const { calls } = await run(worker, request, origin(WITH_TWIN));
    const probes = calls.filter((c) => c.init?.redirect === "manual");
    assert.equal(probes.length, 1);
    assert.equal(typeof probes[0].input, "string");
    assert.equal(probes[0].init.headers, undefined);
  });
});

// ── G1: one type list and one negotiation across the three Workers and the rules ──
//
// Edge delivery audit, fix F19 (2026-11-05). Guards M01 and M05 from coming
// back: the Range fix rests on the same list of binary types in edge-nonce,
// edge-nonce-mcp, this Worker, the Cache Rule that sends a Range on any other
// type to the origin (83d49da1, F01, jmrp.io and mcp.jmrp.io) and the Transform
// Rule that removes Accept-Ranges outside that list (078c69fd, F17). The rules
// are read from a dump: refresh it with
//   python3 workers/tools/dump_rules.py
// (GET only). Each path can be overridden by an environment variable, which is
// how the guard was checked against hand-made regressions.
describe("G1: one type list and one negotiation across the edge", () => {
  const SOURCES = {
    "edge-nonce": process.env.EDGE_GUARD_EDGE_NONCE ?? EDGE_NONCE,
    "edge-nonce-mcp":
      process.env.EDGE_GUARD_MCP ??
      path.join(here, "..", "edge-nonce-mcp", "worker.js"),
    "docs-edge": process.env.EDGE_GUARD_DOCS ?? path.join(here, "worker.js"),
  };
  const DUMP =
    process.env.EDGE_GUARD_RULES_DUMP ??
    path.join(here, "..", "tools", "rules-dump.json");
  const MAX_DUMP_DAYS = Number(process.env.EDGE_GUARD_MAX_DUMP_DAYS ?? 7);
  // The dump holds the live zone rules, so it only exists where someone ran
  // dump_rules.py with the account's credentials. Without it (CI, a fresh
  // clone) the two tests that read it are skipped, not failed; set
  // EDGE_GUARD_REQUIRE_DUMP=1 to make a missing dump an error.
  const noDump =
    existsSync(DUMP) || process.env.EDGE_GUARD_REQUIRE_DUMP === "1"
      ? false
      : `no rules dump at ${DUMP}: run workers/tools/dump_rules.py`;
  const RANGE_CACHE_RULE = "83d49da1d9854c778f0067fc5a7cee0a";
  const ACCEPT_RANGES_RULE = "078c69fd4e4246a7ad4ce4fe4f1ef9ad";

  /** The entries of `const RANGE_SAFE_EXTENSIONS = new Set([...])`, in order. */
  const workerList = (file) => {
    const body = readFileSync(file, "utf8").match(
      /^const RANGE_SAFE_EXTENSIONS = new Set\(\[([\s\S]*?)\]\);/m,
    )?.[1];
    return body === undefined
      ? null
      : [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  };
  /** The entries of the expression's `http.request.uri.path.extension in {...}`, in order. */
  const ruleList = (expression) => {
    const body = expression.match(
      /http\.request\.uri\.path\.extension in \{([^}]*)\}/,
    )?.[1];
    return body === undefined
      ? null
      : [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  };
  const hostList = (expression) => {
    const body = expression.match(/^\(?http\.host in \{([^}]*)\}/)?.[1];
    return body === undefined
      ? []
      : [...body.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  };
  const readDump = () => {
    assert.ok(
      existsSync(DUMP),
      `no rules dump at ${DUMP}: run workers/tools/dump_rules.py`,
    );
    const dump = JSON.parse(readFileSync(DUMP, "utf8"));
    const ageDays = (Date.now() - Date.parse(dump.dumped_at)) / 86_400_000;
    assert.ok(
      ageDays <= MAX_DUMP_DAYS,
      `the rules dump is ${ageDays.toFixed(1)} days old (limit ${MAX_DUMP_DAYS}): run workers/tools/dump_rules.py`,
    );
    return dump;
  };
  const rule = (dump, phase, id) => {
    const found = dump[phase].rules.find((r) => r.id === id);
    assert.ok(found, `rule ${id} is missing from ${phase}`);
    assert.equal(found.enabled, true, `rule ${id} is disabled`);
    return found;
  };

  test("the three Workers carry the same RANGE_SAFE_EXTENSIONS, entry for entry", () => {
    const reference = workerList(SOURCES["edge-nonce"]);
    assert.ok(
      reference?.length >= 14,
      "edge-nonce has no RANGE_SAFE_EXTENSIONS",
    );
    for (const [name, file] of Object.entries(SOURCES)) {
      assert.deepEqual(workerList(file), reference, `${name} (${file})`);
    }
    // A text type in the list would cut ranges from the stored brotli again (M01).
    for (const text of [
      "txt",
      "md",
      "xml",
      "json",
      "js",
      "css",
      "svg",
      "html",
      "ico",
    ]) {
      assert.ok(
        !reference.includes(text),
        `${text} is in RANGE_SAFE_EXTENSIONS`,
      );
    }
  });

  test("edge-nonce-mcp and docs-edge keep prefersMarkdown and twinUrl as literal copies of edge-nonce", () => {
    for (const name of ["prefersMarkdown", "twinUrl"]) {
      const reference = functionSource(SOURCES["edge-nonce"], name);
      assert.ok(reference, `${name} not found in edge-nonce`);
      assert.equal(
        functionSource(SOURCES["edge-nonce-mcp"], name),
        reference,
        `edge-nonce-mcp ${name}`,
      );
    }
    // docs-edge's copies live in markdown-negotiation.js; its own tests compare
    // prefersMarkdown, this compares twinUrl too.
    const docsNegotiation = path.join(
      path.dirname(SOURCES["docs-edge"]),
      "markdown-negotiation.js",
    );
    for (const name of ["prefersMarkdown", "twinUrl"]) {
      assert.equal(
        functionSource(docsNegotiation, name),
        functionSource(SOURCES["edge-nonce"], name),
        `docs-edge ${name}`,
      );
    }
  });

  test(
    "the Range cache rule and the Accept-Ranges rule name the Workers' list, on both hosts",
    { skip: noDump },
    () => {
      const dump = readDump();
      const reference = workerList(SOURCES["edge-nonce"]);
      const range = rule(dump, "http_request_cache_settings", RANGE_CACHE_RULE);
      assert.deepEqual(
        ruleList(range.expression),
        reference,
        "83d49da1 extension set",
      );
      assert.deepEqual(
        range.action_parameters,
        { cache: false },
        "83d49da1 must bypass the cache",
      );
      assert.match(
        range.expression,
        /http\.request\.headers\["range"\]/,
        "83d49da1 must fire on Range",
      );
      const acceptRanges = rule(
        dump,
        "http_response_headers_transform",
        ACCEPT_RANGES_RULE,
      );
      assert.deepEqual(
        ruleList(acceptRanges.expression),
        reference,
        "078c69fd extension set",
      );
      for (const host of ["jmrp.io", "mcp.jmrp.io"]) {
        assert.ok(
          hostList(range.expression).includes(host),
          `83d49da1 no longer covers ${host}`,
        );
        assert.ok(
          hostList(acceptRanges.expression).includes(host),
          `078c69fd no longer covers ${host}`,
        );
      }
    },
  );

  test(
    "every Worker route fails open, and /homelab/ never runs a Worker",
    { skip: noDump },
    () => {
      const dump = readDump();
      for (const route of dump.workers_routes) {
        if (route.script)
          assert.equal(
            route.request_limit_fail_open,
            true,
            `${route.pattern} (${route.script}) fails closed`,
          );
      }
      for (const pattern of ["jmrp.io/homelab/*", "jmrp.io/es/homelab/*"]) {
        const route = dump.workers_routes.find((r) => r.pattern === pattern);
        assert.ok(route, `no route ${pattern}: /homelab/ would run edge-nonce`);
        assert.equal(route.script, null, `${pattern} runs ${route.script}`);
      }
    },
  );
});
