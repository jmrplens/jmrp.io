/**
 * Guards the scheduled rebuild's safety checks: detecting a running Astro
 * build, the PID lock with stale detection, and the alarm for a fixture
 * build left served by a collector that stays broken.
 *
 * @module
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  acquireLock,
  describeDecision,
  findRunningAstroBuilds,
  isAstroBuildCmdline,
  releaseLock,
  servedFixtureAlarm,
} from "./rebuild-if-changed.mjs";

test("isAstroBuildCmdline recognizes every way a build is started", () => {
  assert.equal(
    isAstroBuildCmdline(
      "sh\0-c\0pnpm run build:cv && astro build --outDir builds/blue\0",
    ),
    true,
  );
  assert.equal(
    isAstroBuildCmdline(
      "node\0/repo/node_modules/astro/astro.js\0build\0--outDir\0x\0",
    ),
    true,
  );
  assert.equal(isAstroBuildCmdline("node\0astro.mjs\0build\0"), true);
  assert.equal(isAstroBuildCmdline("node\0astro.js\0preview\0"), false);
  assert.equal(
    isAstroBuildCmdline("node\0scripts/ghc/rebuild-if-changed.mjs\0"),
    false,
  );
});

test("findRunningAstroBuilds scans a proc-like directory", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proc-"));
  try {
    const add = (pid, cmdline) => {
      fs.mkdirSync(path.join(dir, String(pid)));
      fs.writeFileSync(path.join(dir, String(pid), "cmdline"), cmdline);
    };
    add(10, "node\0astro.js\0build\0");
    add(11, "node\0astro.js\0dev\0");
    add(12, "sh\0-c\0astro build\0");
    fs.mkdirSync(path.join(dir, "self"));
    fs.mkdirSync(path.join(dir, "13"));
    assert.deepEqual(
      findRunningAstroBuilds({ procDir: dir, selfPid: 12 }),
      [10],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("acquireLock is exclusive and replaces a stale lock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lock-"));
  const lockPath = path.join(dir, "build.lock");
  try {
    assert.equal(
      acquireLock(lockPath, { pid: 100, isAlive: () => true }),
      true,
    );
    // Held by a live process: refused.
    assert.equal(
      acquireLock(lockPath, { pid: 200, isAlive: () => true }),
      false,
    );
    // Holder died: stale, taken over.
    assert.equal(
      acquireLock(lockPath, { pid: 200, isAlive: (pid) => pid !== 100 }),
      true,
    );
    assert.equal(fs.readFileSync(lockPath, "utf8").trim(), "200");
    // Only the owner releases.
    releaseLock(lockPath, 100);
    assert.equal(fs.existsSync(lockPath), true);
    releaseLock(lockPath, 200);
    assert.equal(fs.existsSync(lockPath), false);
    // A garbage lock file is stale too.
    fs.writeFileSync(lockPath, "not a pid");
    assert.equal(
      acquireLock(lockPath, { pid: 300, isAlive: () => true }),
      true,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("describeDecision names the reason", () => {
  assert.match(
    describeDecision(
      {
        rebuild: true,
        reason: "changed",
        changedSections: ["achievements", "ledger"],
        ageDays: 1.25,
      },
      7,
    ),
    /achievements, ledger; last build 1\.3 day/,
  );
  assert.match(
    describeDecision(
      { rebuild: false, reason: "unchanged", changedSections: [], ageDays: 2 },
      7,
    ),
    /^unchanged/,
  );
  assert.match(
    describeDecision(
      { rebuild: true, reason: "no-state", changedSections: [], ageDays: null },
      7,
    ),
    /no rebuild state/,
  );
  assert.match(
    describeDecision(
      {
        rebuild: true,
        reason: "not-live",
        changedSections: [],
        ageDays: 0.5,
        source: "fixture",
      },
      7,
    ),
    /rendered fixture data, not a collection \(last build 0\.5 day\(s\) ago\): rebuild\./,
  );
});

test("servedFixtureAlarm fires only while the live build is not live data", () => {
  // A live (or legacy) state: a failed collection stays a quiet exit 0.
  assert.equal(servedFixtureAlarm(null), null);
  assert.equal(
    servedFixtureAlarm({ projectionHash: "x", builtAt: "2026-09-30T00:00Z" }),
    null,
  );
  assert.equal(
    servedFixtureAlarm({
      projectionHash: "x",
      builtAt: "2026-09-30T00:00Z",
      source: "live",
    }),
    null,
  );
  // A fixture build: the run must fail so the unit shows it.
  const alarm = servedFixtureAlarm({
    source: "fixture",
    builtAt: "2026-09-30T17:20:00.000Z",
    asOf: "2026-09-27T13:58:22",
  });
  assert.match(
    alarm ?? "",
    /served fixture data \(as of 2026-09-27T13:58:22\) since 2026-09-30T17:20:00\.000Z/,
  );
  assert.match(
    servedFixtureAlarm({ source: "gitlab-fixture", builtAt: "t" }) ?? "",
    /gitlab-fixture data \(as of an unknown date\)/,
  );
});

test("resolvePnpm: absolute, next to node unless PNPM_BIN is absolute", async () => {
  const { resolvePnpm } = await import("./rebuild-if-changed.mjs");
  const saved = process.env.PNPM_BIN;
  try {
    delete process.env.PNPM_BIN;
    assert.equal(
      resolvePnpm(),
      path.join(path.dirname(process.execPath), "pnpm"),
    );
    process.env.PNPM_BIN = "relative/pnpm";
    assert.ok(path.isAbsolute(resolvePnpm()));
    process.env.PNPM_BIN = "/opt/pnpm/bin/pnpm";
    assert.equal(resolvePnpm(), "/opt/pnpm/bin/pnpm");
  } finally {
    if (saved === undefined) delete process.env.PNPM_BIN;
    else process.env.PNPM_BIN = saved;
  }
});
