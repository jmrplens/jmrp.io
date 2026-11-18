/* cspell:ignore jmrp */
/**
 * Unit tests for the edge sites ae-to-influx.mjs ingests: which Cloudflare
 * account each dataset lives in, and the per-site window, so one site whose
 * query fails cannot stall the others.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BEACON_COLUMNS,
  collectSites,
  DEFAULT_ACCOUNT,
  EDGE_SITES,
  firstRowPending,
  nextState,
  siteWindow,
} from "./ae-sites.mjs";

test("every site names its account; phonometry.dev reads its own", () => {
  for (const site of EDGE_SITES) {
    assert.match(site.account, /^[0-9a-f]{32}$/u, site.site);
  }
  const jmrp = EDGE_SITES.filter((s) => s.account === DEFAULT_ACCOUNT);
  assert.deepEqual(
    jmrp.map((s) => s.site),
    ["jmrp", "mcp", "docs"],
  );
  const dev = EDGE_SITES.find((s) => s.site === "phonometry-dev");
  assert.deepEqual(dev, {
    dataset: "phonometry_dev_requests",
    site: "phonometry-dev",
    host: "phonometry.dev",
    account: "4dbfb3b955a0c856bfe066f2a6061dd5",
    ingestAll: true,
    beacon: true,
    awaitsFirstRow: true,
  });
});

test("a site's window starts where it last ended, or at the shared end", () => {
  const state = { lastEnd: 1000, sites: { docs_edge_requests: 700 } };
  const docs = EDGE_SITES.find((s) => s.site === "docs");
  const dev = EDGE_SITES.find((s) => s.site === "phonometry-dev");
  assert.deepEqual(siteWindow(state, docs, 1300, 86_400), [700, 1300]);
  assert.deepEqual(siteWindow(state, dev, 1300, 86_400), [1000, 1300]);
});

test("a window is capped to the longest backfill and empty when not ready", () => {
  const site = EDGE_SITES[0];
  assert.deepEqual(
    siteWindow({ lastEnd: 0 }, site, 200_000, 86_400),
    [113_600, 200_000],
  );
  assert.equal(siteWindow({ lastEnd: 500 }, site, 500, 86_400), null);
  assert.deepEqual(siteWindow(null, site, 1300, 600), [700, 1300]);
});

test("a failed site keeps its end; the others move on", () => {
  const before = { lastEnd: 1000, sites: {} };
  const after = nextState(before, 1300, {
    jmrp_edge_requests: true,
    mcp_edge_requests: true,
    docs_edge_requests: true,
    phonometry_dev_requests: false,
  });
  assert.deepEqual(after, {
    lastEnd: 1300,
    sites: {
      jmrp_edge_requests: 1300,
      mcp_edge_requests: 1300,
      docs_edge_requests: 1300,
      phonometry_dev_requests: 1000,
    },
    answered: [],
  });
});

test("a site that fails on the first run keeps the start it tried", () => {
  const after = nextState(
    null,
    1300,
    { jmrp_edge_requests: true },
    {
      mcp_edge_requests: 700,
    },
  );
  assert.equal(after.sites.jmrp_edge_requests, 1300);
  assert.equal(after.sites.mcp_edge_requests, 700);
});

test("the beacon columns follow the phonometry.dev Worker's doubles 10 to 15", () => {
  assert.equal(
    BEACON_COLUMNS,
    "double10 AS load_ms, double11 AS screen_w, double12 AS screen_h, double13 AS viewport_w, double14 AS viewport_h, double15 AS dpr",
  );
});

const DEV = EDGE_SITES.find((s) => s.site === "phonometry-dev");
const DOCS = EDGE_SITES.find((s) => s.site === "docs");

test("before its first row the new dataset's two answers are an empty window", () => {
  assert.equal(firstRowPending(DEV, null, "AE 403: Authorization error"), true);
  assert.equal(
    firstRowPending(
      DEV,
      { lastEnd: 1 },
      "AE 422: unable to find type of column: timestamp",
    ),
    true,
  );
});

test("once the dataset has answered, or for any other site or error, a failure counts", () => {
  const answered = { answered: ["phonometry_dev_requests"] };
  assert.equal(
    firstRowPending(DEV, answered, "AE 403: Authorization error"),
    false,
  );
  assert.equal(
    firstRowPending(DOCS, null, "AE 403: Authorization error"),
    false,
  );
  assert.equal(firstRowPending(DEV, null, "AE 500: internal error"), false);
  assert.equal(firstRowPending(DEV, null, "fetch failed"), false);
});

test("the state keeps every dataset that has answered", () => {
  const first = nextState(
    null,
    1300,
    { jmrp_edge_requests: true, phonometry_dev_requests: false },
    {},
    { jmrp_edge_requests: true, phonometry_dev_requests: false },
  );
  assert.deepEqual(first.answered, ["jmrp_edge_requests"]);
  const second = nextState(
    first,
    1600,
    { phonometry_dev_requests: true },
    {},
    { phonometry_dev_requests: true },
  );
  assert.deepEqual(second.answered, [
    "jmrp_edge_requests",
    "phonometry_dev_requests",
  ]);
});

test("collectSites keeps what the sites that answered returned when one rejects", async () => {
  const { lines, failed } = await collectSites(EDGE_SITES, async (site) => {
    if (site.site === "phonometry-dev") {
      throw new Error("AE 403: Authorization error");
    }
    return [`row ${site.site}`];
  });
  assert.deepEqual(lines, ["row jmrp", "row mcp", "row docs"]);
  assert.deepEqual(
    failed.map(({ site, error }) => [site.site, error.message]),
    [["phonometry-dev", "AE 403: Authorization error"]],
  );
});
