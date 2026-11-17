// cspell:ignore dvmpdy Publicado actualización Última
// Unit tests for docs-edge's content validators (2026-11-17). Run beside the
// worker: `node --test` in workers/docs-edge. Nothing here touches the
// network; the handler-level tests are in worker.test.mjs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";

import {
  contentDigest,
  DIGEST_LIMIT_BYTES,
  forValidation,
  htmlContentDate,
  markdownContentDate,
  parseStatedDate,
  preconditionStatus,
  validatesContent,
  withContentValidators,
} from "./content-validators.js";

const ORIGIN = "https://docs.jmrp.io";
const at = (iso) => Date.parse(iso);

describe("parseStatedDate: a date the page states, or none", () => {
  test("a day is midnight UTC, a date-time keeps its offset, in whole seconds", () => {
    assert.equal(parseStatedDate("2026-07-05"), at("2026-07-05T00:00:00Z"));
    assert.equal(
      parseStatedDate("2026-11-17T10:30:31.000Z"),
      at("2026-11-17T10:30:31Z"),
    );
    assert.equal(
      parseStatedDate("2026-02-25T01:39:53+01:00"),
      at("2026-02-25T00:39:53Z"),
    );
    assert.equal(
      parseStatedDate("2026-11-17T10:30:31.999Z"),
      at("2026-11-17T10:30:31Z"),
    );
  });

  test("anything else states no date, a local date-time included", () => {
    for (const value of [
      "",
      "Nov 17, 2026",
      "2026-11-17T10:30:31", // no offset: JavaScript would read local time
      "2026-13-01",
      "17/11/2026",
      "2026-11-17 10:30:31Z",
    ]) {
      assert.equal(parseStatedDate(value), null, value);
    }
  });
});

describe("htmlContentDate: the last <time> of Starlight's footer", () => {
  const footer = (inner) =>
    `<main><time datetime="2030-01-01">a release date in the body</time></main><div class="meta sl-flex astro-dvmpdy6n"><a href="x">Edit page</a>${inner}</div><div><time datetime="2031-01-01">after the footer</time></div>`;

  test("Last updated on every project, updated or Published on phonometry", () => {
    assert.equal(
      htmlContentDate(
        footer(
          '<p>Last updated: <time datetime="2026-08-29T09:20:42.000Z">Aug 29, 2026</time></p>',
        ),
      ),
      at("2026-08-29T09:20:42Z"),
    );
    assert.equal(
      htmlContentDate(
        footer(
          '<p>Published <time datetime="2026-07-05">Jul 5, 2026</time>, updated <time datetime="2026-11-17T10:30:31.000Z">Nov 17, 2026</time></p>',
        ),
      ),
      at("2026-11-17T10:30:31Z"),
    );
    assert.equal(
      htmlContentDate(
        footer(
          '<p>Publicado el <time datetime="2026-07-05">5 jul 2026</time></p>',
        ),
      ),
      at("2026-07-05T00:00:00Z"),
    );
    assert.equal(
      htmlContentDate(
        footer(
          '<p>Última actualización: <time class="x" datetime="2026-09-25T10:38:14.000Z">25 sept 2026</time></p>',
        ),
      ),
      at("2026-09-25T10:38:14Z"),
    );
  });

  test("no footer, or a footer with no date: no date, whatever the body says", () => {
    assert.equal(
      htmlContentDate('<main><time datetime="2026-11-16">x</time></main>'),
      null,
    );
    assert.equal(htmlContentDate(footer("<p>Edit only</p>")), null);
    assert.equal(
      htmlContentDate(footer('<p><time datetime="soon">x</time></p>')),
      null,
    );
  });
});

describe("markdownContentDate: the Updated: line above the copy's first ---", () => {
  test("the header's Updated line", () => {
    const copy =
      "# Title\n\nPublished: 2026-07-05\nUpdated: 2026-11-17\n\n---\n\nBody\n";
    assert.equal(markdownContentDate(copy), at("2026-11-17T00:00:00Z"));
    assert.equal(
      markdownContentDate(copy.replaceAll("\n", "\r\n")),
      at("2026-11-17T00:00:00Z"),
      "CRLF line ends read the same",
    );
  });

  test("no header, or the line only below it: no date", () => {
    assert.equal(
      markdownContentDate("# mikroscope\n\nUpdated: 2026-11-17\n"),
      null,
    );
    assert.equal(
      markdownContentDate("# T\n\n---\n\nUpdated: 2026-11-17\n"),
      null,
    );
    assert.equal(
      markdownContentDate("# T\n Updated: 2026-11-17\n---\n"),
      null,
      "the field starts the line",
    );
  });
});

describe("preconditionStatus: RFC 9110, 13.2.2", () => {
  const ETAG = 'W/"0123456789abcdef0123456789abcdef"';
  const LM = at("2026-08-29T09:20:42Z");
  const status = (headers, etag = ETAG, lastModified = LM) =>
    preconditionStatus(new Headers(headers), etag, lastModified);

  test("If-None-Match: weak comparison, lists and *", () => {
    assert.equal(status({ "if-none-match": ETAG }), 304);
    assert.equal(
      status({ "if-none-match": '"0123456789abcdef0123456789abcdef"' }),
      304,
      "weak comparison ignores W/",
    );
    assert.equal(status({ "if-none-match": `"a", ${ETAG}` }), 304);
    assert.equal(status({ "if-none-match": '"a", "b,c"' }), 200);
    assert.equal(status({ "if-none-match": "*" }), 304);
    assert.equal(status({ "if-none-match": "garbage" }), 200);
    assert.equal(status({ "if-none-match": ETAG }, null), 200, "no ETag");
  });

  test("If-Modified-Since: only without If-None-Match, and ignored when not a date", () => {
    assert.equal(
      status({ "if-modified-since": "Sat, 29 Aug 2026 09:20:42 GMT" }),
      304,
    );
    assert.equal(
      status({ "if-modified-since": "Sat, 29 Aug 2026 09:20:41 GMT" }),
      200,
    );
    assert.equal(status({ "if-modified-since": "yesterday" }), 200);
    assert.equal(
      status(
        { "if-modified-since": "Sat, 29 Aug 2026 09:20:42 GMT" },
        ETAG,
        null,
      ),
      200,
      "no Last-Modified",
    );
    assert.equal(
      status({
        "if-none-match": '"other"',
        "if-modified-since": "Sat, 29 Aug 2026 09:20:42 GMT",
      }),
      200,
    );
  });

  test("If-Match compares strongly; If-Unmodified-Since only without it", () => {
    assert.equal(status({ "if-match": "*" }), 200);
    assert.equal(status({ "if-match": ETAG }), 412);
    assert.equal(status({ "if-match": '"x"' }, '"x"'), 200, "a strong tag");
    assert.equal(
      status({ "if-unmodified-since": "Fri, 28 Aug 2026 00:00:00 GMT" }),
      412,
    );
    assert.equal(
      status({
        "if-match": "*",
        "if-unmodified-since": "Fri, 28 Aug 2026 00:00:00 GMT",
      }),
      200,
      "If-Match present: If-Unmodified-Since is not evaluated",
    );
    assert.equal(
      status({ "if-match": "*", "if-none-match": ETAG }),
      304,
      "a passed If-Match goes on to If-None-Match",
    );
  });
});

describe("validatesContent and forValidation", () => {
  const request = (pathname, init) => new Request(`${ORIGIN}${pathname}`, init);

  test("page paths only, GET or HEAD", () => {
    for (const [pathname, method, expected] of [
      ["/phonometry/", "GET", true],
      ["/phonometry/start/getting-started/index.md", "HEAD", true],
      ["/mikroscope/start/walkthrough/index.html", "GET", true],
      ["/phonometry/start/getting-started", "GET", true],
      ["/", "GET", true],
      ["/phonometry/", "POST", false],
      ["/phonometry/llms.txt", "GET", false],
      ["/phonometry/_astro/a.css", "GET", false],
      ["/phonometry/sitemap-index.xml", "GET", false],
      ["/libgen-mcp/og.png", "GET", false],
    ]) {
      const r = request(pathname, { method });
      assert.equal(validatesContent(r, new URL(r.url)), expected, pathname);
    }
  });

  test("a GET with no precondition goes as it is; anything else as a GET without them", () => {
    const plain = request("/phonometry/", { headers: { accept: "text/html" } });
    assert.equal(forValidation(plain), plain);
    const conditional = request("/phonometry/", {
      method: "HEAD",
      redirect: "manual",
      headers: {
        accept: "text/html",
        range: "bytes=0-9",
        "if-none-match": '"a"',
        "if-match": '"b"',
        "if-modified-since": "Sat, 29 Aug 2026 09:20:42 GMT",
        "if-unmodified-since": "Sat, 29 Aug 2026 09:20:42 GMT",
      },
    });
    const sent = forValidation(conditional);
    assert.equal(sent.method, "GET");
    assert.equal(sent.url, conditional.url);
    assert.equal(sent.redirect, "manual");
    assert.equal(sent.body, null);
    assert.deepEqual(
      [...sent.headers],
      [
        ["accept", "text/html"],
        ["range", "bytes=0-9"],
      ],
    );
  });
});

describe("withContentValidators", () => {
  const html = (body, headers = {}) =>
    new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        etag: 'W/"6afc31e5-3d193"',
        "last-modified": "Tue, 17 Nov 2026 10:52:21 GMT",
        ...headers,
      },
    });
  const NOW = at("2026-11-17T14:00:00Z");

  test("the digest is the first 128 bits of the SHA-256 of the bytes", async () => {
    const body = "<!doctype html><title>x</title>";
    const expected = createHash("sha256")
      .update(body)
      .digest("hex")
      .slice(0, 32);
    assert.equal(
      await contentDigest(new TextEncoder().encode(body).buffer),
      expected,
    );
    const response = await withContentValidators(
      new Request(`${ORIGIN}/x/`),
      html(body),
      NOW,
    );
    assert.equal(response.headers.get("etag"), `W/"${expected}"`);
    assert.equal(
      response.headers.get("last-modified"),
      "Tue, 17 Nov 2026 10:52:21 GMT",
      "no stated date: GitHub's",
    );
    assert.equal(await response.text(), body);
  });

  test("a body above DIGEST_LIMIT_BYTES keeps GitHub's validators and is judged on them", async () => {
    const big = "x".repeat(DIGEST_LIMIT_BYTES + 1);
    const response = await withContentValidators(
      new Request(`${ORIGIN}/x/`, {
        headers: { "if-none-match": 'W/"6afc31e5-3d193"' },
      }),
      html(big),
      NOW,
    );
    assert.equal(response.status, 304);
    assert.equal(response.headers.get("etag"), 'W/"6afc31e5-3d193"');
  });

  test("the 304 keeps the 200's headers but the body's own and the Link", async () => {
    const body = "<!doctype html>";
    const first = await withContentValidators(
      new Request(`${ORIGIN}/x/`),
      html(body, {
        link: '<https://docs.jmrp.io/x/index.md>; rel="alternate"',
        vary: "Accept-Encoding, Accept",
        "cache-control": "max-age=600",
        "content-encoding": "gzip",
      }),
      NOW,
    );
    const etag = first.headers.get("etag");
    const response = await withContentValidators(
      new Request(`${ORIGIN}/x/`, { headers: { "if-none-match": etag } }),
      html(body, {
        link: '<https://docs.jmrp.io/x/index.md>; rel="alternate"',
        vary: "Accept-Encoding, Accept",
        "cache-control": "max-age=600",
        "content-encoding": "gzip",
      }),
      NOW,
    );
    assert.equal(response.status, 304);
    assert.equal(response.body, null);
    assert.deepEqual(
      [...response.headers].map(([name]) => name),
      ["cache-control", "etag", "last-modified", "vary"],
    );
  });

  test("a stated date after now becomes now", async () => {
    const page = `<div class="meta sl-flex"><p>Last updated: <time datetime="2026-12-01T00:00:00Z">x</time></p></div>`;
    const response = await withContentValidators(
      new Request(`${ORIGIN}/x/`),
      html(page),
      NOW + 999,
    );
    assert.equal(
      response.headers.get("last-modified"),
      "Tue, 17 Nov 2026 14:00:00 GMT",
    );
  });

  test("the largest page measured (720 KB) costs a few milliseconds", async () => {
    const page = `<!doctype html>${"<p>text</p>".repeat(65_000)}<div class="meta sl-flex"><p>Last updated: <time datetime="2026-08-29T09:20:42.000Z">x</time></p></div>`;
    await withContentValidators(new Request(`${ORIGIN}/x/`), html(page), NOW);
    const started = performance.now();
    const response = await withContentValidators(
      new Request(`${ORIGIN}/x/`),
      html(page),
      NOW,
    );
    const ms = performance.now() - started;
    assert.equal(
      response.headers.get("last-modified"),
      "Sat, 29 Aug 2026 09:20:42 GMT",
    );
    assert.ok(ms < 100, `${ms.toFixed(1)} ms`);
  });
});
