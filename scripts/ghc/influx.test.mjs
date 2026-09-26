/**
 * Guards `queryInflux`'s single retry-on-abort — the fix for queries that
 * time out under concurrent load even after `build-data.mjs`/
 * `write-summary.mjs` cap themselves to a handful in flight (see
 * `scripts/ghc/concurrency.mjs`'s doc comment). A non-abort failure (a real
 * HTTP error) must never be retried.
 *
 * @module
 */

import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { InfluxQueryError, queryInflux } from "./influx.mjs";

const CONFIG = { url: "https://influx.invalid", token: "unused-test-token" };

/**
 * Replaces `globalThis.fetch` for the duration of `run` via `node:test`'s
 * own mocking API (rather than a raw property assignment, which both trips
 * `unicorn/no-global-object-property-assignment` and leaves cleanup manual);
 * the mock is always restored, even when `run` throws.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} implementation - Fetch
 *   replacement for this test.
 * @param {() => Promise<void>} run - The test body.
 */
async function withMockFetch(implementation, run) {
  const fetchMock = mock.method(globalThis, "fetch", implementation);
  try {
    await run();
  } finally {
    fetchMock.mock.restore();
  }
}

/**
 * An error shaped like `fetch`'s own abort rejection — `DOMException` is
 * what a real aborted `fetch()` throws (Node/undici), so this needs no
 * post-construction property assignment to fake a `.name`.
 *
 * @returns {DOMException} The abort error.
 */
function abortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

test("queryInflux retries once after an aborted request, then succeeds", async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls === 1) throw abortError();
      return { ok: true, text: async () => '[{"n":1}]' };
    },
    async () => {
      const rows = await queryInflux("select 1", CONFIG);
      assert.deepEqual(rows, [{ n: 1 }]);
      assert.equal(calls, 2, "expected exactly one retry");
    },
  );
});

test("queryInflux gives up after the retry also aborts", async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      throw abortError();
    },
    async () => {
      await assert.rejects(queryInflux("select 1", CONFIG), InfluxQueryError);
      assert.equal(calls, 2, "expected exactly one retry, then give up");
    },
  );
});

test("queryInflux does not retry a real (non-abort) HTTP failure", async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: false, status: 500, text: async () => "server error" };
    },
    async () => {
      await assert.rejects(queryInflux("select 1", CONFIG), InfluxQueryError);
      assert.equal(calls, 1, "a non-abort failure must not be retried");
    },
  );
});

test("queryInflux does not retry an unparsable response body", async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      return { ok: true, text: async () => "not json" };
    },
    async () => {
      await assert.rejects(queryInflux("select 1", CONFIG), InfluxQueryError);
      assert.equal(calls, 1);
    },
  );
});

test("queryInflux retries once when the body read times out (TimeoutError)", async () => {
  let calls = 0;
  await withMockFetch(
    async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          text: async () => {
            throw new DOMException("The operation timed out.", "TimeoutError");
          },
        };
      }
      return { ok: true, text: async () => '[{"n":2}]' };
    },
    async () => {
      const rows = await queryInflux("select 1", CONFIG);
      assert.deepEqual(rows, [{ n: 2 }]);
      assert.equal(calls, 2, "a body timeout must be retried exactly once");
    },
  );
});

test("queryInflux passes a timeout signal to fetch", async () => {
  await withMockFetch(
    async (_url, init) => {
      assert.ok(init?.signal instanceof AbortSignal);
      return { ok: true, text: async () => "[]" };
    },
    async () => {
      assert.deepEqual(await queryInflux("select 1", CONFIG), []);
    },
  );
});
