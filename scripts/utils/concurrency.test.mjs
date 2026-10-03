/**
 * Guards `runWithConcurrency`'s ordering, concurrency cap and error
 * propagation — the pooling `build-data.mjs` and `write-summary.mjs` rely on
 * to stop firing every InfluxDB query at once.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { runWithConcurrency } from "./concurrency.mjs";

test("runWithConcurrency preserves task order regardless of completion order", async () => {
  const tasks = [10, 5, 20, 1, 15].map(
    (delay, index) => () =>
      new Promise((resolve) => setTimeout(() => resolve(index), delay)),
  );
  const results = await runWithConcurrency(tasks, 3);
  assert.deepEqual(results, [0, 1, 2, 3, 4]);
});

test("runWithConcurrency never runs more than `limit` tasks at once", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const tasks = Array.from({ length: 9 }, () => async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return true;
  });
  await runWithConcurrency(tasks, 3);
  assert.equal(maxInFlight <= 3, true);
});

test("runWithConcurrency runs every task even with a limit larger than the list", async () => {
  const seen = [];
  const tasks = [0, 1, 2].map((n) => async () => {
    seen.push(n);
    return n;
  });
  const results = await runWithConcurrency(tasks, 10);
  assert.deepEqual(results, [0, 1, 2]);
  assert.deepEqual(
    [...seen].sort((a, b) => a - b),
    [0, 1, 2],
  );
});

test("runWithConcurrency treats a limit below 1 as 1 (fully serial)", async () => {
  const order = [];
  const tasks = [0, 1, 2].map((n) => async () => {
    order.push(`start-${n}`);
    await new Promise((resolve) => setTimeout(resolve, 1));
    order.push(`end-${n}`);
    return n;
  });
  await runWithConcurrency(tasks, 0);
  assert.deepEqual(order, [
    "start-0",
    "end-0",
    "start-1",
    "end-1",
    "start-2",
    "end-2",
  ]);
});

test("runWithConcurrency rejects when a task throws", async () => {
  const tasks = [
    async () => 1,
    async () => {
      throw new Error("boom");
    },
    async () => 3,
  ];
  await assert.rejects(runWithConcurrency(tasks, 2), /boom/);
});

test("runWithConcurrency resolves to an empty array for an empty task list", async () => {
  assert.deepEqual(await runWithConcurrency([], 3), []);
});
