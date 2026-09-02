import fs from "node:fs";
import path from "node:path";

import type { AstroIntegrationLogger } from "astro";
import { load } from "js-yaml";

import { assertNginxSafe, buildStampLine, writeNginxSnippet } from "./utils.js";

/**
 * Generates `docs_redirects.conf`: stable `/docs/<project-id>` URLs on
 * jmrp.io that 301 to each project's real documentation site.
 *
 * Why these exist (author's call, 2026-08-22): the `homepage` field of every
 * GitHub repo pointed at `jmrplens.github.io/...`, so the canonical domain
 * appeared nowhere on the project fiches that repos, scrapes and AI citations
 * surface. Pointing `homepage` straight at `jmrp.io/projects/` would have
 * sacrificed the direct path to the docs — the one thing a repo visitor wants.
 * A redirect keeps both: the visible URL carries the canonical domain (what
 * entity resolution feeds on — mentions, not link equity, which follows the
 * redirect to its destination), and the visitor still lands on the docs.
 *
 * Derived from `projects.yaml` on every build, same pattern as
 * `blog_redirects.conf`: adding a project needs no nginx edit. Staged for
 * delivery rather than written into dist/ or into the repo — see
 * `writeNginxSnippet` and the note at the write site below.
 */
const MAP_VARIABLE = "$project_docs_redirect";

/**
 * Escapes the regex metacharacters an id could contain.
 *
 * Ids are repository names, so `.` and `+` are both plausible and both would
 * otherwise widen the match to paths that are not the project's.
 *
 * @param value - The project id.
 * @returns The id, safe to embed in a regex.
 */
function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/** Shape of the fields this step reads from a `projects.yaml` entry. */
interface ProjectDocsEntry {
  id?: string;
  docs?: string;
}

/**
 * Writes the docs-redirect map for every project that declares a `docs` URL.
 *
 * @param stagingDir - Staging root for the generated Nginx snippets; the
 *   maps go in its `maps/` subdirectory, from where `deploy-live.mjs`
 *   moves them after the swap.
 * @param stamp - The per-build `# Build-Stamp:` banner, emitted verbatim as
 *   the snippet's second line; it is what proves, from `nginx -T`, that
 *   the running config came from this build.
 * @param logger - Astro integration logger.
 * @returns Resolves once the snippet has been written.
 */
export async function generateDocsRedirects(
  stagingDir: string,
  stamp: string,
  logger: AstroIntegrationLogger,
): Promise<void> {
  const yamlPath = path.join(
    process.cwd(),
    "src/content/profile/projects.yaml",
  );
  const raw = load(fs.readFileSync(yamlPath, "utf8")) as
    | ProjectDocsEntry[]
    | { projects?: ProjectDocsEntry[]; items?: ProjectDocsEntry[] };
  const items = Array.isArray(raw) ? raw : (raw.projects ?? raw.items ?? []);

  const pairs = items
    .filter(
      (p): p is Required<ProjectDocsEntry> =>
        typeof p.id === "string" && typeof p.docs === "string",
    )
    .map((p) => [`/docs/${p.id}`, p.docs] as const);

  // These two strings are interpolated into quoted Nginx map entries below and
  // never pass through the Zod content schema (this step reads the YAML
  // directly). See assertNginxSafe for what a stray quote costs.
  assertNginxSafe(
    pairs.flatMap(([from, to]) => [from, to]),
    "projects.yaml (id / docs)",
  );

  // Deep paths get a regex entry that carries the rest of the path across.
  // Without it `/docs/libgen-mcp/getting-started/` 404s, because an exact-key
  // map only ever matched the two bare forms — so the stable URL worked for a
  // project's front page and for nothing else in its documentation, which is
  // most of what anyone actually links to.
  //
  // The two bare forms stay EXACT on purpose: exact keys are a hash lookup and
  // are matched case-insensitively by nginx (verified live: /docs/LIBGEN-MCP
  // and /docs/cloudflare-dns-updater both resolve today), and regexes only run
  // when the hash misses. Turning them into regexes would cost that for
  // nothing.
  // Top-level routes the site itself owns. A project id equal to any of these
  // never gets a prefix-less redirect, because the site's own page must win.
  const RESERVED = new Set([
    "about",
    "assets",
    "blog",
    "cv",
    "docs",
    "es",
    "feeds",
    "fonts",
    "github",
    "homelab",
    "identity",
    "images",
    "license",
    "llms",
    "og",
    "privacy",
    "projects",
    "publications",
    "recursos",
    "robots",
    "rss",
    "scripts",
    "sitemap",
    "tools",
    "uses",
    "_astro",
    "api",
  ]);

  const entries = pairs
    .flatMap(([from, to]) => {
      const id = from.slice("/docs/".length);
      // A capture name has to be a valid nginx variable, and ids carry `-`.
      const capture = `docs_${id.toLowerCase().replaceAll(/[^a-z0-9]/gu, "_")}`;

      // Only a docs URL that is a real site root can carry a deeper path.
      // Six projects point at `github.com/<repo>#readme`, and appending to a
      // FRAGMENT produces `…TFG-TFM_EPS#readme/manual/` — a URL that resolves
      // to the repo front page while looking like it worked. Verified live
      // before this guard existed. The same test governs the query string:
      // `?q=x` after a fragment is malformed.
      const isSiteRoot = !to.includes("#") && !to.includes("?");
      if (!isSiteRoot) {
        return [`    "${from}"  "${to}";`, `    "${from}/"  "${to}";`];
      }

      // `$is_args$args` because `return 301` does NOT re-append the query the
      // way `rewrite` does, so a docs search link lost its terms.
      // String ops rather than `/\/+$/`: an anchored `+` over a run of the
      // same character is the backtracking shape SonarCloud flags, and the
      // loop says what it does.
      let base = to;
      while (base.endsWith("/")) base = base.slice(0, -1);
      return [
        `    "${from}"  "${to}$is_args$args";`,
        `    "${from}/"  "${to}$is_args$args";`,
        `    ~*^/docs/${escapeRegex(id)}(?<${capture}>/.+)$  "${base}$${capture}$is_args$args";`,
      ];
    })
    .join("\n");

  // The same targets again, without the `/docs/` prefix.
  //
  // Real traffic asks for them: in 24h on 2026-08-31 the access log carried 20
  // requests to `/libgen-mcp/architecture/`, `/gitlab-mcp-server/configuration/`
  // and eighteen more of that shape — one per path, each from a different
  // address, a distributed crawl working from a URL list that lost the prefix.
  // Every one 404'd while the `/docs/` form of the same path answers 200.
  //
  // Guarded by RESERVED so a repository can never claim a route the site owns.
  // A project id that collides is simply not given the bare form; the `/docs/`
  // one still works, which is the documented address anyway.
  const bareEntries = pairs
    .flatMap(([from, to]) => {
      const id = from.slice("/docs/".length);
      if (RESERVED.has(id.toLowerCase())) return [];
      const isSiteRoot = !to.includes("#") && !to.includes("?");
      if (!isSiteRoot) return [];
      const capture = `bare_${id.toLowerCase().replaceAll(/[^a-z0-9]/gu, "_")}`;
      let base = to;
      while (base.endsWith("/")) base = base.slice(0, -1);
      return [
        `    "/${id}"  "${to}$is_args$args";`,
        `    "/${id}/"  "${to}$is_args$args";`,
        `    ~*^/${escapeRegex(id)}(?<${capture}>/.+)$  "${base}$${capture}$is_args$args";`,
      ];
    })
    .join("\n");

  const content = `# GENERATED FILE — DO NOT EDIT.
${buildStampLine(stamp)}
# Written by src/integrations/post-build/docs-redirects.ts on every build,
# derived from src/content/profile/projects.yaml.
#
# Stable documentation URLs under the canonical domain: /docs/<project-id>
# 301s to the project's real docs site. Repo \`homepage\` fields point here so
# the canonical domain travels with every project fiche while the visitor
# still lands on the docs. If a docs site ever moves, edit projects.yaml and
# rebuild — one place, all consumers.
#
# Included at http level; consumed by the server block as:
#     if (${MAP_VARIABLE}) { return 301 ${MAP_VARIABLE}; }
#
# Projects: ${pairs.length} — two exact keys (bare and trailing slash) plus one
# regex per project that forwards any deeper path to the same docs site.

map $uri ${MAP_VARIABLE} {
    default "";

${entries}
${bareEntries}
}
`;

  // Staged rather than written into dist/ or into the repo working tree.
  // dist is the public blue/green symlink, and a generated file under
  // version control drifts from what Nginx actually loaded the moment a
  // build runs without a deploy. `scripts/deploy-live.mjs` MOVES this file
  // out of staging into the snippets directory the vhost includes, after
  // the swap; until it does, Nginx keeps the previously delivered copy.
  // The include there is a wildcard over the whole maps/ directory, so a
  // file that has not been delivered yet costs one redirect, where an exact
  // include of a missing path would instead refuse to start every vhost on
  // the box.
  const outPath = path.join(stagingDir, "maps", "docs_redirects.conf");
  await writeNginxSnippet(outPath, content);
  logger.info(`  ✓ Staged ${outPath} (${pairs.length} project docs redirects)`);
}
