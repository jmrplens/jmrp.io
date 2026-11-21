/**
 * Unit tests for the /homelab/ preload map
 * (`src/integrations/post-build/homelab-preload.ts`).
 *
 * The defect these lock down (GEO audit #13, B5): the /homelab/ location
 * announced three font preloads written into the vhost by hand, the font
 * hashes changed on 2026-11-06, and every visit asked for three files that
 * 404ed for two weeks. The map must carry exactly the preloads the built page
 * declares, fail the build when the page preloads a file the build lacks, and
 * be a config nginx accepts. The last test feeds the rendered map to the
 * deploy-live guard, so the two halves of the fix agree on the link shape.
 *
 * Everything runs in a temp directory; nothing in the project is touched.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  collectPreloads,
  HOMELAB_PAGES,
  HOMELAB_PRELOAD_VARIABLE,
  linkFragment,
  readHomelabPreloads,
  renderHomelabPreloadMap,
} from "../../src/integrations/post-build/homelab-preload.ts";
import { extractPreloadTargets } from "../nginx-preload-guard.mjs";

const STAMP_LINE = "# Build-Stamp: 20261121T120000Z-0a1b2c3d";

/** The three font preloads BaseHead emits, as the minifier leaves them. */
const FONTS = [
  "/_astro/fonts/08ef20cebe39ad43.woff2",
  "/_astro/fonts/544429b2c429e0e9.woff2",
  "/_astro/fonts/aa9f881e99995cb5.woff2",
];

/** A minified head with the three fonts, one stylesheet and noise around them. */
const PAGE = `<!doctype html><html><head><meta charset=utf-8>${FONTS.map(
  (href) =>
    `<link href=${href} rel=preload type=font/woff2 as=font crossorigin>`,
).join(
  "",
)}<link rel=stylesheet href=/_astro/a.css><link rel="alternate" type="text/markdown" href="/homelab/index.md"></head><body></body></html>`;

describe("collectPreloads", () => {
  test("reads unquoted, minified preload links in document order", () => {
    assert.deepEqual(
      collectPreloads(PAGE),
      FONTS.map((href) => ({
        href,
        as: "font",
        type: "font/woff2",
        crossorigin: "anonymous",
      })),
    );
  });

  test("treats rel as a token list and ignores other relations", () => {
    const html = `<link rel="preload prefetch" href="/a.woff2" as="font"><link rel="prefetch" href="/b.js"><link rel="modulepreload" href="/c.js">`;
    assert.deepEqual(collectPreloads(html), [{ href: "/a.woff2", as: "font" }]);
  });

  test("skips cross-origin preloads and removes duplicates", () => {
    const html = `<link rel=preload href=https://cdn.example/x.woff2 as=font><link rel=preload href=//cdn.example/y.woff2 as=font><link rel=preload href=/z.woff2 as=font><link rel=preload href=/z.woff2 as=font>`;
    assert.deepEqual(collectPreloads(html), [{ href: "/z.woff2", as: "font" }]);
  });

  test("keeps use-credentials apart from the anonymous default", () => {
    const html = `<link rel=preload href=/a.woff2 as=font crossorigin=use-credentials>`;
    assert.equal(collectPreloads(html)[0].crossorigin, "use-credentials");
  });

  test("refuses a path that would break the nginx string or the Link reference", () => {
    for (const href of [
      '/a".woff2',
      "/a$host.woff2",
      "/a>b.woff2",
      "/a,b.woff2",
      "/a b.woff2",
      String.raw`/a\b.woff2`,
      "/a;b.woff2",
    ]) {
      const html = `<link rel="preload" href="${href.replaceAll('"', "&quot;")}" as="font">`;
      assert.throws(() => collectPreloads(html), /Refusing/, href);
    }
  });

  test("refuses a type that is not a plain MIME token", () => {
    const html = `<link rel="preload" href="/a.woff2" as="font" type="font/woff2;x">`;
    assert.throws(() => collectPreloads(html), /not a plain MIME token/);
  });
});

describe("linkFragment", () => {
  test("formats each preload as a Link entry with a leading comma", () => {
    assert.equal(
      linkFragment(collectPreloads(PAGE)),
      FONTS.map(
        (href) =>
          `, <${href}>; rel=preload; as=font; type=font/woff2; crossorigin`,
      ).join(""),
    );
  });

  test("is empty for a page that preloads nothing", () => {
    assert.equal(linkFragment([]), "");
  });
});

describe("readHomelabPreloads and renderHomelabPreloadMap", () => {
  /** @type {string} */
  let distDir;

  before(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), "homelab-preload-"));
    for (const page of HOMELAB_PAGES) {
      fs.mkdirSync(path.join(distDir, page), { recursive: true });
      fs.writeFileSync(path.join(distDir, page, "index.html"), PAGE);
    }
    fs.mkdirSync(path.join(distDir, "_astro/fonts"), { recursive: true });
    for (const href of FONTS) fs.writeFileSync(path.join(distDir, href), "x");
  });

  after(() => fs.rmSync(distDir, { recursive: true, force: true }));

  test("keys each page by the index.html form nginx sees at header time", () => {
    const pages = readHomelabPreloads(distDir);
    assert.deepEqual(
      pages.map((page) => page.uri),
      ["/homelab/index.html", "/es/homelab/index.html"],
    );
    for (const page of pages) assert.equal(page.preloads.length, 3);
  });

  test("fails when a page preloads a file the build does not contain", () => {
    const font = path.join(distDir, FONTS[1]);
    fs.renameSync(font, `${font}.away`);
    try {
      assert.throws(
        () => readHomelabPreloads(distDir),
        /preloads files the build does not contain: \/_astro\/fonts\/544429b2c429e0e9\.woff2/,
      );
    } finally {
      fs.renameSync(`${font}.away`, font);
    }
  });

  test("fails when a /homelab/ page is missing from the build", () => {
    const html = path.join(distDir, "es/homelab/index.html");
    fs.renameSync(html, `${html}.away`);
    try {
      assert.throws(() => readHomelabPreloads(distDir), /is not in the build/);
    } finally {
      fs.renameSync(`${html}.away`, html);
    }
  });

  test("renders a stamped, volatile, domain-prefixed map", () => {
    const content = renderHomelabPreloadMap(
      readHomelabPreloads(distDir),
      STAMP_LINE,
    );
    assert.equal(content.split("\n", 2)[1], STAMP_LINE);
    assert.match(content, /^map \$uri \$jmrp_homelab_preload \{$/m);
    assert.match(content, /^ {4}volatile;$/m);
    assert.match(content, /^ {4}default "";$/m);
    assert.match(
      content,
      /^ {4}"\/homelab\/index\.html" {2}", <\/_astro\/fonts\/08ef20cebe39ad43\.woff2>; rel=preload; as=font; type=font\/woff2; crossorigin, /m,
    );
    assert.equal(HOMELAB_PRELOAD_VARIABLE, "$jmrp_homelab_preload");
    assert.equal(
      (content.match(/^\s*"\/(?:es\/)?homelab\/index\.html"/gm) ?? []).length,
      2,
    );
  });

  test("leaves out a page with no preloads instead of writing an empty entry", () => {
    const content = renderHomelabPreloadMap(
      [{ uri: "/homelab/index.html", preloads: [] }],
      STAMP_LINE,
    );
    assert.doesNotMatch(content, /"\/homelab\/index\.html"/);
    assert.match(content, /default "";\n\}\n$/);
  });

  test("the deploy-live guard reads back exactly the preloaded files", () => {
    const content = renderHomelabPreloadMap(
      readHomelabPreloads(distDir),
      STAMP_LINE,
    );
    assert.deepEqual(extractPreloadTargets(content), [...FONTS, ...FONTS]);
  });

  test("nginx accepts the rendered map and a Link header that uses it", (t) => {
    const probe = spawnSync("nginx", ["-v"], { encoding: "utf8" });
    if (probe.error) {
      t.skip("nginx is not installed here");
      return;
    }
    const prefix = fs.mkdtempSync(path.join(os.tmpdir(), "homelab-ngx-"));
    try {
      fs.mkdirSync(path.join(prefix, "logs"));
      fs.writeFileSync(
        path.join(prefix, "map.conf"),
        renderHomelabPreloadMap(readHomelabPreloads(distDir), STAMP_LINE),
      );
      fs.writeFileSync(
        path.join(prefix, "nginx.conf"),
        `pid ${prefix}/logs/nginx.pid;
error_log ${prefix}/logs/error.log;
events {}
http {
    access_log off;
    include ${prefix}/map.conf;
    server {
        # A socket in the scratch prefix, not a TCP port: nginx -t binds the
        # listen address on this build, and a runner without root cannot
        # bind a port below 1024.
        listen unix:${prefix}/nginx.sock;
        location / {
            add_header Link '</llms.txt>; rel="describedby"${HOMELAB_PRELOAD_VARIABLE}' always;
        }
    }
}
`,
      );
      const result = spawnSync(
        "nginx",
        [
          "-t",
          "-p",
          `${prefix}/`,
          "-c",
          `${prefix}/nginx.conf`,
          "-e",
          "stderr",
        ],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
    } finally {
      fs.rmSync(prefix, { recursive: true, force: true });
    }
  });
});
