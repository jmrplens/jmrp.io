/**
 * Guards the LIVE summary's shaping (`buildSummaryTokens`), its degraded
 * "no data anywhere" shape (`buildNullSummary`) and the atomic-write /
 * keep-last-good-on-failure behavior of `writeProjectsSummary` — the parts
 * of the pipeline a systemd timer runs unattended every 10 minutes, so a
 * silent regression here would ship stale or wrong numbers to nginx for a
 * long time before anyone noticed.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ACTIVE_REPOS } from "./roster.mjs";
import {
  buildNullSummary,
  buildSummaryTokens,
  writeProjectsSummary,
} from "./write-summary.mjs";

/** A complete, canned {@link import('./write-summary.mjs').RawSummaryData}. */
function fixtureRaw() {
  return {
    contributionTotals: {
      prMerged: 33,
      prOpen: 15,
      prClosed: 11,
      issuesOpen: 24,
      issuesClosed: 19,
      repos: 51,
      owners: 47,
      reposWithMerge: 18,
      lastPrDate: "2026-09-26T00:00:00",
    },
    codeVsListingSplit: {
      codeOrDocs: {
        merged: 19,
        open: 10,
        closed: 8,
        reposMerged: 12,
        medianHoursToMerge: 48.06,
      },
      listing: {
        merged: 14,
        open: 5,
        closed: 3,
        reposMerged: 6,
        medianHoursToMerge: 8.85,
      },
    },
    codeUpstreamsCount: 11,
    answersCount: 13,
    headerBand: {
      stars: 382,
      forks: 102,
      repos: 20,
      stars30d: 35,
      releases90d: 81,
      releases30d: 34,
    },
    activityBand: {
      activeDays: 230,
      totalContributions: 9486,
      streakDays: 91,
      streakStart: "2026-06-28T00:00:00",
      streakEnd: "2026-09-26T00:00:00",
    },
    freshness: { asOf: "2026-09-26T12:33:19.304679889", perFamily: [] },
    // Only 8 of the 9 active repos have a star row: one repo (portainer-mcp)
    // is deliberately absent to exercise the "missing" branch.
    stars: ACTIVE_REPOS.filter((repo) => repo !== "portainer-mcp").map(
      (repo, i) => ({
        repo,
        stars: 10 + i,
        stars30d: repo === "Cloudflare-DNS-Updater" ? 0 : i + 1,
      }),
    ),
    releases: ACTIVE_REPOS.filter((repo) => repo !== "portainer-mcp").map(
      (repo) => ({
        repo,
        tag: "v1.0.0",
        ageDays: 5,
      }),
    ),
  };
}

test("buildSummaryTokens emits every global token", () => {
  const tokens = buildSummaryTokens(fixtureRaw());
  assert.equal(tokens.PRJ_CODE_MERGED, 19);
  assert.equal(tokens.PRJ_CODE_UPSTREAMS, 11);
  assert.equal(tokens.PRJ_LISTING_MERGED, 14);
  // Code-only (codeVsListingSplit.codeOrDocs.open), not the raw 15 that
  // includes listingRepos PRs — see write-summary.mjs's PRJ_PR_OPEN comment.
  assert.equal(tokens.PRJ_PR_OPEN, 10);
  assert.equal(tokens.PRJ_ANSWERS, 13);
  assert.equal(tokens.PRJ_RELEASES_90D, 81);
  assert.equal(tokens.PRJ_STARS_30D, 35);
  assert.equal(tokens.PRJ_ACTIVE_DAYS, 230);
  assert.equal(tokens.PRJ_STREAK, 91);
  assert.equal(tokens.PRJ_AS_OF, "2026-09-26T12:33:19.304679889");
});

test("buildSummaryTokens emits 6 keys per active repo, none undefined", () => {
  const tokens = buildSummaryTokens(fixtureRaw());
  for (const repo of ACTIVE_REPOS) {
    const id = repo.toUpperCase().replaceAll(/[^A-Z0-9]+/g, "_");
    for (const suffix of [
      "STARS",
      "STARS_30D",
      "STARS_CLASS",
      "STARS_30D_CLASS",
      "REL_TAG",
      "REL_AGE",
      "REL_CLASS",
    ]) {
      assert.notEqual(
        tokens[`PRJ_${id}_${suffix}`],
        undefined,
        `PRJ_${id}_${suffix}`,
      );
    }
  }
});

test("buildSummaryTokens: a repo with no star row gets null values and a hide class", () => {
  const tokens = buildSummaryTokens(fixtureRaw());
  assert.equal(tokens.PRJ_PORTAINER_MCP_STARS, null);
  assert.equal(tokens.PRJ_PORTAINER_MCP_STARS_30D, null);
  assert.equal(tokens.PRJ_PORTAINER_MCP_STARS_30D_CLASS, "prj-hide");
  assert.equal(tokens.PRJ_PORTAINER_MCP_REL_TAG, null);
  assert.equal(tokens.PRJ_PORTAINER_MCP_REL_CLASS, "prj-hide");
});

test("buildSummaryTokens: a zero 30-day star delta is hidden, not shown as +0", () => {
  const tokens = buildSummaryTokens(fixtureRaw());
  assert.equal(tokens.PRJ_CLOUDFLARE_DNS_UPDATER_STARS_30D_CLASS, "prj-hide");
});

test("buildSummaryTokens: a repo with a release row is shown", () => {
  const tokens = buildSummaryTokens(fixtureRaw());
  assert.equal(tokens.PRJ_GITLAB_MCP_SERVER_REL_TAG, "v1.0.0");
  assert.equal(tokens.PRJ_GITLAB_MCP_SERVER_REL_CLASS, "");
});

test("buildNullSummary declares the same key set as buildSummaryTokens, all null/hidden", () => {
  const real = buildSummaryTokens(fixtureRaw());
  const nullSummary = buildNullSummary();
  assert.deepEqual(
    new Set(Object.keys(nullSummary)),
    new Set(Object.keys(real)),
  );
  for (const [key, value] of Object.entries(nullSummary)) {
    if (key.endsWith("_CLASS")) assert.equal(value, "prj-hide", key);
    else assert.equal(value, null, key);
  }
});

// ── writeProjectsSummary: atomic write + last-good-on-failure ─────────────

function tempOutPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ghc-summary-"));
  return path.join(dir, "nested", "projects-summary.json");
}

test("writeProjectsSummary writes tokens and a generatedAt stamp on success", async () => {
  const outPath = tempOutPath();
  const result = await writeProjectsSummary({
    outPath,
    config: { url: "unused", token: "unused" },
    collect: async () => fixtureRaw(),
    warn: () => {},
  });
  assert.equal(result.refreshed, true);
  assert.equal(result.wrote, true);
  const onDisk = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(onDisk.schemaVersion, 1);
  assert.equal(typeof onDisk.generatedAt, "string");
  assert.equal(onDisk.tokens.PRJ_CODE_MERGED, 19);
});

test("writeProjectsSummary keeps the previous file when the refresh fails and one exists", async () => {
  const outPath = tempOutPath();
  await writeProjectsSummary({
    outPath,
    config: { url: "unused", token: "unused" },
    collect: async () => fixtureRaw(),
    warn: () => {},
  });
  const before = fs.readFileSync(outPath, "utf8");

  const warnings = [];
  const result = await writeProjectsSummary({
    outPath,
    config: { url: "unused", token: "unused" },
    collect: async () => {
      throw new Error("InfluxDB unreachable");
    },
    warn: (line) => {
      warnings.push(line);
    },
  });

  assert.equal(result.wrote, false);
  assert.equal(result.refreshed, false);
  assert.equal(
    fs.readFileSync(outPath, "utf8"),
    before,
    "file must be byte-identical",
  );
  assert.ok(warnings.some((line) => line.includes("InfluxDB unreachable")));
});

test("writeProjectsSummary writes a fully-null summary when there is no previous file and the fetch fails", async () => {
  const outPath = tempOutPath();
  const result = await writeProjectsSummary({
    outPath,
    config: { url: "unused", token: "unused" },
    collect: async () => {
      throw new Error("InfluxDB unreachable");
    },
    warn: () => {},
  });

  assert.equal(result.wrote, true);
  assert.equal(result.refreshed, false);
  const onDisk = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(onDisk.tokens.PRJ_CODE_MERGED, null);
  assert.equal(onDisk.tokens.PRJ_PORTAINER_MCP_STARS_30D_CLASS, "prj-hide");
});

test("writeProjectsSummary never leaves a .tmp file behind on success", async () => {
  const outPath = tempOutPath();
  await writeProjectsSummary({
    outPath,
    config: { url: "unused", token: "unused" },
    collect: async () => fixtureRaw(),
    warn: () => {},
  });
  const siblings = fs.readdirSync(path.dirname(outPath));
  assert.deepEqual(
    siblings.filter((name) => name.includes(".tmp")),
    [],
  );
});
