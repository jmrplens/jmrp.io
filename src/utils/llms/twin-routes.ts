/**
 * Which page routes have a markdown twin — derived from the twins themselves.
 *
 * The `<link rel="alternate" type="text/markdown">` tag used to be an opt-in
 * prop: each page component passed `markdownHref` down to `BaseLayout`. Nine
 * components passed it and four never did, so `/blog/series/`, its three
 * series hubs, `/feeds/` and the five `/tools/categories/<cat>/` pages — 20
 * across both locales — served a twin that no HTML on the site announced
 * (GEO audit #6, A2). Ten of those twins had never been fetched once in 22
 * days of logs while their HTML had: the head tag was the only channel those
 * pages had, and it was the one thing a component could silently forget.
 *
 * So the condition now comes from the twins. Every markdown twin in this
 * project is an `index.md.ts` endpoint living in the page's own directory, so
 * the directory a twin endpoint sits in IS the route pattern of the page it
 * twins. Adding a twin announces it; there is no list to keep in sync, which
 * is the failure mode the prop had.
 *
 * @module
 */
import { markdownTwinPath } from "@utils/llms/twin-path";

/** Glob-key prefix that is the pages directory rather than the route. */
const PAGES_PREFIX = "/src/pages";

/** Glob-key tail that names the endpoint rather than the route. */
const TWIN_SUFFIX = "/index.md.ts";

/**
 * Route patterns — `Astro.routePattern` form — of every page with a twin.
 *
 * `/src/pages/blog/series/[series]/index.md.ts` → `/blog/series/[series]`;
 * `/src/pages/index.md.ts` → `/` (globstar matches zero segments, so the
 * homepage twin is included).
 *
 * Only the glob's KEYS are read and no loader is ever called, so none of the
 * twin endpoints is pulled into this module's graph.
 */
const TWIN_ROUTE_PATTERNS: ReadonlySet<string> = new Set(
  Object.keys(import.meta.glob("/src/pages/**/index.md.ts")).map(
    (file) => file.slice(PAGES_PREFIX.length, -TWIN_SUFFIX.length) || "/",
  ),
);

// An empty registry would drop the tag from all 96 twinned pages at once —
// five times the blast radius of the bug this replaces — and would do it
// silently, because "no twin" is a legitimate answer for any single page. A
// moved pages directory or a renamed endpoint is the way that happens, so it
// fails the build at module load instead.
if (TWIN_ROUTE_PATTERNS.size === 0) {
  throw new Error(
    "twin-routes: no `index.md.ts` endpoints matched under /src/pages, so " +
      "every markdown twin link would be dropped.",
  );
}

/**
 * This page's markdown twin, or `undefined` when it has none.
 *
 * `[...slug]` is folded to `[slug]`: posts and tools are rest routes
 * (`/blog/[...slug]`) while their twins are single-segment
 * (`/blog/[slug]/index.md`), and both sides build their path set from the same
 * collection query, so the two name the same pages.
 *
 * @param routePattern - `Astro.routePattern` of the page being rendered.
 * @param pathname - `Astro.url.pathname` of the page being rendered.
 * @returns Root-relative path of the twin, or `undefined` when there is none.
 * @throws If `routePattern` is empty — that would drop the tag from all 96
 *   pages at once, which is the silent regression this replaces.
 */
export function markdownTwinHref(
  routePattern: string,
  pathname: string,
): string | undefined {
  if (!routePattern) {
    throw new Error(
      "markdownTwinHref: Astro.routePattern is empty, so the markdown " +
        "twin link cannot be resolved.",
    );
  }
  return TWIN_ROUTE_PATTERNS.has(routePattern.replaceAll("[...", "["))
    ? markdownTwinPath(pathname)
    : undefined;
}
