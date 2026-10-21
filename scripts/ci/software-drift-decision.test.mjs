/**
 * Unit tests for the drift guard's pass/fail decision (GEO audit #12, M1).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCEPTED_DIVERGENCES,
  classifyDivergences,
  driftSkip,
  exitCodeFor,
} from "./software-drift-decision.mjs";

test("the declared exception is matched by project id and property", () => {
  assert.deepEqual(
    classifyDivergences("gitlab-mcp-server", ["description", "license"]),
    { contradicting: ["license"], accepted: ["description"] },
  );
});

test("the same property on another project is a contradiction", () => {
  assert.deepEqual(classifyDivergences("phonometry", ["description"]), {
    contradicting: ["description"],
    accepted: [],
  });
});

test("no divergence, nothing to report", () => {
  assert.deepEqual(classifyDivergences("gitlab-mcp-server", []), {
    contradicting: [],
    accepted: [],
  });
});

test("every exception carries a reason and a date", () => {
  for (const entry of Object.values(ACCEPTED_DIVERGENCES)) {
    assert.match(entry.decided, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.reason.length > 10);
  }
});

test("only a contradiction fails the run", () => {
  assert.equal(exitCodeFor({ contradictions: 1 }), 1);
  assert.equal(exitCodeFor({ contradictions: 0 }), 0);
});

test("a project with its own docs site is compared", () => {
  assert.equal(
    driftSkip({
      id: "phonometry",
      status: "active",
      repo: "https://github.com/jmrplens/phonometry",
      docs: "https://docs.jmrp.io/phonometry/",
    }),
    null,
  );
});

test("a README-documented project is skipped silently, as before", () => {
  assert.deepEqual(
    driftSkip({
      id: "A-Lab",
      status: "archived",
      repo: "https://github.com/jmrplens/A-Lab",
      docs: "https://github.com/jmrplens/A-Lab#readme",
    }),
    { quiet: true, reason: "documentation is the repository README" },
  );
});

test("a project in development without a public repository is skipped out loud", () => {
  const skip = driftSkip({
    id: "device",
    status: "upcoming",
    docs: "https://docs.jmrp.io/device/",
  });
  assert.equal(skip?.quiet, false);
  assert.match(skip?.reason ?? "", /no public repository \(status: upcoming\)/);
});
