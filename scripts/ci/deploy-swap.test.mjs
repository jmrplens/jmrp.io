/* cspell:ignore mtimes */
/**
 * Tests for `scripts/deploy-swap.mjs swap`: a file the build did not change
 * keeps the modification time of the live build, because Nginx derives ETag and
 * Last-Modified from it, and anything else keeps the time of its build. The
 * script reads its root from the working directory and runs on load, so each
 * test gives it a throwaway tree and runs it as the deploy does.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../deploy-swap.mjs", import.meta.url));
const LIVE_SECONDS = 1_700_000_000;
const BUILD_SECONDS = 1_800_000_000;

const roots = [];
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Writes one file with a given modification time.
 * @param {string} file Absolute path; its directories are created.
 * @param {string} body Contents.
 * @param {number} seconds Modification time.
 * @returns {void}
 */
function write(file, body, seconds) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  fs.utimesSync(file, seconds, seconds);
}

/**
 * Creates a project root whose `dist` points at a live blue build, with a new
 * green build ready. Both get an index.html, which `swap` requires.
 * @param {Record<string, string>} live Live files by build-relative path.
 * @param {Record<string, string>} next New files by build-relative path.
 * @returns {string} The root.
 */
function makeRoot(live, next) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-swap-"));
  roots.push(root);
  const trees = [
    ["blue", { "index.html": "<live>", ...live }, LIVE_SECONDS],
    ["green", { "index.html": "<next>", ...next }, BUILD_SECONDS],
  ];
  for (const [color, files, seconds] of trees) {
    for (const [name, body] of Object.entries(files)) {
      write(path.join(root, "builds", color, name), body, seconds);
    }
  }
  fs.symlinkSync("builds/blue", path.join(root, "dist"));
  return root;
}

/**
 * Runs `swap` on the green build.
 * @param {string} root Project root.
 * @returns {string} What the script printed.
 */
function swap(root) {
  return execFileSync(process.execPath, [SCRIPT, "swap", "builds/green"], {
    cwd: root,
    encoding: "utf8",
  });
}

/**
 * Modification time of a file of the green build, in whole seconds.
 * @param {string} root Project root.
 * @param {string} name Build-relative path.
 * @returns {number} Seconds since the epoch.
 */
function greenSeconds(root, name) {
  const file = path.join(root, "builds", "green", name);
  return Math.trunc(fs.statSync(file).mtimeMs / 1000);
}

test("a byte-identical file takes the live mtime, nested and twin alike", () => {
  const files = {
    "llms.txt": "same",
    "llms.txt.br": "x",
    "pdf/a/cv.pdf": "%PDF",
  };
  const root = makeRoot(files, files);
  const printed = swap(root);
  for (const name of Object.keys(files)) {
    assert.equal(greenSeconds(root, name), LIVE_SECONDS, name);
  }
  assert.match(printed, /kept the validators of 3 unchanged files/u);
});

test("a changed file keeps its new mtime, whether or not its size changed", () => {
  const root = makeRoot(
    { "same-size.txt": "aaaa", "longer.txt": "aaaa" },
    { "same-size.txt": "bbbb", "longer.txt": "aaaaa" },
  );
  swap(root);
  assert.equal(greenSeconds(root, "same-size.txt"), BUILD_SECONDS);
  assert.equal(greenSeconds(root, "longer.txt"), BUILD_SECONDS);
  assert.equal(greenSeconds(root, "index.html"), BUILD_SECONDS);
});

test("a file new in this build, or a directory in the live one, is left alone", () => {
  const root = makeRoot(
    { "was-a-dir/inner.txt": "x" },
    {
      "new.txt": "x",
      "was-a-dir": "x",
    },
  );
  swap(root);
  assert.equal(greenSeconds(root, "new.txt"), BUILD_SECONDS);
  assert.equal(greenSeconds(root, "was-a-dir"), BUILD_SECONDS);
});

test("a symlink in the new build is not followed", () => {
  const root = makeRoot({ "link.txt": "x" }, { "real.txt": "x" });
  fs.symlinkSync("real.txt", path.join(root, "builds", "green", "link.txt"));
  swap(root);
  assert.equal(greenSeconds(root, "real.txt"), BUILD_SECONDS);
});

test("the swap still happens, and dist points at the new build", () => {
  const root = makeRoot({ "a.txt": "x" }, { "a.txt": "x" });
  swap(root);
  assert.equal(fs.readlinkSync(path.join(root, "dist")), "builds/green");
});

test("with nothing live, the first swap compares nothing and goes through", () => {
  const root = makeRoot({}, { "a.txt": "x" });
  fs.unlinkSync(path.join(root, "dist"));
  const printed = swap(root);
  assert.equal(greenSeconds(root, "a.txt"), BUILD_SECONDS);
  assert.equal(fs.readlinkSync(path.join(root, "dist")), "builds/green");
  assert.doesNotMatch(printed, /kept the validators/u);
});

test("swapping to the color already live changes no mtime", () => {
  const root = makeRoot({}, { "a.txt": "x" });
  fs.unlinkSync(path.join(root, "dist"));
  fs.symlinkSync("builds/green", path.join(root, "dist"));
  assert.doesNotMatch(swap(root), /kept the validators/u);
  assert.equal(greenSeconds(root, "a.txt"), BUILD_SECONDS);
});

test("a legacy real dist still lends its mtimes before it is migrated", () => {
  const root = makeRoot({ "a.txt": "x" }, { "a.txt": "x", "b.txt": "y" });
  fs.unlinkSync(path.join(root, "dist"));
  fs.renameSync(path.join(root, "builds", "blue"), path.join(root, "dist"));
  swap(root);
  assert.equal(greenSeconds(root, "a.txt"), LIVE_SECONDS);
  assert.equal(greenSeconds(root, "b.txt"), BUILD_SECONDS);
  assert.equal(fs.readlinkSync(path.join(root, "dist")), "builds/green");
  assert.ok(fs.existsSync(path.join(root, "builds", "blue", "a.txt")));
});

test("a second deploy of the same bytes keeps the first build's mtime", () => {
  const files = { "a.txt": "x" };
  const root = makeRoot(files, files);
  swap(root);
  const blue = path.join(root, "builds", "blue");
  fs.rmSync(blue, { recursive: true });
  for (const [name, body] of Object.entries({
    "index.html": "<third>",
    ...files,
  })) {
    write(path.join(blue, name), body, BUILD_SECONDS + 500);
  }
  execFileSync(process.execPath, [SCRIPT, "swap", "builds/blue"], {
    cwd: root,
  });
  const seconds = fs.statSync(path.join(blue, "a.txt")).mtimeMs / 1000;
  assert.equal(Math.trunc(seconds), LIVE_SECONDS);
});
