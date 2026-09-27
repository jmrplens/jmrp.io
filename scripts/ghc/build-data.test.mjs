/**
 * Guards the build-time dataset's privacy filtering (`isRedacted`,
 * `shapeAchievements`) and the fixture-fallback behavior of `buildDataset`
 * / `ensureDataset` — the parts that must degrade to the committed snapshot
 * instead of failing the build when InfluxDB is unreachable (every CI
 * runner and most worktrees).
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildDataset,
  DATA_PATH,
  ensureDataset,
  FIXTURE_PATH,
  isRedacted,
  mergeContributedTo,
  shapeAchievements,
} from "./build-data.mjs";

const CONTRIBUTIONS = {
  listingRepos: [],
  exclude: ["ARM-software/MDK-Middleware#131", "openobserve/openobserve#14252"],
  displayName: {},
  featured: [],
  securityTitleAllow: [],
};

test("isRedacted hides an item on the explicit exclude list", () => {
  const item = {
    fullName: "ARM-software/MDK-Middleware",
    number: 131,
    title: "Security: Fix CVE-1999-0017 FTP bounce attack in net_ftp_server",
  };
  assert.equal(isRedacted(item, CONTRIBUTIONS), true);
});

test("isRedacted hides a security-flavoured title by default, even when not on the exclude list", () => {
  const item = {
    fullName: "someone/else",
    number: 99,
    title: "fix: CVE-2026-1234 in parser",
  };
  assert.equal(isRedacted(item, CONTRIBUTIONS), true);
});

test("isRedacted shows a security-flavoured title cleared by securityTitleAllow", () => {
  const item = {
    fullName: "creativeprojects/go-selfupdate",
    number: 58,
    title:
      "fix: replace unmaintained crypto with a supply-chain fix (GO-2026-5932)",
  };
  const config = { ...CONTRIBUTIONS, securityTitleAllow: ["supply-chain"] };
  assert.equal(isRedacted(item, config), false);
});

test("isRedacted shows an ordinary title untouched", () => {
  const item = {
    fullName: "TriliumNext/Trilium",
    number: 11_448,
    title: "TOTP: accept each code only once",
  };
  assert.equal(isRedacted(item, CONTRIBUTIONS), false);
});

test("shapeAchievements never carries GitHub's badge image URL", () => {
  const [row] = shapeAchievements([
    {
      achievement: "starstruck",
      name: "Starstruck",
      tierNumber: 1,
      tierName: "default",
      count: 118,
      nextThreshold: 128,
      percent: 92.2,
      agrees: true,
      image:
        "https://github.githubassets.com/assets/starstruck-default-b6610abad518.png",
    },
  ]);
  assert.equal("image" in row, false);
  assert.equal(row.count, 118);
});

test("shapeAchievements keeps only the 4 shown badges", () => {
  const rows = [
    {
      achievement: "pull-shark",
      name: "Pull Shark",
      tierNumber: 4,
      tierName: "gold",
      count: 2382,
      nextThreshold: 0,
      percent: 100,
      agrees: true,
    },
    {
      achievement: "yolo",
      name: "YOLO",
      tierNumber: 1,
      tierName: "default",
      count: null,
      nextThreshold: null,
      percent: null,
      agrees: false,
    },
    {
      achievement: "arctic-code-vault-contributor",
      name: "Arctic Code Vault Contributor",
      tierNumber: 1,
      tierName: "default",
      count: null,
      nextThreshold: null,
      percent: null,
      agrees: false,
    },
    {
      achievement: "public-sponsor",
      name: "Public Sponsor",
      tierNumber: 1,
      tierName: "default",
      count: null,
      nextThreshold: null,
      percent: null,
      agrees: false,
    },
    {
      achievement: "quickdraw",
      name: "Quickdraw",
      tierNumber: 1,
      tierName: "default",
      count: null,
      nextThreshold: null,
      percent: null,
      agrees: false,
    },
    {
      achievement: "galaxy-brain",
      name: "Galaxy Brain",
      tierNumber: 2,
      tierName: "bronze",
      count: 11,
      nextThreshold: 16,
      percent: 68.8,
      agrees: true,
    },
    {
      achievement: "starstruck",
      name: "Starstruck",
      tierNumber: 1,
      tierName: "default",
      count: 118,
      nextThreshold: 128,
      percent: 92.2,
      agrees: true,
    },
    {
      achievement: "pair-extraordinaire",
      name: "Pair Extraordinaire",
      tierNumber: 3,
      tierName: "silver",
      count: 33,
      nextThreshold: 48,
      percent: 68.8,
      agrees: true,
    },
  ];
  const shown = shapeAchievements(rows);
  assert.deepEqual(
    new Set(shown.map((r) => r.achievement)),
    new Set([
      "galaxy-brain",
      "pair-extraordinaire",
      "pull-shark",
      "starstruck",
    ]),
  );
});

test("shapeAchievements redacts Pull Shark's raw count but keeps its tier", () => {
  const rows = [
    {
      achievement: "pull-shark",
      name: "Pull Shark",
      tierNumber: 4,
      tierName: "gold",
      count: 2382,
      nextThreshold: 0,
      percent: 100,
      agrees: true,
    },
  ];
  const [pullShark] = shapeAchievements(rows);
  assert.equal(pullShark.count, null);
  assert.equal(pullShark.tierName, "gold");
  assert.equal(pullShark.percent, 100);
});

// ── buildDataset / ensureDataset: fixture fallback ─────────────────────────

/**
 * A temp repo root with a real fixture copied in (from this checkout's
 * `src/data/ghc/fixture.json`) so the fallback path has something real to
 * fall back to.
 *
 * @returns {string} The temp root.
 */
function tempRootWithFixture() {
  const repoRoot = path.resolve(import.meta.dirname, "../..");
  const fixtureSource = path.join(repoRoot, FIXTURE_PATH);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ghc-build-data-"));
  const fixtureDest = path.join(root, FIXTURE_PATH);
  fs.mkdirSync(path.dirname(fixtureDest), { recursive: true });
  fs.copyFileSync(fixtureSource, fixtureDest);
  return root;
}

test("buildDataset writes the collected dataset atomically on success", async () => {
  const root = tempRootWithFixture();
  const dataset = { schemaVersion: 1, highlights: [], contributedTo: [] };
  const result = await buildDataset({
    root,
    config: { url: "unused", token: "unused" },
    collect: async () => dataset,
    warn: () => {},
  });
  assert.equal(result.wrote, true);
  assert.equal(result.fromFixture, false);
  const onDisk = JSON.parse(
    fs.readFileSync(path.join(root, DATA_PATH), "utf8"),
  );
  assert.deepEqual(onDisk, dataset);
});

test("buildDataset falls back to the committed fixture when the collect step fails", async () => {
  const root = tempRootWithFixture();
  const warnings = [];
  const result = await buildDataset({
    root,
    config: { url: "unused", token: "unused" },
    collect: async () => {
      throw new Error("InfluxDB unreachable");
    },
    warn: (line) => {
      warnings.push(line);
    },
  });
  assert.equal(result.wrote, true);
  assert.equal(result.fromFixture, true);
  const onDisk = fs.readFileSync(path.join(root, DATA_PATH), "utf8");
  const fixture = fs.readFileSync(path.join(root, FIXTURE_PATH), "utf8");
  assert.equal(onDisk, fixture);
  assert.ok(warnings.some((line) => line.includes("InfluxDB unreachable")));
});

test("buildDataset leaves DATA_PATH untouched when it fails AND there is no fixture", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "ghc-build-data-nofixture-"),
  );
  const result = await buildDataset({
    root,
    config: { url: "unused", token: "unused" },
    collect: async () => {
      throw new Error("InfluxDB unreachable");
    },
    warn: () => {},
  });
  assert.equal(result.wrote, false);
  assert.equal(fs.existsSync(path.join(root, DATA_PATH)), false);
});

test("ensureDataset copies the fixture only when DATA_PATH is missing", () => {
  const root = tempRootWithFixture();
  const outPath = path.join(root, DATA_PATH);

  assert.equal(fs.existsSync(outPath), false);
  assert.equal(ensureDataset(root), true);
  assert.equal(fs.existsSync(outPath), true);

  fs.writeFileSync(outPath, '{"already":"here"}');
  assert.equal(ensureDataset(root), false);
  assert.equal(fs.readFileSync(outPath, "utf8"), '{"already":"here"}');
});

test("mergeContributedTo folds rows that share a display name across platforms", () => {
  const merged = mergeContributedTo([
    {
      project: "Example Project",
      repo: "example-org/example-project",
      platform: "github",
      merged: 2,
      lastMergedAt: "2026-01-10T00:00:00.000Z",
      stars: 50,
    },
    {
      project: "Other Project",
      repo: "example-org/other-project",
      platform: "github",
      merged: 1,
      lastMergedAt: "2026-02-01T00:00:00.000Z",
      stars: 10,
    },
    {
      project: "Example Project",
      repo: "example-group/example-project",
      platform: "gitlab",
      merged: 3,
      lastMergedAt: "2026-03-05T00:00:00.000Z",
      stars: 200,
    },
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], {
    project: "Example Project",
    repo: "example-group/example-project",
    platform: "gitlab",
    stars: 200,
    merged: 5,
    lastMergedAt: "2026-03-05T00:00:00.000Z",
  });
  assert.equal(merged[1].project, "Other Project");
});

test("mergeContributedTo keeps the starred row over an unknown star count and sorts unknowns last", () => {
  const merged = mergeContributedTo([
    {
      project: "Unknown Stars",
      repo: "example-org/unknown",
      platform: "github",
      merged: 1,
      lastMergedAt: null,
      stars: null,
    },
    {
      project: "Example Project",
      repo: "example-group/example-project",
      platform: "gitlab",
      merged: 1,
      lastMergedAt: "2026-04-01T00:00:00.000Z",
      stars: null,
    },
    {
      project: "Example Project",
      repo: "example-org/example-project",
      platform: "github",
      merged: 1,
      lastMergedAt: "2026-01-01T00:00:00.000Z",
      stars: 3,
    },
  ]);
  assert.deepEqual(
    merged.map((row) => [row.project, row.repo, row.merged, row.lastMergedAt]),
    [
      [
        "Example Project",
        "example-org/example-project",
        2,
        "2026-04-01T00:00:00.000Z",
      ],
      ["Unknown Stars", "example-org/unknown", 1, null],
    ],
  );
});

test("mergeContributedTo lets the canonical repo lead over merges and stars", () => {
  const rows = [
    {
      project: "Example Project",
      repo: "example-group/example-project",
      platform: "gitlab",
      merged: 3,
      lastMergedAt: "2026-03-05T00:00:00.000Z",
      stars: 200,
    },
    {
      project: "Example Project",
      repo: "example-org/example-project",
      platform: "github",
      merged: 1,
      lastMergedAt: "2026-01-01T00:00:00.000Z",
      stars: 3,
    },
  ];
  const [merged] = mergeContributedTo(rows, {
    "Example Project": "example-org/example-project",
  });
  assert.equal(merged.repo, "example-org/example-project");
  assert.equal(merged.platform, "github");
  assert.equal(merged.stars, 3);
  assert.equal(merged.merged, 4);
  assert.equal(
    mergeContributedTo(rows)[0].repo,
    "example-group/example-project",
  );
});
