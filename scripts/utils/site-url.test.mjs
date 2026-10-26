import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { afterEach, beforeEach, test } from "node:test";

import { DEFAULT_SITE_URL, resolveSiteUrl } from "./site-url.mjs";

let dir;
let saved;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "site-url-"));
  saved = process.env.PUBLIC_SITE_URL;
  delete process.env.PUBLIC_SITE_URL;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (saved === undefined) delete process.env.PUBLIC_SITE_URL;
  else process.env.PUBLIC_SITE_URL = saved;
});

test("falls back to the default when neither the shell nor .env sets it", () => {
  assert.equal(resolveSiteUrl(dir), DEFAULT_SITE_URL);
});

test("reads PUBLIC_SITE_URL from .env (the case astro.config used to miss)", () => {
  fs.writeFileSync(path.join(dir, ".env"), "PUBLIC_SITE_URL=https://jmrp.eu\n");
  assert.equal(resolveSiteUrl(dir), "https://jmrp.eu");
});

test("an exported variable wins over .env", () => {
  fs.writeFileSync(path.join(dir, ".env"), "PUBLIC_SITE_URL=https://jmrp.eu\n");
  process.env.PUBLIC_SITE_URL = "https://jmrp.dev";
  assert.equal(resolveSiteUrl(dir), "https://jmrp.dev");
});

test("drops a trailing slash so callers can append paths", () => {
  fs.writeFileSync(
    path.join(dir, ".env"),
    "PUBLIC_SITE_URL=https://jmrp.eu/\n",
  );
  assert.equal(resolveSiteUrl(dir), "https://jmrp.eu");
});
