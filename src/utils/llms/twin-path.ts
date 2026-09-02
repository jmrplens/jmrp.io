/**
 * Root-relative path of a page's markdown twin.
 *
 * The spec's own words: "pages with information that agents might need
 * provide a clean markdown version of those pages at the same URL as the
 * original page, either with `.md` appended (`page.html.md`) or with the
 * extension replaced by `.md` (`page.md`). (URLs without file names should
 * append `index.html.md` or `index.md` instead.)"
 *
 * Every page here ends in a slash and has no file name, so `index.md` is the
 * form that applies. The bare `<page>.md` shape this replaced is kept alive by
 * a redirect: it was advertised, and an agent that learned it should not meet
 * a 404.
 *
 * A leaf module on purpose: `BaseHead.astro` renders on all 128 pages and
 * needs this helper, while `@utils/llms` — where it used to live — eagerly
 * globs 60 component `.md.ts` modules and pulls in citation-js, the CV parser
 * and `astro:content`. None of that belongs in the head of every page.
 *
 * @param pagePath - Root-relative page URL, with its trailing slash.
 * @returns The twin's path.
 */
export function markdownTwinPath(pagePath: string): string {
  // String ops rather than `/\/+$/`: an anchored `+` over a run of the same
  // character is the backtracking shape SonarCloud flags, and the loop says
  // what it does.
  let base = pagePath;
  while (base.endsWith("/")) base = base.slice(0, -1);
  return `${base}/index.md`;
}
