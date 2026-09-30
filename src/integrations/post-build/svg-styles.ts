/**
 * Dead `<style>` elements inside inline SVG diagrams.
 *
 * Split out of `html.ts` so `node --test` can load it straight from source: it
 * has no runtime imports, only a `CheerioAPI` type.
 */
import type * as cheerio from "cheerio";

/**
 * Removes the `<style>` that rehype-mermaid puts in each inline SVG and that
 * reaches the page empty.
 *
 * On its way through Astro's MDX pipeline the element's CSS ends up in a
 * literal `set:html="…"` ATTRIBUTE and the element itself has no content, so
 * the browser applies none of it: the diagrams draw from their presentation
 * attributes, which is how they have always looked. GEO audit #11 (T4)
 * counted 40 of them on 18 post pages, 181,640 bytes of attribute text that
 * every visit downloads and nothing reads.
 *
 * Narrow on purpose, so it cannot reach a style that works: only a `<style>`
 * that is inside an `<svg>` AND carries `set:html`. An empty one is removed;
 * one that ever arrives with CSS inside keeps it and loses only the stray
 * attribute.
 *
 * @param $ - The parsed page.
 * @returns `true` when at least one element was changed.
 */
export function removeDeadSvgStyles($: cheerio.CheerioAPI): boolean {
  let modified = false;
  $("svg style").each((_, el) => {
    const $style = $(el);
    if ($style.attr("set:html") === undefined) return;
    if ($style.text().trim() === "") $style.remove();
    else $style.removeAttr("set:html");
    modified = true;
  });
  return modified;
}
