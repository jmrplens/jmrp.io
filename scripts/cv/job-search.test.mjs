import assert from "node:assert/strict";
import { test } from "node:test";

import { publishableBasics } from "./job-search.mjs";

const basics = {
  name: "N",
  availability: "On-site, remote or hybrid",
  objetivo: ["Firmware"],
};

test("hides the job-search fields when showJobSearch is absent", () => {
  assert.deepEqual(publishableBasics(basics), { name: "N" });
});

test("hides them when showJobSearch is false", () => {
  assert.deepEqual(publishableBasics({ ...basics, showJobSearch: false }), {
    name: "N",
    showJobSearch: false,
  });
});

test("keeps them when showJobSearch is true", () => {
  const shown = { ...basics, showJobSearch: true };
  assert.deepEqual(publishableBasics(shown), shown);
});
