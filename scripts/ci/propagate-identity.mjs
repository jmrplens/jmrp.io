#!/usr/bin/env node
/**
 * Propagates the canonical `#person` document to the sites that splice it into
 * their own @graph.
 *
 * The six consumers read the live document from raw.githubusercontent at build
 * time and keep a versioned `person.snapshot.json` as their offline fallback.
 * That snapshot was only ever refreshed by hand, so it froze: measured on
 * 2026-08-27, five of the six were still on the 2026-07-26 version. This script
 * rewrites it whenever the canonical document changes, and the commit itself —
 * landing inside the path prefix each repo's Pages workflow watches — starts
 * their build.
 *
 * The payload is the canonical file VERBATIM. Verified byte for byte: it equals
 * what every consumer's own `sync-identity.mjs` writes
 * (`JSON.stringify(doc, null, 2)` plus a trailing newline), so propagating it
 * never leaves a repo at odds with its own `--check`.
 *
 * Commit messages are written in English on purpose: they land in the consumer
 * repositories, whose history is English, not in this one.
 *
 * Usage:
 *   node scripts/ci/propagate-identity.mjs            # write
 *   node scripts/ci/propagate-identity.mjs --dry-run  # report only
 *
 * Requires `IDENTITY_SYNC_TOKEN` (a fine-grained PAT with Contents:write and
 * Actions:write on those repos), or `GITHUB_TOKEN` when run locally.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API = "https://api.github.com";
const ROOT = process.cwd();
const CANONICAL = path.join(ROOT, "public/identity/person.jsonld");
const CONSUMERS = path.join(ROOT, ".github/identity-consumers.json");

const COMMIT_MESSAGE =
  "chore(identity): sync the canonical #person snapshot\n\n" +
  "Propagated from jmrplens/jmrp.io, where the single source of\n" +
  "https://jmrp.io/#person lives. The build already reads the live document;\n" +
  "this refreshes the versioned fallback used when the network is not there.";

const dryRun = process.argv.includes("--dry-run");
const token = process.env.IDENTITY_SYNC_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.error(
    "✗ IDENTITY_SYNC_TOKEN is missing (GITHUB_TOKEN works locally). Without a\n" +
      "  credential there is nothing to do: the consumers can be neither read\n" +
      "  nor written.",
  );
  process.exit(1);
}

/**
 * Calls the GitHub API and returns the parsed body.
 *
 * @param {string} url - Absolute URL or API-relative path.
 * @param {RequestInit} [init] - Fetch options.
 * @returns {Promise<{status: number, body: any}>} Status and parsed body.
 */
async function gh(url, init = {}) {
  const response = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "jmrp.io-identity-propagation",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

/**
 * Syncs one consumer: compares its snapshot with the canonical document and
 * rewrites it when they differ.
 *
 * @param {{repo: string, snapshotPath: string, buildPathPrefix: string, dispatchWorkflow: string}} consumer - The target.
 * @param {string} owner - Account that owns the repositories.
 * @param {{name: string, email: string}} author - Commit author and committer.
 * @param {string} canonical - Canonical file contents.
 * @returns {Promise<{repo: string, state: string, detail: string}>} Outcome.
 */
async function syncConsumer(consumer, owner, author, canonical) {
  const { repo, snapshotPath } = consumer;
  const contentsUrl = `/repos/${owner}/${repo}/contents/${snapshotPath}`;

  const current = await gh(contentsUrl);
  if (current.status === 404) {
    return {
      repo,
      state: "error",
      detail: `${snapshotPath} is gone — was the file moved?`,
    };
  }
  if (current.status !== 200) {
    return {
      repo,
      state: "error",
      detail: `GET ${current.status}: ${current.body?.message ?? "no detail"}`,
    };
  }

  const existing = Buffer.from(current.body.content, "base64").toString("utf8");
  if (existing === canonical) return { repo, state: "in sync", detail: "" };

  if (dryRun) {
    const delta = canonical.length - existing.length;
    return {
      repo,
      state: "stale",
      detail: `would write ${canonical.length} B (${delta >= 0 ? "+" : ""}${delta})`,
    };
  }

  const put = await gh(contentsUrl, {
    method: "PUT",
    body: JSON.stringify({
      message: COMMIT_MESSAGE,
      content: Buffer.from(canonical, "utf8").toString("base64"),
      // The sha is the concurrency guard: if the file moved under us between
      // the read and the write, GitHub rejects it rather than clobbering.
      sha: current.body.sha,
      committer: author,
      author,
    }),
  });

  if (put.status !== 200 && put.status !== 201) {
    return {
      repo,
      state: "error",
      detail: `PUT ${put.status}: ${put.body?.message ?? "no detail"}`,
    };
  }

  const commit = put.body.commit.sha.slice(0, 7);

  // The commit lands inside the prefix that repo's push trigger watches, so its
  // build starts on its own. If the repo was restructured and that no longer
  // holds, fall back to dispatching the workflow by hand.
  if (snapshotPath.startsWith(consumer.buildPathPrefix)) {
    return { repo, state: "updated", detail: `commit ${commit}` };
  }

  const dispatch = await gh(
    `/repos/${owner}/${repo}/actions/workflows/${consumer.dispatchWorkflow}/dispatches`,
    { method: "POST", body: JSON.stringify({ ref: "main" }) },
  );
  return {
    repo,
    state: dispatch.status === 204 ? "updated" : "error",
    detail:
      dispatch.status === 204
        ? `commit ${commit} + manual dispatch`
        : `commit ${commit} but the dispatch failed (${dispatch.status})`,
  };
}

const canonical = fs.readFileSync(CANONICAL, "utf8");
const { owner, commitAuthor, consumers } = JSON.parse(
  fs.readFileSync(CONSUMERS, "utf8"),
);

console.log(
  `${dryRun ? "[dry-run] " : ""}Propagating ${canonical.length} B to ` +
    `${consumers.length} consumers...\n`,
);

const results = [];
for (const consumer of consumers) {
  // Serially on purpose: six calls, and a credential failure should show up on
  // the first one rather than six times at once.
  results.push(await syncConsumer(consumer, owner, commitAuthor, canonical));
}

const ICON = { updated: "✓", "in sync": "·", stale: "→", error: "✗" };
for (const result of results) {
  const detail = result.detail ? ` — ${result.detail}` : "";
  console.log(
    `  ${ICON[result.state] ?? "?"} ${result.repo.padEnd(24)} ${result.state}${detail}`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = results
    .map((r) => `| ${r.repo} | ${r.state} | ${r.detail || "—"} |`)
    .join("\n");
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Identity propagation${dryRun ? " (dry run)" : ""}\n\n` +
      `| Repo | State | Detail |\n| --- | --- | --- |\n${rows}\n`,
  );
}

const failed = results.filter((r) => r.state === "error");
if (failed.length > 0) {
  console.error(`\n✗ ${failed.length} of ${results.length} failed.`);
  process.exit(1);
}
console.log(`\n✓ ${results.length} consumers accounted for.`);
