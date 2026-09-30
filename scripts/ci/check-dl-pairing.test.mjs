/**
 * Unit tests for the description-list pairing guard.
 *
 * GEO audit #11 (C2) shipped 24 value-first tiles that no existing check saw.
 * Every rule gets a fixture that breaks exactly it, the audit's real markup is
 * replayed as found in production, and the fixed markup must pass.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { checkDist, checkDlPairing } from "./check-dl-pairing.mjs";

const SCRIPT = fileURLToPath(new URL("check-dl-pairing.mjs", import.meta.url));

/** A minimal page around a body fragment. */
const page = (body) =>
  `<!DOCTYPE html><html lang="en"><head><title>t</title></head><body>${body}</body></html>`;

/** Problems only, for terse assertions. */
const problems = (body) => checkDlPairing(page(body)).map((v) => v.problem);

// The tile as production served it before the fix (minified, scoped attrs).
const INVERTED_TILE =
  '<div class="upstream__tile" data-astro-cid-wz2c2wp2=""><dd data-astro-cid-wz2c2wp2="">PRJ_CODE_MERGED</dd><dt data-astro-cid-wz2c2wp2="">code &amp; docs PRs and MRs merged</dt></div>';
const FIXED_TILE =
  '<div class="upstream__tile" data-astro-cid-wz2c2wp2=""><dt data-astro-cid-wz2c2wp2="">code &amp; docs PRs and MRs merged</dt><dd data-astro-cid-wz2c2wp2="">PRJ_CODE_MERGED</dd></div>';

test("a page without a <dl> is clean", () => {
  assert.deepEqual(problems("<p>no lists here</p>"), []);
});

test("div groups of dt then dd pass", () => {
  assert.deepEqual(
    problems(
      '<dl class="ok"><div><dt>Mask</dt><dd>255.255.255.0</dd></div><div><dt>Hosts</dt><dd>254</dd></div></dl>',
    ),
    [],
  );
});

test("bare groups with several dt and several dd pass", () => {
  assert.deepEqual(
    problems(
      "<dl><dt>role</dt><dt>job</dt><dd>engineer</dd><dd>R&amp;D</dd><dt>base</dt><dd>Spain</dd></dl>",
    ),
    [],
  );
});

test("an empty <dl> passes (zero groups is allowed)", () => {
  assert.deepEqual(problems("<dl></dl>"), []);
});

test("the production tile, value first, fails once per group", () => {
  const found = checkDlPairing(
    page(
      `<dl class="upstream__tiles">${INVERTED_TILE}${INVERTED_TILE}${INVERTED_TILE}${INVERTED_TILE}</dl>`,
    ),
  );
  assert.equal(found.length, 4);
  for (const v of found) {
    assert.equal(v.list, '<dl class="upstream__tiles">');
    assert.match(v.problem, /starts with <dd>/);
    assert.match(v.problem, /<dt> with no <dd> after it/);
    // The snippet names the group without Astro's scoping noise.
    assert.doesNotMatch(v.snippet, /data-astro-cid/);
    assert.match(v.snippet, /^<div class="upstream__tile"><dd>/);
  }
});

test("the fixed tile, label first, passes", () => {
  assert.deepEqual(
    problems(
      `<dl class="upstream__tiles">${FIXED_TILE}${FIXED_TILE}${FIXED_TILE}${FIXED_TILE}</dl>`,
    ),
    [],
  );
});

test("a div group without <dd> fails", () => {
  assert.deepEqual(problems("<dl><div><dt>label</dt></div></dl>"), [
    "<div> group has no <dd>; has a <dt> with no <dd> after it",
  ]);
});

test("a div group without <dt> fails", () => {
  assert.deepEqual(problems("<dl><div><dd>42</dd></div></dl>"), [
    "<div> group has no <dt>; starts with <dd>",
  ]);
});

test("a div holding two groups fails", () => {
  assert.deepEqual(
    problems("<dl><div><dt>a</dt><dd>1</dd><dt>b</dt><dd>2</dd></div></dl>"),
    ["<div> group holds more than one group"],
  );
});

test("a bare list that starts with <dd> fails", () => {
  assert.deepEqual(problems("<dl><dd>42</dd><dt>answer</dt><dd>x</dd></dl>"), [
    "starts with <dd>",
  ]);
});

test("a bare list ending in a <dt> fails", () => {
  assert.deepEqual(problems("<dl><dt>a</dt><dd>1</dd><dt>b</dt></dl>"), [
    "has a <dt> with no <dd> after it",
  ]);
});

test("mixing div groups with bare dt/dd fails", () => {
  const found = problems(
    "<dl><div><dt>a</dt><dd>1</dd></div><dt>b</dt><dd>2</dd></dl>",
  );
  assert.deepEqual(found, ["mixes <div> groups with bare <dt>/<dd>"]);
});

test("a stray element inside a group fails; script and template do not", () => {
  assert.deepEqual(
    problems("<dl><div><dt>a</dt><p>x</p><dd>1</dd></div></dl>"),
    ["<div> group holds a <p>"],
  );
  assert.deepEqual(
    problems(
      "<dl><template></template><div><dt>a</dt><script>1</script><dd>1</dd></div></dl>",
    ),
    [],
  );
});

test("omitted end tags are parsed as the browser does", () => {
  // The spec lets </dt> and </dd> be omitted; a pattern match would misread
  // both of these, the parser does not.
  assert.deepEqual(problems("<dl><dt>a<dd>1<dt>b<dd>2</dl>"), []);
  assert.deepEqual(problems("<dl><dd>1<dt>a</dl>"), [
    "starts with <dd>; has a <dt> with no <dd> after it",
  ]);
});

test("a <dl> nested in a <dd> is checked on its own", () => {
  const found = checkDlPairing(
    page(
      '<dl class="outer"><dt>a</dt><dd><dl class="inner"><dd>1</dd><dt>b</dt></dl></dd></dl>',
    ),
  );
  assert.equal(found.length, 1);
  assert.equal(found[0].list, '<dl class="inner">');
});

/**
 * Writes a scratch site and returns its directory.
 *
 * @param {Record<string, string>} files - Relative path to page body.
 * @returns {string} The directory.
 */
function makeSite(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-pairing-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, page(body));
  }
  return dir;
}

test("checkDist names each offending file relative to the build", () => {
  const dir = makeSite({
    "index.html": "<p>home</p>",
    "projects/index.html": `<dl class="upstream__tiles">${INVERTED_TILE}</dl>`,
    "es/projects/index.html": `<dl class="upstream__tiles">${FIXED_TILE}</dl>`,
  });
  try {
    const { violations, pages } = checkDist(dir);
    assert.equal(pages, 3);
    assert.deepEqual(
      violations.map((v) => v.file),
      [path.join("projects", "index.html")],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exit codes: 0 clean, 1 wrongly paired, 2 could not run", () => {
  const clean = makeSite({
    "index.html": `<dl>${FIXED_TILE}</dl>`,
  });
  const broken = makeSite({
    "index.html": `<dl>${INVERTED_TILE}</dl>`,
  });
  const notASite = fs.mkdtempSync(path.join(os.tmpdir(), "dl-pairing-"));
  try {
    const run = (dir) =>
      spawnSync(process.execPath, [SCRIPT, dir], { encoding: "utf8" });
    assert.equal(run(clean).status, 0);
    const failed = run(broken);
    assert.equal(failed.status, 1);
    assert.match(
      failed.stderr,
      /index\.html <dl>: <div> group starts with <dd>/,
    );
    assert.equal(run(notASite).status, 2);
    assert.equal(run(path.join(notASite, "missing")).status, 2);
  } finally {
    for (const dir of [clean, broken, notASite])
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
