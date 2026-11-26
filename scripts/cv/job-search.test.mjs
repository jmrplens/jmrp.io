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
  // Compared with a separate copy: comparing with `shown` itself would pass
  // even if the function deleted the fields in place.
  assert.deepEqual(publishableBasics(shown), {
    ...basics,
    showJobSearch: true,
  });
});

test("never changes the object it is given", () => {
  const input = { ...basics, showJobSearch: false };
  publishableBasics(input);
  assert.deepEqual(input, { ...basics, showJobSearch: false });
});
