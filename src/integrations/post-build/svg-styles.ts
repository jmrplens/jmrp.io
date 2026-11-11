/**
 * `<style>` elements inside inline SVG diagrams that the page must not apply.
 *
 * Split out of `html.ts` so `node --test` can load it straight from source: it
 * has no runtime imports, only a `CheerioAPI` type.
 */
import type * as cheerio from "cheerio";

/** The id rehype-mermaid gives each diagram's `<svg>`: `mermaid-0`, `mermaid-1`, and so on. */
const MERMAID_DIAGRAM_ID = /^mermaid-\d+$/;

/**
 * Removes the `<style>` that rehype-mermaid puts in each inline SVG, and the
 * stray `set:html` attribute from any other SVG `<style>`.
 *
 * Until `@astrojs/markdown-remark` 7.3.8 the Mermaid element reached the page
 * empty: MDX's `optimize` moved its CSS into a literal `set:html="…"`
 * ATTRIBUTE, so the browser applied none of it and the diagrams drew from
 * their presentation attributes and the site's own diagram CSS, which is how
 * they have always looked. GEO audit #11 (T4) counted 40 of them on 18 post
 * pages, 181,640 bytes of attribute text that every visit downloaded and
 * nothing read.
 *
 * 7.3.8 (withastro/astro#18698) stopped emptying it, and its CSS then applies.
 * It is Mermaid's default light theme, scoped to each diagram's id, so it
 * outranks the site's diagram CSS: in the dark theme it turned the actor and
 * note labels of a sequence diagram dark on dark, and its "neo" look rules
 * point at a `#mermaid-N-gradient` no diagram defines (90 broken fragments on
 * the internal-anchor check). So a `<style>` in a Mermaid diagram goes,
 * whatever it carries.
 *
 * Narrow on purpose, so it cannot reach a style that works elsewhere: any
 * `<style>` inside an `<svg>` whose id is rehype-mermaid's goes; in any other
 * SVG only a `<style>` that carries `set:html` changes, removed when empty and
 * otherwise keeping its CSS and losing only the stray attribute.
 *
 * @param $ - The parsed page.
 * @returns `true` when at least one element was changed.
 */
export function removeDeadSvgStyles($: cheerio.CheerioAPI): boolean {
  let modified = false;
  $("svg style").each((_, el) => {
    const $style = $(el);
    const diagramId = $style.closest("svg").attr("id") ?? "";
    if (MERMAID_DIAGRAM_ID.test(diagramId)) {
      $style.remove();
      modified = true;
      return;
    }
    if ($style.attr("set:html") === undefined) return;
    if ($style.text().trim() === "") $style.remove();
    else $style.removeAttr("set:html");
    modified = true;
  });
  return modified;
}
