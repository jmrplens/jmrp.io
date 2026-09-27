/**
 * Guards the display projection that decides whether the scheduled rebuild
 * runs: volatile fields must never move the hash, displayed ones must.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  compactStars,
  decideRebuild,
  hashProjection,
  readState,
  recordBuiltDataset,
  resolveMaxAgeDays,
  resolveStatePath,
  stableStringify,
} from "./rebuild-state.mjs";

/** A small dataset shaped like `projects-contributions.json`. */
function makeDataset() {
  return {
    schemaVersion: 1,
    generatedAt: "2026-09-26T20:35:39.488Z",
    asOf: "2026-09-26T13:03:19",
    summary: {
      contributionTotals: {
        prMerged: 59,
        prOpen: 21,
        prClosed: 19,
        issuesOpen: 26,
        issuesClosed: 19,
        repos: 54,
      },
      codeVsListingSplit: {
        codeOrDocs: { merged: 45, open: 16, medianHoursToMerge: 49.7 },
        listing: { merged: 14, open: 5, medianHoursToMerge: 8.8 },
      },
      answersCount: 2,
      discussionTotals: { comments: 99, discussions: 75, repos: 52 },
    },
    highlights: [
      {
        repo: "acmesh-official/acme.sh",
        number: 7237,
        kind: "pull_request",
        platform: "github",
        why: { en: "Why", es: "Por qué" },
        redacted: false,
      },
    ],
    contributedTo: [
      {
        project: "acme.sh",
        repo: "acmesh-official/acme.sh",
        platform: "github",
        merged: 1,
        lastMergedAt: "2026-09-10T13:56:24",
        stars: 38_012,
      },
      {
        project: "Beszel",
        repo: "henrygd/beszel",
        platform: "github",
        merged: 2,
        lastMergedAt: "2026-09-12T10:00:00",
        stars: 708,
      },
    ],
    acceptedAnswers: [
      {
        fullName: "a/b",
        number: 1,
        title: "Q",
        answerUrl: "https://example.com/1",
        answeredAt: "2026-09-26T17:20:47",
      },
      {
        fullName: "c/d",
        number: 2,
        title: "Q2",
        answerUrl: "https://example.com/2",
        answeredAt: "2026-09-25T17:20:47",
      },
    ],
    ledgerByYear: {
      2026: {
        "acme.sh": [
          {
            platform: "github",
            kind: "pull_request",
            state: "merged",
            fullName: "acmesh-official/acme.sh",
            number: 7237,
            createdAt: "2026-09-06T17:45:57.000Z",
            hoursToMerge: 90.1,
            comments: 0,
            title: "Poll the order",
            redacted: false,
          },
          {
            platform: "github",
            kind: "pull_request",
            state: "open",
            fullName: "acmesh-official/acme.sh",
            number: 7300,
            createdAt: "2026-09-20T17:45:57.000Z",
            hoursToMerge: null,
            comments: 1,
            title: "Another fix",
            redacted: false,
          },
        ],
      },
    },
    issuesByProject: { Kong: { open: 1, closed: 0 } },
    listingsByOwnProject: {
      phonometry: {
        "conda-forge": {
          fullName: "conda-forge/staged-recipes",
          merged: 0,
          open: 1,
        },
      },
    },
    achievements: [
      {
        platform: "github",
        achievement: "pair-extraordinaire",
        name: "Pair Extraordinaire",
        tierNumber: 3,
        tierName: "silver",
        count: 33,
        nextThreshold: 48,
        percent: 68.8,
        agrees: true,
      },
      {
        platform: "github",
        achievement: "galaxy-brain",
        name: "Galaxy Brain",
        tierNumber: 2,
        tierName: "bronze",
        count: 11,
        nextThreshold: 16,
        percent: 68.8,
        agrees: true,
      },
    ],
    communityContributors: { issues: [], prs: [] },
    upstreamLandedCommits: [],
    dependabot: { perRepo: [], total: 96, medianDays: 4.5, within7Days: 70 },
    maintenance: [
      {
        repo: "gitlab-mcp-server",
        activeDays12m: 94,
        ciPassRate90d: { ok: 533, ko: 17, pct: 96.9 },
      },
    ],
    cardFacts: {
      ghchronicle: { stars: 0, stars30d: 0, releaseTag: "v2.5.1" },
      "portainer-mcp": { stars: 3, stars30d: 1, releaseTag: null },
    },
    gitlab: { fetchedAt: "2026-09-26T20:35:39.324Z", items: [] },
  };
}

/**
 * Hash of a dataset after applying `mutate` to a fresh copy.
 *
 * @param {(dataset: any) => void} mutate - Mutation.
 * @returns {string} Projection hash.
 */
function hashAfter(mutate) {
  const dataset = makeDataset();
  mutate(dataset);
  return hashProjection(dataset).projectionHash;
}

const BASE = hashProjection(makeDataset()).projectionHash;

test("compactStars matches formatCompactStars' rounding", () => {
  assert.equal(compactStars(708), "708");
  assert.equal(compactStars(38_012), "38k");
  assert.equal(compactStars(38_044), "38k");
  assert.equal(compactStars(38_050), "38.1k");
  assert.equal(compactStars(5249), "5.2k");
  assert.equal(compactStars(null), null);
});

test("stableStringify ignores key order", () => {
  assert.equal(
    stableStringify({ b: 1, a: { d: [2, 1], c: null } }),
    stableStringify({ a: { c: null, d: [2, 1] }, b: 1 }),
  );
});

test("volatile fields do not change the hash", () => {
  const volatile = [
    (d) => (d.generatedAt = "2026-09-27T04:30:00.000Z"),
    (d) => (d.asOf = "2026-09-27T04:00:00"),
    (d) => (d.ledgerByYear[2026]["acme.sh"][0].comments = 12),
    (d) => (d.ledgerByYear[2026]["acme.sh"][0].hoursToMerge = 1),
    (d) => (d.summary.codeVsListingSplit.codeOrDocs.medianHoursToMerge = 10),
    (d) => (d.summary.discussionTotals.comments = 150),
    (d) => (d.maintenance[0].activeDays12m = 95),
    (d) => (d.maintenance[0].ciPassRate90d.pct = 97.1),
    (d) => {
      d.communityContributors.issues.push({ repo: "x", people: 1 });
    },
    (d) => {
      d.upstreamLandedCommits.push({ fullName: "a/b", commits: 1 });
    },
    (d) => (d.dependabot.total = 97),
    (d) => (d.gitlab.fetchedAt = "2026-09-27T00:00:00Z"),
    // The twin prints the live tokens; only whether a row shows is built in.
    (d) => (d.cardFacts["portainer-mcp"].stars = 4),
    (d) => (d.cardFacts["portainer-mcp"].stars30d = 2),
    (d) => (d.cardFacts.ghchronicle.releaseTag = "v2.6.0"),
    (d) => (d.acceptedAnswers[0].title = "Edited question"),
    (d) => (d.contributedTo[0].stars = 38_044),
    (d) => (d.contributedTo[0].merged = 2),
    // Galaxy Brain prints the accepted-answers count, not its own count.
    (d) => (d.achievements[1].count = 12),
    (d) => (d.achievements[0].percent = 70),
    // Ledger order as returned by the query is not displayed order.
    (d) => {
      d.ledgerByYear[2026]["acme.sh"] =
        d.ledgerByYear[2026]["acme.sh"].toReversed();
    },
  ];
  for (const mutate of volatile) {
    assert.equal(hashAfter(mutate), BASE, mutate.toString());
  }
});

test("displayed changes do change the hash", () => {
  const displayed = [
    (d) => {
      d.ledgerByYear[2026]["acme.sh"].push({
        platform: "github",
        kind: "pull_request",
        state: "open",
        fullName: "acmesh-official/acme.sh",
        number: 7400,
        createdAt: "2026-09-26T00:00:00.000Z",
        title: "New PR",
        redacted: false,
      });
    },
    (d) => (d.ledgerByYear[2026]["acme.sh"][1].state = "merged"),
    (d) => (d.ledgerByYear[2026]["acme.sh"][1].title = "Renamed"),
    (d) => {
      d.acceptedAnswers.push({
        fullName: "e/f",
        number: 3,
        title: "Q3",
        answerUrl: "https://example.com/3",
        answeredAt: "2026-09-27T00:00:00",
      });
    },
    (d) => (d.achievements[0].tierName = "gold"),
    (d) => (d.achievements[0].tierNumber = 4),
    (d) => (d.achievements[0].count = 34),
    (d) => (d.contributedTo[0].stars = 38_050),
    (d) => (d.contributedTo[1].stars = 709),
    (d) => {
      d.contributedTo = d.contributedTo.toReversed();
    },
    (d) => (d.contributedTo[0].lastMergedAt = "2026-10-01T00:00:00"),
    (d) => (d.issuesByProject.Kong.closed = 1),
    (d) => (d.listingsByOwnProject.phonometry["conda-forge"].merged = 1),
    (d) => (d.summary.contributionTotals.prMerged = 60),
    (d) => (d.summary.answersCount = 3),
    (d) => (d.highlights[0].why.en = "New reason"),
    // A card row appearing or disappearing in the markdown twin (N7).
    (d) => (d.cardFacts.ghchronicle.stars = 1),
    (d) => (d.cardFacts["portainer-mcp"].stars30d = 0),
    (d) => (d.cardFacts["portainer-mcp"].releaseTag = "v0.1.0"),
  ];
  for (const mutate of displayed) {
    assert.notEqual(hashAfter(mutate), BASE, mutate.toString());
  }
});

test("section hashes name the part that changed", () => {
  const before = hashProjection(makeDataset());
  const dataset = makeDataset();
  dataset.ledgerByYear[2026]["acme.sh"][1].state = "merged";
  const decision = decideRebuild({
    state: { ...before, builtAt: new Date().toISOString() },
    current: hashProjection(dataset),
  });
  assert.equal(decision.reason, "changed");
  assert.deepEqual(decision.changedSections, ["ledger"]);
});

test("decideRebuild: equal and fresh means no rebuild", () => {
  const current = hashProjection(makeDataset());
  const now = new Date("2026-09-27T04:30:00Z");
  const decision = decideRebuild({
    state: { ...current, builtAt: "2026-09-25T04:30:00Z" },
    current,
    now,
  });
  assert.equal(decision.rebuild, false);
  assert.equal(decision.reason, "unchanged");
  assert.equal(decision.ageDays, 2);
});

test("decideRebuild: different hash rebuilds", () => {
  const current = hashProjection(makeDataset());
  const decision = decideRebuild({
    state: {
      projectionHash: "0".repeat(64),
      builtAt: "2026-09-26T00:00:00Z",
    },
    current,
    now: new Date("2026-09-27T00:00:00Z"),
  });
  assert.equal(decision.rebuild, true);
  assert.equal(decision.reason, "changed");
});

test("decideRebuild: older than the max age rebuilds", () => {
  const current = hashProjection(makeDataset());
  const state = { ...current, builtAt: "2026-09-19T00:00:00Z" };
  const now = new Date("2026-09-27T00:00:00Z");
  assert.equal(decideRebuild({ state, current, now }).reason, "stale");
  assert.equal(
    decideRebuild({ state, current, now, maxAgeDays: 10 }).reason,
    "unchanged",
  );
  assert.equal(
    decideRebuild({ state: { ...state, builtAt: "garbage" }, current, now })
      .reason,
    "stale",
  );
});

test("decideRebuild: missing state rebuilds", () => {
  const current = hashProjection(makeDataset());
  assert.equal(decideRebuild({ state: null, current }).reason, "no-state");
  assert.equal(decideRebuild({ state: {}, current }).reason, "no-state");
});

test("env overrides for state path and max age", () => {
  assert.equal(
    resolveStatePath({ GHC_REBUILD_STATE: "/srv/state/x.json" }),
    "/srv/state/x.json",
  );
  assert.equal(resolveStatePath({}), "/var/lib/jmrp.io/ghc/rebuild-state.json");
  assert.equal(resolveMaxAgeDays({ GHC_REBUILD_MAX_AGE_DAYS: "3" }), 3);
  assert.equal(resolveMaxAgeDays({ GHC_REBUILD_MAX_AGE_DAYS: "nope" }), 7);
  assert.equal(resolveMaxAgeDays({}), 7);
});

test("recordBuiltDataset writes a state readState accepts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rebuild-state-"));
  try {
    const datasetPath = path.join(dir, "dataset.json");
    fs.writeFileSync(datasetPath, JSON.stringify(makeDataset()));
    const statePath = path.join(dir, "nested", "state.json");
    const now = new Date("2026-09-27T04:30:00Z");
    recordBuiltDataset({ datasetPath, statePath, now });
    const state = readState(statePath);
    assert.equal(state?.projectionHash, BASE);
    assert.equal(state?.builtAt, now.toISOString());
    assert.equal(readState(path.join(dir, "missing.json")), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
