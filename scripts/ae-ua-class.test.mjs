import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { agentClass, agentName } from "./ae-ua-class.mjs";

const read = (name) =>
  fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

test("the classifier is docs-edge's, word for word", () => {
  const worker = read("workers/docs-edge/worker.js");
  const start = worker.indexOf("const NAMED_AGENTS = [");
  const end = worker.indexOf("/** Referer host");
  assert.ok(start !== -1 && end > start, "docs-edge no longer has the block");
  const copy = read("scripts/ae-ua-class.mjs");
  const from = copy.indexOf(
    "// --- copy of workers/docs-edge/worker.js begins ---\n",
  );
  const to = copy.indexOf(
    "// --- copy of workers/docs-edge/worker.js ends ---",
  );
  const body = copy
    .slice(
      from + "// --- copy of workers/docs-edge/worker.js begins ---\n".length,
      to,
    )
    .replaceAll("export function ", "function ");
  assert.equal(body, worker.slice(start, end));
});

test("a named crawler, a browser and an empty user agent", () => {
  const gpt =
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot";
  assert.equal(agentClass(gpt), "bot");
  assert.equal(agentName(gpt, "bot"), "GPTBot");
  const chrome =
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  assert.equal(agentClass(chrome), "browser");
  assert.equal(agentName(chrome, "browser"), "Chrome");
  assert.equal(agentClass(""), "empty-ua");
  assert.equal(agentName("", "empty-ua"), "(sin-ua)");
});
