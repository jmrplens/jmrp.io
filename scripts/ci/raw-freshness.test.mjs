/**
 * Unit tests for the raw.githubusercontent.com cache gate
 * (`scripts/ci/raw-freshness.mjs`).
 *
 * The defect these lock down: identity propagation dispatched the consumer
 * builds right after the merge, and on 2026-11-07 (#653) libgen-mcp rebuilt
 * inside raw's five-minute cache window and published the previous `#person`.
 * The gate must sleep out the cache lifetime counted from the push, then see
 * the current bytes before it lets the dispatch go ahead, and fail rather than
 * dispatch when raw keeps serving the old ones.
 *
 * No network: fetch, the clock and sleep are all fakes.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cacheLifetimeSeconds,
  DEFAULT_MAX_AGE_S,
  MARGIN_S,
  rawUrl,
  waitForRawFreshness,
} from "./raw-freshness.mjs";

const OLD = Buffer.from('{"sameAs":["https://ko-fi.com/jmrplens"]}\n');
const NEW = Buffer.from(
  '{"sameAs":["https://ko-fi.com/jmrplens","https://dev.to/jmrplens"]}\n',
);

/**
 * A fake clock whose sleep advances time instead of waiting.
 *
 * @param {number} start - Initial epoch ms.
 * @returns {{now: () => number, sleep: (ms: number) => Promise<void>,
 *   slept: number[]}} The clock, its sleep, and every delay requested.
 */
function fakeClock(start) {
  let t = start;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
    slept,
  };
}

/**
 * A fake fetch that serves `bodies()` for every URL, with a raw-like header.
 *
 * @param {() => Buffer} bodies - Returns the body to serve on this call.
 * @param {{cacheControl?: string | null, status?: number}} [options] - Header
 *   and status to answer with.
 * @returns {{fetchImpl: typeof fetch, calls: Array<{url: string,
 *   init: RequestInit}>}} The fetch and the requests it received.
 */
function fakeFetch(
  bodies,
  { cacheControl = "max-age=300", status = 200 } = {},
) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const headers = new Headers();
    if (cacheControl !== null) headers.set("cache-control", cacheControl);
    return new Response(bodies(), { status, headers });
  };
  return { fetchImpl, calls };
}

const BASE = {
  owner: "jmrplens",
  repo: "jmrp.io",
  ref: "main",
  paths: ["public/identity/person.jsonld"],
  log: () => {},
};

test("cacheLifetimeSeconds reads s-maxage first, then max-age", () => {
  assert.equal(cacheLifetimeSeconds("max-age=300"), 300);
  assert.equal(cacheLifetimeSeconds("public, max-age=60, s-maxage=600"), 600);
  assert.equal(cacheLifetimeSeconds("Max-Age=120"), 120);
  assert.equal(cacheLifetimeSeconds("max-age=0"), 0);
  assert.equal(cacheLifetimeSeconds("no-cache"), null);
  assert.equal(cacheLifetimeSeconds("max-age=soon"), null);
  assert.equal(cacheLifetimeSeconds(""), null);
  assert.equal(cacheLifetimeSeconds(null), null);
});

test("rawUrl builds the address the consumers fetch", () => {
  assert.equal(
    rawUrl({ ...BASE, path: "public/identity/person.jsonld" }),
    "https://raw.githubusercontent.com/jmrplens/jmrp.io/main/public/identity/person.jsonld",
  );
});

test("sleeps out the cache lifetime counted from the push", async () => {
  const clock = fakeClock(1_000_000);
  const startedAt = clock.now() - 40_000; // the job took 40 s to get here
  const { fetchImpl, calls } = fakeFetch(() => NEW);

  const result = await waitForRawFreshness({
    ...BASE,
    startedAt,
    expectedBytes: async () => NEW,
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
  });

  assert.equal(result.maxAgeSeconds, 300);
  assert.equal(result.waitedMs, (300 + MARGIN_S) * 1000 - 40_000);
  assert.deepEqual(clock.slept, [result.waitedMs]);
  assert.equal(result.polls, 1);
  // Unauthenticated, because raw varies its cache on Authorization.
  for (const { init } of calls) {
    assert.equal(new Headers(init?.headers).has("authorization"), false);
  }
});

test("does not sleep when the cache lifetime has already passed", async () => {
  const clock = fakeClock(10_000_000);
  const { fetchImpl } = fakeFetch(() => NEW);

  const result = await waitForRawFreshness({
    ...BASE,
    startedAt: clock.now() - 3_600_000,
    expectedBytes: async () => NEW,
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
  });

  assert.equal(result.waitedMs, 0);
  assert.deepEqual(clock.slept, []);
});

test("assumes the default lifetime when raw sends no max-age", async () => {
  const clock = fakeClock(1_000_000);
  const { fetchImpl } = fakeFetch(() => NEW, { cacheControl: null });

  const result = await waitForRawFreshness({
    ...BASE,
    startedAt: clock.now(),
    expectedBytes: async () => NEW,
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
  });

  assert.equal(result.maxAgeSeconds, DEFAULT_MAX_AGE_S);
  assert.equal(result.waitedMs, (DEFAULT_MAX_AGE_S + MARGIN_S) * 1000);
});

test("keeps checking until raw serves the current bytes", async () => {
  const clock = fakeClock(1_000_000);
  // Initial lifetime read, then two stale checks, then the new copy.
  const served = [OLD, OLD, OLD, NEW];
  const { fetchImpl } = fakeFetch(() => served.shift() ?? NEW);

  const result = await waitForRawFreshness({
    ...BASE,
    startedAt: clock.now(),
    expectedBytes: async () => NEW,
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
    pollMs: 10_000,
  });

  assert.equal(result.polls, 3);
  assert.deepEqual(clock.slept.slice(1), [10_000, 10_000]);
});

test("follows a newer push during the wait instead of failing", async () => {
  const clock = fakeClock(1_000_000);
  const NEWER = Buffer.from('{"sameAs":[]}\n');
  const { fetchImpl } = fakeFetch(() => NEWER);

  // main moved on: the contents API and raw both have the newer file now.
  const result = await waitForRawFreshness({
    ...BASE,
    startedAt: clock.now(),
    expectedBytes: async () => NEWER,
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
  });

  assert.equal(result.polls, 1);
});

test("fails, naming the file, when raw keeps the old copy", async () => {
  const clock = fakeClock(1_000_000);
  const { fetchImpl } = fakeFetch(() => OLD);

  await assert.rejects(
    waitForRawFreshness({
      ...BASE,
      paths: ["public/identity/person.jsonld", "public/identity/projects.json"],
      startedAt: clock.now(),
      expectedBytes: async () => NEW,
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
      pollMs: 10_000,
      verifyTimeoutMs: 30_000,
    }),
    /outdated public\/identity\/person\.jsonld, public\/identity\/projects\.json/,
  );
});

test("fails on an error status instead of treating it as content", async () => {
  const clock = fakeClock(1_000_000);
  const { fetchImpl } = fakeFetch(() => Buffer.from("404: Not Found"), {
    status: 404,
  });

  await assert.rejects(
    waitForRawFreshness({
      ...BASE,
      startedAt: clock.now(),
      expectedBytes: async () => NEW,
      fetchImpl,
      now: clock.now,
      sleep: clock.sleep,
    }),
    /answered 404/,
  );
});
