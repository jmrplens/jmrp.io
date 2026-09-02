import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";

import { assertNginxSafe, writeNginxSnippet } from "./utils.js";

/**
 * Announces every page's markdown twin in the HTTP response, as an RFC 8288
 * typed link appended to that page's existing `Link` header.
 *
 * This is a SECOND announcement channel, not the only one and not the primary
 * one. The primary is the `<link rel="alternate" type="text/markdown">` tag
 * that `BaseHead.astro` emits, and `llms.txt` lists the twins as well. What the
 * header adds is a channel that does not require parsing the body: a client can
 * discover the twin from a HEAD request. Exactly the same argument, and the
 * same expected audience, as the `rel="describedby"` links this site already
 * serves — see the comment on that `add_header` in the vhost.
 *
 * It is derived from the build output rather than from a per-page prop, which
 * is the property the audit actually cared about: the head tag was opt-in and
 * 20 of 96 twinned pages silently never passed it (GEO audit 2026-09-02, A2).
 * A channel computed from "did the build write `<page>/index.md`" cannot drift
 * from the twins it announces. Same shape and same reasoning as
 * `blog-redirects.ts` / `docs-redirects.ts` / `tag-redirects.ts`.
 */

/** Matches the generated snippet's `map` variable, consumed by the vhost. */
const MAP_VARIABLE = "$jmrp_md_alternate";

/** An escaped double quote, as Nginx needs it inside a quoted map value. */
const Q = String.raw`\"`;

/** Canonical origin, resolved exactly as `astro.config.mjs` resolves `site`. */
const SITE_URL = process.env.PUBLIC_SITE_URL || "https://jmrp.io";

/**
 * Collects the page path of every markdown twin in the build output.
 *
 * A twin is always `<page>/index.md`, so the page it belongs to is the
 * containing directory with a trailing slash. `index.md.br` / `index.md.gz`
 * are produced by the compression step and must not be matched — the name test
 * is exact for that reason.
 *
 * @param distDir - Build output directory.
 * @param base - URL path accumulated so far during the walk.
 * @returns Page paths with a leading and trailing slash, e.g. `/blog/series/`.
 */
function collectTwinPages(distDir: string, base = ""): string[] {
  const pages: string[] = [];
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pages.push(
        ...collectTwinPages(
          path.join(distDir, entry.name),
          `${base}/${entry.name}`,
        ),
      );
    } else if (entry.isFile() && entry.name === "index.md") {
      pages.push(`${base}/`);
    }
  }
  return pages;
}

/**
 * Generates `md_twin_alternates.conf`: an Nginx `map` from the served URI to
 * the `rel="alternate"; type="text/markdown"` fragment appended to that page's
 * `Link` header.
 *
 * Three details are load-bearing and all three are documented in the generated
 * file so that nobody "fixes" them:
 *
 * 1. **The keys are the `index.html` form, not the directory form.** By the
 *    time `add_header` is evaluated, `try_files $uri $uri/` plus the index
 *    module have internally redirected `/blog/series/` to
 *    `/blog/series/index.html` and the locations have been re-matched, so
 *    `$uri` is the file. Keying on the directory matches nothing and the header
 *    silently never appears.
 * 2. **The map is `volatile`.** Non-volatile map results are cached per
 *    request, and `$uri` changes at that internal redirect. Measured: with one
 *    reference to a non-volatile map from the rewrite phase, the pre-redirect
 *    (directory-form) miss is cached and the header comes out EMPTY at the
 *    header filter, with no error anywhere. `volatile` costs one hash lookup
 *    and removes the trap for whoever later adds this variable to a log format
 *    or a lua hook.
 * 3. **The value is DOUBLE-quoted with escaped inner quotes, and is a fragment
 *    with a leading `", "`.** Double-quoted so that `assertNginxSafe` — whose
 *    character class is `["\;\r\n]` — is exactly the right guard for the
 *    quoting context, as it is for the three sibling generators. The fragment
 *    is appended inside the existing `add_header Link` of the HTML locations:
 *    a second `add_header Link` would emit two `Link` headers under this box's
 *    `add_header_inherit merge`, and rebuilding the whole header in the
 *    location would mean repeating the security-header set.
 *
 * @param distDir - Build output directory.
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generateMdTwinAlternates(
  distDir: string,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const pages = collectTwinPages(distDir).sort((a, b) => a.localeCompare(b));

  // Page paths come from directory names on disk, but they are interpolated
  // into quoted Nginx map entries in a file the live vhost `include`s at http
  // level: one stray quote or semicolon is a config the whole server refuses to
  // start with. The values below are double-quoted precisely so this guard —
  // shared with blog-redirects / docs-redirects / tag-redirects — covers them.
  assertNginxSafe([SITE_URL, ...pages], "markdown twin page paths");

  const entries = pages
    .map(
      (page) =>
        `    "${page}index.html"  ", <${SITE_URL}${page}index.md>; rel=${Q}alternate${Q}; type=${Q}text/markdown${Q}";`,
    )
    .join("\n");

  // Every bare `$` below is a literal Nginx variable, not a JS interpolation:
  // in a template literal only `${` starts a substitution, so a bare `$` needs
  // no escape and `\$` would be flagged as an unnecessary one. If you ever
  // write an Nginx variable that is immediately followed by `{`, that one DOES
  // need `\${` — otherwise the build would try to interpolate it. The three
  // real `${…}` substitutions below are the twin count, the map variable name
  // and the entry list.
  const content = `# GENERATED FILE — DO NOT EDIT.
# Written by src/integrations/post-build/md-twin-alternates.ts on every build.
#
# A page that has a markdown twin says so in its HTTP response, as an RFC 8288
# typed link appended to its existing Link header, so a client can discover the
# twin from a HEAD request without fetching and parsing the HTML.
#
# THIS IS A SECOND CHANNEL, NOT THE ONLY ONE. Every twinned page also carries
# <link rel="alternate" type="text/markdown"> in its head and is listed in
# llms.txt, and 92 of 96 twins are additionally reachable by the edge Worker's
# Accept: text/markdown negotiation. What this header adds is HEAD-request
# visibility, and a channel derived from the build output instead of from a
# per-page prop — which is what the audit's finding was actually about: the head
# tag was opt-in and 20 of 96 twinned pages silently never passed it.
# (GEO audit 2026-09-02, A2; the head tag and llms.txt are fixed separately.)
#
# The map holds ONLY pages whose twin the build actually wrote, so a page with
# no twin never advertises a 404. Regenerated from the build output on every
# run: adding a post, a tool or a series hub needs no edit here, and REMOVING
# one withdraws the announcement in the same build.
#
# NOTE THE PREFIX. \`map\` is an http-level directive and its variables are
# GLOBAL across every vhost on this box. A \`map $uri $md_link_header\` defined
# in two vhosts under the same name was ONE variable once already, and every
# markdown twin on this domain advertised a canonical on mcp.jmrp.io until it
# was found. Everything this site defines is prefixed \`jmrp_\`.
#
# THE KEYS ARE THE index.html FORM, NOT THE DIRECTORY FORM, AND THAT IS NOT A
# TYPO. A request for /blog/series/ is resolved by \`try_files $uri $uri/\`, the
# index module issues an INTERNAL redirect to /blog/series/index.html, and
# locations are re-matched — so by the time the header filter evaluates
# \`add_header\`, $uri is the index.html form. Verified on this server:
# \`curl https://jmrp.io/es/404/\` answers 200 with NO Link, NO Cache-Control and
# NO Content-Language, because it is served from \`location = /es/404/index.html\`
# and not from \`location /\`. Keying this map on "/blog/series/" would match
# nothing and the header would silently never appear. A direct request for
# /blog/series/index.html therefore also carries the announcement; that URL is
# not canonical and is not linked anywhere, and the twin's own rel="canonical"
# points at the directory form regardless.
#
# \`volatile\` IS LOAD-BEARING, for the same reason. Map results are cached per
# request by default, and $uri changes at that internal redirect. Measured in an
# isolated nginx: with one reference from the rewrite phase, a NON-volatile map
# caches the pre-redirect miss and the header comes out EMPTY at the header
# filter, silently. Do not remove it to save a hash lookup.
#
# The value is a FRAGMENT with a leading ", " — appended inside the existing
# \`add_header Link\` of the two HTML locations, so there is exactly one Link
# header per response and the security-header snippet is untouched. When a page
# has no twin the value is empty and the header keeps its base value. Same
# dressing pattern as the $srv_rdr_* maps.
#
# Included at http level; consumed by the server block as:
#     add_header Link '<base>$jmrp_md_alternate' always;
#
# THE TWO CONSUMPTION SITES ARE HAND-MAINTAINED AND NOT IN GIT. If you add a
# third location that serves HTML, append $jmrp_md_alternate to its Link header
# too, or the pages it serves lose the announcement with nothing to warn you.
#
# Twins: ${pages.length}

map $uri ${MAP_VARIABLE} {
    volatile;
    default "";

${entries}
}
`;

  // Deliberately NOT written into dist/: that directory is public and is the
  // blue/green symlink, so an include by absolute path would dangle whenever a
  // build from an older revision won the swap. Keeping it in the repo means the
  // include always resolves. Same rationale as blog_redirects.conf.
  const outPath = path.join(process.cwd(), "nginx", "md_twin_alternates.conf");
  await writeNginxSnippet(outPath, content);
  logger.info(
    `  ✓ Generated nginx/md_twin_alternates.conf (${pages.length} markdown twins announced)`,
  );
}
