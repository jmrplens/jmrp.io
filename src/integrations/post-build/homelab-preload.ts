/**
 * Builds `maps/homelab_preload.conf`: the font preloads of `/homelab/`,
 * announced in its HTTP `Link` header, derived from the page the build wrote.
 *
 * Why the header exists at all: `/homelab/` (and `/es/homelab/`) bypass the
 * edge-nonce Worker, because nginx substitutes their metrics per request, and
 * Cloudflare only turns `rel=preload` links into Early Hints (HTTP 103) on
 * routes no Worker handles. With `inlineStylesheets: "always"` there is no
 * external CSS, so the useful hints are the fonts `BaseHead` preloads.
 *
 * Why it is generated: the vhost used to carry the three font URLs by hand.
 * Astro Fonts names each file after a hash, the hashes changed on 2026-11-06
 * and nobody refreshed the vhost, so for two weeks every visit to /homelab/
 * asked for three fonts that 404ed (264 errors from 71 addresses, a console
 * error and Best Practices 96 in Lighthouse; GEO audit #13, B5). Reading the
 * preloads out of the built page makes the header follow the page by
 * construction, the same way `md-twin-alternates.ts` follows the twins.
 *
 * This module has no relative imports, on purpose: `node --test` runs it
 * through Node's own type stripping (`scripts/ci/homelab-preload.test.mjs`),
 * which does not resolve `./utils.js` to `./utils.ts`. The caller in
 * `post-build.ts` validates the stamp with `buildStampLine` and writes the
 * file with `writeNginxSnippet`, like every other staged artifact.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

/** File name under the staging `maps/` directory (and under the delivered one). */
export const HOMELAB_PRELOAD_FILE = "homelab_preload.conf";

/**
 * The `map` variable the vhost appends to the Link header of the /homelab/
 * location. Prefixed with the domain because `map` variables are global across
 * every vhost on the box: an unprefixed name defined twice is one variable.
 */
export const HOMELAB_PRELOAD_VARIABLE = "$jmrp_homelab_preload";

/**
 * The pages served by the vhost's `location ~ ^/(?:es/)?homelab/...` block,
 * as directories under the build output. That location is the only one that
 * consumes the variable; every other route goes through the Worker, where an
 * Early Hint would be swallowed anyway.
 */
export const HOMELAB_PAGES = ["homelab/", "es/homelab/"] as const;

/** One `<link rel="preload">` of a built page, reduced to what a Link header carries. */
export interface Preload {
  /** Same-origin path of the preloaded file, e.g. `/_astro/fonts/abc.woff2`. */
  href: string;
  /** The `as` destination (`font`, `style`, `image`...). */
  as: string;
  /** The declared MIME type, when the tag has one. */
  type?: string;
  /** `anonymous` or `use-credentials`, when the tag has `crossorigin`. */
  crossorigin?: "anonymous" | "use-credentials";
}

/**
 * Characters allowed in a preload path. Deliberately narrower than what a URL
 * may hold: the value is interpolated into a double-quoted nginx string AND
 * into an RFC 8288 `<...>` reference, so a quote, a backslash, a `$` (nginx
 * would read it as a variable), a `>`, a comma or whitespace would each break
 * one of the two. Astro's hashed asset paths never need anything else.
 */
const SAFE_HREF = /^\/[\w./~-]+$/;

/** Characters allowed in the `as` and `type` tokens (`font`, `font/woff2`). */
const SAFE_TOKEN = /^[\w.+/-]+$/;

/**
 * Extracts the `<link rel="preload">` elements of one HTML document.
 *
 * Parsed with cheerio rather than a regular expression because the HTML has
 * been through `html-minifier-terser` by the time this runs, which reorders
 * nothing but does drop attribute quotes, and `rel` is a token list
 * (`rel="preload"` and `rel="preload prefetch"` both count).
 *
 * Only same-origin paths are kept: the header is served by this origin for
 * Early Hints, and a cross-origin preload would need its own `crossorigin`
 * reasoning that no page here has.
 *
 * @param html - A built HTML document.
 * @returns The preloads in document order, duplicates removed.
 * @throws If a same-origin preload has a path or a token that cannot be put
 *   into an nginx string and a Link header safely.
 */
export function collectPreloads(html: string): Preload[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const preloads: Preload[] = [];
  for (const element of $("link[rel][href]")) {
    const link = $(element);
    const attr: AttrReader = (name) => link.attr(name);
    const href = preloadHref(attr);
    if (href === null || seen.has(href)) continue;
    seen.add(href);
    preloads.push(toPreload(href, attr));
  }
  return preloads;
}

/** Reads one attribute of a `<link>`, `undefined` when it is absent. */
type AttrReader = (name: string) => string | undefined;

/**
 * The path a `<link>` preloads, or `null` when it is not a same-origin
 * preload (`rel` is a token list, so `preload prefetch` counts).
 *
 * @param attr - Reads the link's attributes.
 * @returns The `href`, or `null`.
 */
function preloadHref(attr: AttrReader): string | null {
  const rel = (attr("rel") ?? "").toLowerCase().split(/\s+/);
  if (!rel.includes("preload")) return null;
  const href = attr("href") ?? "";
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return href;
}

/**
 * Builds the preload of one `<link>`, refusing any value an nginx string or
 * a Link header could not carry.
 *
 * @param href - The same-origin path it preloads.
 * @param attr - Reads the link's attributes.
 * @returns The preload.
 * @throws If the path, `as` or `type` holds an unsafe character.
 */
function toPreload(href: string, attr: AttrReader): Preload {
  const as = (attr("as") ?? "").trim();
  const type = (attr("type") ?? "").trim();
  if (!SAFE_HREF.test(href) || !SAFE_TOKEN.test(as)) {
    throw new Error(
      `Refusing to announce the preload ${JSON.stringify(href)} (as=${JSON.stringify(as)}) in an Nginx Link header: it holds a character the quoted map value or the <...> reference cannot carry.`,
    );
  }
  if (type && !SAFE_TOKEN.test(type)) {
    throw new Error(
      `Refusing to announce the preload ${JSON.stringify(href)}: its type ${JSON.stringify(type)} is not a plain MIME token.`,
    );
  }
  const preload: Preload = { href, as };
  if (type) preload.type = type;
  const crossorigin = attr("crossorigin");
  if (crossorigin !== undefined) {
    preload.crossorigin =
      crossorigin.trim().toLowerCase() === "use-credentials"
        ? "use-credentials"
        : "anonymous";
  }
  return preload;
}

/**
 * Formats preloads as a Link header FRAGMENT with a leading `", "`.
 *
 * A fragment, not a whole header, for the reason `md-twin-alternates.ts`
 * gives: it is appended inside the location's existing `add_header Link`,
 * after `$jmrp_md_alternate`. A second `add_header Link` would emit two Link
 * headers under this box's `add_header_inherit merge`. The parameters are
 * unquoted tokens, which RFC 8288 allows for these values and which keeps the
 * nginx string free of escaped quotes; `crossorigin` is mandatory for a font
 * preload, or the browser fetches the font twice.
 *
 * @param preloads - The preloads of one page.
 * @returns The fragment, or `""` when the page preloads nothing.
 */
export function linkFragment(preloads: readonly Preload[]): string {
  return preloads
    .map((preload) => {
      const params = [`<${preload.href}>`, "rel=preload", `as=${preload.as}`];
      if (preload.type) params.push(`type=${preload.type}`);
      if (preload.crossorigin === "anonymous") {
        params.push("crossorigin");
      } else if (preload.crossorigin === "use-credentials") {
        params.push("crossorigin=use-credentials");
      }
      return `, ${params.join("; ")}`;
    })
    .join("");
}

/**
 * Reads the preloads of every /homelab/ page in a build, and checks that each
 * preloaded file is in that build.
 *
 * The existence check is what the hand-written header lacked: a preload whose
 * file the build did not write fails the build here, before the manifest, so
 * a broken page can never reach the header (or the swap).
 *
 * @param distDir - Build output directory.
 * @returns Each page's URI in the `index.html` form nginx sees at header time,
 *   with its preloads.
 * @throws If a /homelab/ page is missing from the build, or preloads a file
 *   the build does not contain.
 */
export function readHomelabPreloads(
  distDir: string,
): { uri: string; preloads: Preload[] }[] {
  return HOMELAB_PAGES.map((page) => {
    const htmlPath = path.join(distDir, page, "index.html");
    if (!fs.existsSync(htmlPath)) {
      throw new Error(
        `${path.join(page, "index.html")} is not in the build: the vhost's /homelab/ location reads ${HOMELAB_PRELOAD_VARIABLE} for it, so the map cannot be generated.`,
      );
    }
    const preloads = collectPreloads(fs.readFileSync(htmlPath, "utf8"));
    const missing = preloads.filter(
      (preload) => !fs.existsSync(path.join(distDir, preload.href.slice(1))),
    );
    if (missing.length > 0) {
      throw new Error(
        `/${page} preloads files the build does not contain: ${missing.map((preload) => preload.href).join(", ")}.`,
      );
    }
    return { uri: `/${page}index.html`, preloads };
  });
}

/**
 * Renders the snippet: one `map $uri` with an entry per /homelab/ page.
 *
 * Keyed on the `index.html` form and `volatile`, for the two reasons
 * documented at length in `md-twin-alternates.ts` and repeated in the file:
 * the index module internally redirects `/homelab/` to `/homelab/index.html`
 * before the header filter runs, and a non-volatile map would cache the
 * pre-redirect miss.
 *
 * @param pages - Output of {@link readHomelabPreloads}.
 * @param stampLine - The validated `# Build-Stamp: <id>` line (no newline).
 * @returns The full file content.
 */
export function renderHomelabPreloadMap(
  pages: readonly { uri: string; preloads: readonly Preload[] }[],
  stampLine: string,
): string {
  const entries = pages
    .map((page) => ({ uri: page.uri, value: linkFragment(page.preloads) }))
    .filter((entry) => entry.value !== "")
    .map((entry) => `    "${entry.uri}"  "${entry.value}";`)
    .join("\n");
  const total = pages.reduce((sum, page) => sum + page.preloads.length, 0);

  // Every bare `$` below is a literal nginx variable, not a JS interpolation:
  // only `${` starts a substitution in a template literal.
  return `# GENERATED FILE: DO NOT EDIT.
${stampLine}
# Written by src/integrations/post-build/homelab-preload.ts on every build.
#
# The rel=preload links of /homelab/ and /es/homelab/, read from the pages the
# build wrote, as a Link header fragment. Those two pages bypass the edge
# Worker (nginx fills in their metrics per request), and Cloudflare only turns
# preload links into Early Hints (HTTP 103) on routes no Worker handles.
#
# This replaces three font URLs that were written into the vhost by hand. The
# font file names are content hashes; they changed on 2026-11-06, the vhost did
# not, and every visit to /homelab/ asked for three fonts that 404ed for two
# weeks (GEO audit #13, B5). Generated, the header cannot name a file the page
# does not preload, and the build fails if the page preloads a file it did not
# write. deploy-live.mjs also warns when any rel=preload in nginx -T names a
# file missing from dist/.
#
# NOTE THE PREFIX. map variables are global across every vhost on this box;
# everything this site defines is prefixed jmrp_.
#
# The keys are the index.html form and the map is volatile, for the reasons
# given in md_twin_alternates.conf: the index module internally redirects
# /homelab/ to /homelab/index.html before the header filter runs, and a
# non-volatile map caches the pre-redirect miss.
#
# The value is a FRAGMENT with a leading ", ", appended after
# $jmrp_md_alternate inside the existing add_header Link of the /homelab/
# location, so there is still exactly one Link header:
#     add_header Link '<base>$jmrp_md_alternate${HOMELAB_PRELOAD_VARIABLE}' always;
#
# Preloads: ${total}

map $uri ${HOMELAB_PRELOAD_VARIABLE} {
    volatile;
    default "";
${entries ? `\n${entries}\n` : ""}}
`;
}
