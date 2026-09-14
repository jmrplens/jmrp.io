#!/usr/bin/env node
/**
 * Triggers a docs build on every site that splices the canonical `#person`
 * into its own @graph, so a change to the entity reaches them.
 *
 * Each consumer FETCHES the canonical document from raw.githubusercontent at
 * build time, and always did: that is the propagation. Until 2026-09-15 they
 * also carried a committed `person.snapshot.json` as an offline fallback, and
 * this script rewrote it on every change, which put a commit into six
 * repositories whose history had nothing to do with the change. The fallback
 * is gone and the commits with it, leaving the one thing that was ever needed:
 * ask each site to rebuild.
 *
 * What makes dropping the copy safe is the other half of that change: a
 * consumer build that cannot read the canonical document now FAILS, rather
 * than quietly publishing a stale identity. There is no longer a silent
 * degradation to protect against, so there is nothing to keep in sync.
 *
 * How many consumers there are is `.github/identity-consumers.json`, not a
 * number written here: one of them is listed before its repository is public.
 *
 * Usage:
 *   node scripts/ci/propagate-identity.mjs            # dispatch
 *   node scripts/ci/propagate-identity.mjs --dry-run  # report only
 *
 * Requires `IDENTITY_SYNC_TOKEN` (a fine-grained PAT with Actions:write on
 * those repositories), or `GITHUB_TOKEN` when run locally. Contents:write is
 * no longer used and the token can be narrowed to match.
 *
 * @module
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const API = "https://api.github.com";
const ROOT = process.cwd();
const CONSUMERS = path.join(ROOT, ".github/identity-consumers.json");

const dryRun = process.argv.includes("--dry-run");
const token = process.env.IDENTITY_SYNC_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.error(
    "✗ IDENTITY_SYNC_TOKEN is missing (GITHUB_TOKEN works locally). Without a\n" +
      "  credential there is nothing to do: no build can be dispatched.",
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
 * Asks one consumer to rebuild its documentation site.
 *
 * A repository that does not exist yet is reported and skipped rather than
 * failing the run: the registry lists a consumer before it is published on
 * purpose, so the entry is already there on the day it appears.
 *
 * @param {{repo: string, dispatchWorkflow: string}} consumer - The target.
 * @param {string} owner - Repository owner.
 * @returns {Promise<{repo: string, state: string, detail?: string}>} Outcome.
 */
async function dispatchConsumer(consumer, owner) {
  const { repo, dispatchWorkflow } = consumer;

  if (dryRun) {
    return { repo, state: "would dispatch", detail: dispatchWorkflow };
  }

  const dispatch = await gh(
    `/repos/${owner}/${repo}/actions/workflows/${dispatchWorkflow}/dispatches`,
    { method: "POST", body: JSON.stringify({ ref: "main" }) },
  );

  if (dispatch.status === 204) {
    return { repo, state: "dispatched", detail: dispatchWorkflow };
  }
  if (dispatch.status === 404) {
    // Either the repository is not public yet or the workflow was renamed.
    // Both are worth naming, and neither is worth failing the whole run for.
    return {
      repo,
      state: "not published",
      detail: `no ${dispatchWorkflow}, or the repository is not there yet`,
    };
  }
  return {
    repo,
    state: "error",
    detail: `dispatch of ${dispatchWorkflow} returned ${dispatch.status}`,
  };
}

const { owner, consumers } = JSON.parse(fs.readFileSync(CONSUMERS, "utf8"));

console.log(
  `${dryRun ? "[dry-run] " : ""}Asking ${consumers.length} consumers to ` +
    `rebuild against the canonical #person...\n`,
);

const results = [];
for (const consumer of consumers) {
  // Serially on purpose: a handful of calls, and a credential failure should
  // show up on the first one rather than on all of them at once.
  results.push(await dispatchConsumer(consumer, owner));
}

const ICON = {
  dispatched: "✓",
  "would dispatch": "·",
  "not published": "◦",
  error: "✗",
};
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
const pending = results.filter((r) => r.state === "not published").length;
console.log(
  `\n✓ ${results.length} consumers accounted for` +
    (pending > 0 ? `, ${pending} not published yet.` : "."),
);
