/**
 * Unit tests for `scripts/nginx-preload-guard.mjs`, the end-of-deploy check
 * that every `rel=preload` link in this site's Nginx config names a file in
 * `dist/`.
 *
 * The defect it watches for (GEO audit #13, B5): the /homelab/ location
 * announced three hand-written font preloads that 404ed for two weeks after
 * the font hashes changed. The first test replays that exact vhost line
 * against a build holding the new fonts and expects all three reported.
 *
 * Everything runs in a temp directory; nothing in the project is touched.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";

import {
  extractPreloadTargets,
  findStalePreloads,
  formatPreloadNotice,
  splitNginxDump,
} from "./nginx-preload-guard.mjs";

const SNIPPETS = "/etc/nginx/snippets/jmrp";

/** The /homelab/ Link header as the vhost carried it until GEO audit #13. */
const STALE_LINK = `add_header Link '</llms.txt>; rel="describedby", </identity/person.jsonld>; rel="describedby"; type="application/ld+json"$jmrp_md_alternate, </_astro/fonts/0afc56df7fe9322d.woff2>; rel=preload; as=font; type=font/woff2; crossorigin, </_astro/fonts/7536133cd6c7fa76.woff2>; rel=preload; as=font; type=font/woff2; crossorigin, </_astro/fonts/918b42621fe434fa.woff2>; rel=preload; as=font; type=font/woff2; crossorigin' always;`;

/** The fonts the current build actually preloads. */
const FONTS = [
  "/_astro/fonts/08ef20cebe39ad43.woff2",
  "/_astro/fonts/544429b2c429e0e9.woff2",
  "/_astro/fonts/aa9f881e99995cb5.woff2",
];

/**
 * Assembles an `nginx -T` dump from files.
 *
 * @param {Record<string, string>} files - Path to content.
 * @returns {string} The dump, banner included.
 */
function dump(files) {
  return [
    "nginx: the configuration file /etc/nginx/nginx.conf syntax is ok",
    ...Object.entries(files).map(
      ([file, body]) => `# configuration file ${file}:\n${body}\n`,
    ),
  ].join("\n");
}

/** The vhost of this site, with a given Link line in the /homelab/ location. */
const vhost = (linkLine) => String.raw`server {
    server_name jmrp.io;
    # Refresh the hashes from dist/homelab/index.html, e.g. </_astro/fonts/old.woff2>; rel=preload
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    location ~ ^/(?:es/)?homelab/(?:index\.html)?$ {
        ${linkLine}
    }
}`;

let distDir = "";

before(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "preload-guard-"));
  fs.mkdirSync(path.join(distDir, "_astro/fonts"), { recursive: true });
  for (const font of FONTS) fs.writeFileSync(path.join(distDir, font), "x");
  fs.writeFileSync(path.join(distDir, "llms.txt"), "x");
  fs.mkdirSync(path.join(distDir, "homelab"));
  fs.writeFileSync(path.join(distDir, "homelab/index.html"), "x");
});

after(() => fs.rmSync(distDir, { recursive: true, force: true }));

describe("findStalePreloads", () => {
  test("reports the three stale fonts of the hand-written /homelab/ header", () => {
    const stale = findStalePreloads(
      dump({ "/etc/nginx/sites-enabled/jmrp.io.conf": vhost(STALE_LINK) }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(
      stale.map((entry) => entry.target),
      [
        "/_astro/fonts/0afc56df7fe9322d.woff2",
        "/_astro/fonts/7536133cd6c7fa76.woff2",
        "/_astro/fonts/918b42621fe434fa.woff2",
      ],
    );
    assert.equal(stale[0].file, "/etc/nginx/sites-enabled/jmrp.io.conf");
  });

  test("passes the generated map once its fonts are in the build", () => {
    const map = `map $uri $jmrp_homelab_preload {
    volatile;
    default "";
    "/homelab/index.html"  "${FONTS.map((f) => `, <${f}>; rel=preload; as=font; type=font/woff2; crossorigin`).join("")}";
}`;
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/jmrp.io.conf": vhost(
          `add_header Link '</llms.txt>; rel="describedby"$jmrp_md_alternate$jmrp_homelab_preload' always;`,
        ),
        [`${SNIPPETS}/maps/homelab_preload.conf`]: map,
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(stale, []);
  });

  test("checks a map in the snippets directory even with no server_name", () => {
    const stale = findStalePreloads(
      dump({
        [`${SNIPPETS}/maps/homelab_preload.conf`]: `map $uri $jmrp_homelab_preload { "/homelab/index.html" ", </_astro/fonts/gone.woff2>; rel=preload; as=font"; }`,
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(
      stale.map((entry) => entry.target),
      ["/_astro/fonts/gone.woff2"],
    );
  });

  test("ignores relative preloads of other vhosts, whole-token server_name included", () => {
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/bio.jmrp.io.conf": `server { server_name bio.jmrp.io; add_header Link '</app.js>; rel=preload; as=script' always; }`,
        "/etc/nginx/sites-enabled/other.conf": `server { server_name example.org; add_header Link "</x.css>; rel=preload; as=style"; }`,
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(stale, []);
  });

  test("checks an absolute jmrp.io URL wherever it is written", () => {
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/other.conf": `server { server_name example.org; add_header Link '<https://jmrp.io/_astro/fonts/gone.woff2>; rel=preload; as=font, <https://cdn.example/x.woff2>; rel=preload; as=font' always; }`,
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(
      stale.map((entry) => entry.target),
      ["https://jmrp.io/_astro/fonts/gone.woff2"],
    );
  });

  test("does not mistake HSTS preload, other relations or comments for a preload", () => {
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/jmrp.io.conf": vhost(
          `add_header Link '</missing.txt>; rel="describedby", </also-missing.jsonld>; rel="alternate"; type="application/ld+json"' always;`,
        ),
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(stale, []);
  });

  test("accepts quoted, escape-quoted and multi-token rel values", () => {
    assert.deepEqual(
      extractPreloadTargets(
        String.raw`add_header Link "</a.woff2>; rel=\"preload\"; as=font, </b.css>; rel=\"preload prefetch\"; as=style, </c.js>; rel=\"prefetch\""; add_header Link '</d.js>; rel="preload"; as=script';`,
      ),
      ["/a.woff2", "/b.css", "/d.js"],
    );
  });

  test("resolves a directory to its index, and drops the query and fragment", () => {
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/jmrp.io.conf": vhost(
          `add_header Link '</homelab/>; rel=preload; as=document, </llms.txt?v=1#top>; rel=preload; as=fetch' always;`,
        ),
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.deepEqual(stale, []);
  });

  test("counts a path that escapes the build once decoded as missing", () => {
    fs.writeFileSync(path.join(path.dirname(distDir), "outside.txt"), "x");
    try {
      const stale = findStalePreloads(
        dump({
          "/etc/nginx/sites-enabled/jmrp.io.conf": vhost(
            `add_header Link '</%2e%2e/outside.txt>; rel=preload; as=fetch' always;`,
          ),
        }),
        { distDir, snippetsDir: SNIPPETS },
      );
      assert.equal(stale.length, 1);
    } finally {
      fs.rmSync(path.join(path.dirname(distDir), "outside.txt"), {
        force: true,
      });
    }
  });

  test("reports a preload once per file even when two locations repeat it", () => {
    const stale = findStalePreloads(
      dump({
        "/etc/nginx/sites-enabled/jmrp.io.conf": `${vhost(STALE_LINK)}\n${vhost(STALE_LINK)}`,
      }),
      { distDir, snippetsDir: SNIPPETS },
    );
    assert.equal(stale.length, 3);
  });
});

describe("splitNginxDump", () => {
  test("drops the banner and keeps one section per file", () => {
    const sections = splitNginxDump(
      dump({ "/etc/nginx/nginx.conf": "events {}", "/etc/nginx/a.conf": "x;" }),
    );
    assert.deepEqual(
      sections.map((section) => section.file),
      ["/etc/nginx/nginx.conf", "/etc/nginx/a.conf"],
    );
    assert.match(sections[0].body, /^events \{\}/);
  });
});

describe("formatPreloadNotice", () => {
  test("prints nothing when nothing is stale", () => {
    assert.deepEqual(formatPreloadNotice([]), []);
  });

  test("names every stale target with its file and the remedy", () => {
    const lines = formatPreloadNotice([
      { file: "/etc/nginx/sites-enabled/jmrp.io.conf", target: "/a.woff2" },
    ]);
    assert.match(lines[0], /1 rel=preload link\(s\)/);
    assert.match(
      lines[1],
      /\/a\.woff2 {2}\(\/etc\/nginx\/sites-enabled\/jmrp\.io\.conf\)/,
    );
    assert.ok(lines.some((line) => line.includes("$jmrp_homelab_preload")));
  });
});
