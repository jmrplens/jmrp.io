/**
 * Unit tests for `removeDeadSvgStyles`
 * (`src/integrations/post-build/svg-styles.ts`).
 *
 * The defect (GEO audit #11, T4): each Mermaid diagram carried a `<style>`
 * whose CSS sat in a literal `set:html` attribute, leaving the element empty
 * and the CSS unapplied: 40 elements, 181,640 bytes on 18 pages. The step must
 * remove exactly those and nothing that styles the page: not a `<style>`
 * outside an SVG, not an SVG `<style>` without the attribute, and not the CSS
 * of one that ever arrives with content.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as cheerio from "cheerio";

import { removeDeadSvgStyles } from "../../src/integrations/post-build/svg-styles.ts";

/** The shape rehype-mermaid's SVG reaches the post-build pass in. */
const DIAGRAM = `<pre class="mermaid"><svg id="mermaid-0" viewBox="0 0 10 10" role="img"><style set:html="#mermaid-0{font-family:arial,sans-serif;fill:#000000;}"></style><g><rect width="10" height="10" fill="#f5a623"></rect></g></svg></pre>`;

/** Runs the step over a document. */
function run(body) {
  const $ = cheerio.load(`<html><head></head><body>${body}</body></html>`);
  const modified = removeDeadSvgStyles($);
  return { $, modified };
}

test("removes the empty set:html <style> inside a diagram", () => {
  const { $, modified } = run(DIAGRAM);
  assert.equal(modified, true);
  assert.equal($("svg style").length, 0);
  assert.doesNotMatch($.html(), /set:html/);
});

test("leaves the rest of the diagram byte-identical", () => {
  const { $ } = run(DIAGRAM);
  const expected = cheerio.load(
    `<html><head></head><body>${DIAGRAM.replace(/<style[^>]*><\/style>/, "")}</body></html>`,
  );
  assert.equal($.html(), expected.html());
});

test("removes every one on a page with several diagrams", () => {
  const { $ } = run(DIAGRAM + DIAGRAM.replaceAll("mermaid-0", "mermaid-1"));
  assert.equal($("svg").length, 2);
  assert.equal($("style").length, 0);
});

test("does not touch a <style> outside an SVG, even with the attribute", () => {
  const { $, modified } = run(
    `<style set:html="p{color:red}"></style><style>.a{color:red}</style>`,
  );
  assert.equal(modified, false);
  assert.equal($("style").length, 2);
});

test("does not touch an SVG <style> without the attribute", () => {
  const { $, modified } = run(
    `<svg viewBox="0 0 1 1"><style>.b{fill:red}</style></svg>`,
  );
  assert.equal(modified, false);
  assert.equal($("svg style").text(), ".b{fill:red}");
});

test("keeps real CSS and drops only the stray attribute", () => {
  const { $, modified } = run(
    `<svg viewBox="0 0 1 1"><style set:html=".c{fill:red}">.c{fill:blue}</style></svg>`,
  );
  assert.equal(modified, true);
  assert.equal($("svg style").length, 1);
  assert.equal($("svg style").text(), ".c{fill:blue}");
  assert.equal($("svg style").attr("set:html"), undefined);
});
