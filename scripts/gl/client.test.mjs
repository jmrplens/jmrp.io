/**
 * Guards the GitLab.com client: GET only, the token only in a header and
 * never in an error, `x-next-page` pagination, one retry on a timeout, and
 * GraphQL errors surfaced as failures.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGitlabClient } from "./client.mjs";

const TOKEN = "glpat-test-secret";

/**
 * A fake `fetch` answering from a list of canned responses, recording calls.
 *
 * @param {Array<Response | Error>} answers - In call order.
 * @returns {{fetchImpl: typeof fetch, calls: {url: URL, init: RequestInit}[]}} The fake.
 */
function fakeFetch(answers) {
  const calls = [];
  const queue = [...answers];
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init });
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { fetchImpl, calls };
}

/**
 * A JSON response with optional headers.
 *
 * @param {unknown} body - Body.
 * @param {Record<string, string>} [headers] - Headers.
 * @param {number} [status] - Status.
 * @returns {Response} The response.
 */
function json(body, headers = {}, status = 200) {
  return Response.json(body, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("createGitlabClient refuses to start without a token", () => {
  assert.throws(() => createGitlabClient({ token: "" }), /not set/);
});

test("getAll follows x-next-page and sends GET with the token as a header only", async () => {
  const { fetchImpl, calls } = fakeFetch([
    json([{ iid: 1 }], { "x-next-page": "2" }),
    json([{ iid: 2 }], { "x-next-page": "" }),
  ]);
  const client = createGitlabClient({ token: TOKEN, fetchImpl });
  const rows = await client.getAll("/merge_requests", { author_id: 7 });
  assert.deepEqual(rows, [{ iid: 1 }, { iid: 2 }]);
  assert.equal(calls.length, 2);
  for (const { url, init } of calls) {
    assert.equal(init.method, "GET");
    assert.equal(init.headers["PRIVATE-TOKEN"], TOKEN);
    assert.ok(!url.href.includes(TOKEN));
    assert.equal(url.pathname, "/api/v4/merge_requests");
    assert.equal(url.searchParams.get("author_id"), "7");
    assert.equal(url.searchParams.get("per_page"), "100");
  }
  assert.equal(calls[1].url.searchParams.get("page"), "2");
});

test("a timed-out request is retried once", async () => {
  const timeout = new DOMException("timed out", "TimeoutError");
  const { fetchImpl, calls } = fakeFetch([timeout, json({ id: 1 })]);
  const client = createGitlabClient({ token: TOKEN, fetchImpl });
  assert.deepEqual(await client.get("/projects/1"), { id: 1 });
  assert.equal(calls.length, 2);
});

test("two timeouts fail, and no error message carries the token", async () => {
  const timeout = new DOMException("timed out", "TimeoutError");
  const { fetchImpl } = fakeFetch([timeout, timeout]);
  const client = createGitlabClient({ token: TOKEN, fetchImpl });
  await assert.rejects(client.get("/projects/1"), (error) => {
    assert.match(error.message, /timed out twice/);
    assert.ok(!error.message.includes(TOKEN));
    return true;
  });
});

test("an HTTP error names the path and status, never the query or the token", async () => {
  const { fetchImpl } = fakeFetch([json({ message: "401" }, {}, 401)]);
  const client = createGitlabClient({ token: TOKEN, fetchImpl });
  await assert.rejects(
    client.getAll("/issues", { author_id: 15_767_218 }),
    (error) => {
      assert.equal(error.message, "GitLab /api/v4/issues: HTTP 401");
      return true;
    },
  );
});

test("graphql sends the query as a GET and rejects a response with errors", async () => {
  const { fetchImpl, calls } = fakeFetch([
    json({ data: { user: null } }),
    json({ errors: [{ message: "bad" }] }),
  ]);
  const client = createGitlabClient({ token: TOKEN, fetchImpl });
  assert.deepEqual(await client.graphql("{user{id}}"), { user: null });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url.pathname, "/api/graphql");
  assert.equal(calls[0].url.searchParams.get("query"), "{user{id}}");
  await assert.rejects(client.graphql("{x}"), /returned errors/);
});
