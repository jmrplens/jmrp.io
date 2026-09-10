/**
 * Guards the vendored third-party brand marks in `src/icons/vendored/`.
 *
 * These are other people's logos, committed here because Iconify does not
 * carry them (see the collection's `provenance.json` and the `vendored`
 * collection in uno.config.ts). Two things about them rot silently:
 *
 * 1. Provenance. A mark with no recorded source, fetch date and license or
 *    brand wording is a mark nobody can re-verify or defend, and the record
 *    only stays true if adding a file without an entry FAILS.
 * 2. Shape. UnoCSS renders these through the same pipeline as the Iconify
 *    ones, so a mark that kept its own width/height, a hard-coded colour, an
 *    `id` that can collide when several are inlined on one page, or a viewBox
 *    other than the 24-unit one, renders at the wrong size or in the wrong
 *    colour instead of erroring.
 *
 * Prose in a README cannot check either, so this does.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const DIR = path.join(import.meta.dirname, "../../src/icons/vendored");
const MANIFEST = path.join(DIR, "provenance.json");

/**
 * Code-unit comparison, the same locale-free ordering the popover itself uses
 * (see `sortKey` in src/utils/project-listings.ts). Only used here to compare
 * two file listings, so it just has to be total and deterministic.
 *
 * @param a - Left name.
 * @param b - Right name.
 * @returns Negative, zero or positive.
 */
function byCodeUnit(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const files = readdirSync(DIR)
  .filter((file) => file.endsWith(".svg"))
  .sort(byCodeUnit);

test("every vendored icon has a provenance entry, and vice versa", () => {
  const recorded = manifest.icons.map((icon) => icon.file).sort(byCodeUnit);
  assert.deepEqual(
    files,
    recorded,
    "src/icons/vendored/*.svg and provenance.json disagree",
  );
});

test("every provenance entry records where the mark came from", () => {
  // ISO date, so "when was this fetched" is answerable and comparable.
  assert.match(manifest.fetchedOn, /^\d{4}-\d{2}-\d{2}$/);
  for (const icon of manifest.icons) {
    const where = `${icon.file}: `;
    assert.ok(icon.label, `${where}no label`);
    assert.match(icon.site, /^https:\/\//, `${where}no site URL`);
    assert.match(icon.source, /^https:\/\//, `${where}no source URL`);
    assert.ok(
      ["iconify", "site", "reconstruction"].includes(icon.origin),
      `${where}origin must be "iconify", "site" or "reconstruction"`,
    );
    // A mark's tone decides how UnoCSS serves it, so it is not cosmetic
    // metadata: see the shape test below.
    assert.ok(
      ["monochrome", "multitone"].includes(icon.tone),
      `${where}tone must be "monochrome" or "multitone"`,
    );
    if (icon.tone === "multitone") {
      // Multi-tone artwork cannot be a currentColor mask, so UnoCSS serves it
      // as a background image and it stays the same in both themes. That is a
      // real limitation of the icon and has to be written down, not discovered.
      assert.equal(
        icon.followsTheme,
        false,
        `${where}a multitone mark renders as a background image, so it must record followsTheme: false`,
      );
      assert.ok(
        icon.note,
        `${where}a multitone mark must note why its fixed palette is acceptable`,
      );
    }
    // Either a license grant or the wording that stands in for one; a mark
    // with neither has not actually been checked.
    assert.ok(
      icon.license && (icon.origin === "iconify" || icon.termsWording),
      `${where}no license or terms wording recorded`,
    );
    assert.ok(
      Array.isArray(icon.modifications) && icon.modifications.length > 0,
      `${where}no record of what was changed`,
    );
  }
});

test("entries left on the generic icon record why", () => {
  for (const entry of manifest.leftOnGenericIcon ?? []) {
    assert.ok(entry.label, "no label");
    assert.match(entry.site, /^https:\/\//);
    // Long enough to be a reason rather than a shrug.
    assert.ok(entry.reason?.length > 40, `${entry.label}: reason too thin`);
  }
});

test("every vendored icon is normalized to the repo's icon shape", () => {
  assert.ok(files.length > 0, "no vendored icons found");
  for (const file of files) {
    const svg = readFileSync(path.join(DIR, file), "utf8");
    const where = `${file}: `;
    const root = svg.match(/<svg[^>]*>/);
    assert.ok(root, `${where}no root <svg>`);
    assert.match(
      root[0],
      /viewBox="0 0 24 24"/,
      `${where}root viewBox must be "0 0 24 24"`,
    );
    assert.doesNotMatch(
      root[0],
      /\b(width|height)=/,
      `${where}root must not set width/height; the utility sizes the icon`,
    );
    assert.doesNotMatch(
      svg,
      /<style/,
      `${where}no <style> block: it would leak into every page inlining it`,
    );
    assert.doesNotMatch(
      svg,
      /\bid="/,
      `${where}no id attributes: they collide when marks share a page`,
    );
    // The paint rules depend on the mark's tone, because the two kinds go
    // down different UnoCSS paths. A monochrome mark must be pure
    // currentColor so it becomes a mask that follows the theme; a multitone
    // one is official artwork whose palette is the point, so it keeps its
    // own colours and must NOT claim currentColor, which would make UnoCSS
    // treat it as a mask and flatten the whole thing to one tone.
    const tone = manifest.icons.find((icon) => icon.file === file)?.tone;
    if (tone === "monochrome") {
      assert.doesNotMatch(
        svg,
        /#[0-9a-fA-F]{3,8}\b/,
        `${where}no hard-coded colours in a monochrome mark; paint with currentColor`,
      );
      assert.doesNotMatch(
        svg,
        /(fill|stroke)="(?!none|currentColor)[^"]+"/,
        `${where}every fill and stroke must be currentColor or none`,
      );
      assert.ok(
        /(fill|stroke)="currentColor"/.test(svg),
        `${where}nothing painted with currentColor: the mark would be invisible`,
      );
    } else {
      assert.doesNotMatch(
        svg,
        /currentColor/,
        `${where}a multitone mark must not mix in currentColor: UnoCSS would serve it as a mask and collapse its palette`,
      );
      assert.ok(
        /(fill|stroke)="#[0-9a-fA-F]{3,8}"/.test(svg),
        `${where}a multitone mark is expected to carry its own palette`,
      );
    }
    // One viewBox means one root: a nested <svg> would carry its own.
    assert.equal(
      svg.match(/<svg\b/g).length,
      1,
      `${where}exactly one <svg> element expected`,
    );
  }
});
