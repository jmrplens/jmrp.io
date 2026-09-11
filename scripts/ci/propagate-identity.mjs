#!/usr/bin/env node
/**
 * Propagates the canonical `#person` document to the sites that splice it into
 * their own @graph.
 *
 * The consumers read the live document from raw.githubusercontent at build
 * time and keep a versioned `person.snapshot.json` as their offline fallback.
 * How many there are is `.github/identity-consumers.json`, not a number
 * written here: one of them is listed before its repository is public.
 * That snapshot was only ever refreshed by hand, so it froze: measured on
 * 2026-08-27, five of the six were still on the 2026-07-26 version. This script
 * rewrites it whenever the canonical document changes, and then makes sure the
 * consumer's docs build runs: by its own push trigger when that trigger really
 * watches the snapshot's path, by a workflow dispatch otherwise.
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

import { load as parseYaml } from "js-yaml";

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
 * Converts one GitHub Actions path filter to a RegExp.
 *
 * GitHub's filter syntax: `**` crosses directories, `*` and `?` do not, and a
 * leading `!` negates. Only what the consumers' workflows use is supported;
 * anything else fails closed in {@link pushTriggerCovers}.
 *
 * @param {string} glob - One entry of `on.push.paths`.
 * @returns {RegExp} Anchored matcher for a repository-relative path.
 */
function globToRegExp(glob) {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replaceAll(/[.+^${}()|[\]\\]/g, String.raw`\$&`);
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Whether a push that only touches `file` starts the consumer's docs workflow.
 *
 * Read from the workflow itself rather than assumed. The consumers roster used
 * to declare a `buildPathPrefix` and trust it: cs-routeros-bouncer's docs.yml
 * watches `docs/src/**`, `docs/public/**` and a few files, not
 * `docs/identity/**`, so four syncs between 2026-08-29 and 2026-09-10 each
 * reported "updated" while its site kept serving a #person with 14 of 24
 * `sameAs` (GEO audit #8, A2). Anything unreadable or unrecognised answers
 * false, which only costs a dispatch the push might have made unnecessary.
 *
 * @param {string} owner - Account that owns the repository.
 * @param {string} repo - Consumer repository.
 * @param {string} workflow - Workflow file name under .github/workflows/.
 * @param {string} file - Repository-relative path of the committed snapshot.
 * @returns {Promise<boolean>} True only when the push trigger demonstrably fires.
 */
async function pushTriggerCovers(owner, repo, workflow, file) {
  const response = await gh(
    `/repos/${owner}/${repo}/contents/.github/workflows/${workflow}`,
  );
  if (response.status !== 200) return false;
  let on;
  try {
    const doc = parseYaml(
      Buffer.from(response.body.content, "base64").toString("utf8"),
    );
    on = doc?.on;
  } catch {
    return false;
  }
  const push = on?.push;
  if (on === "push" || (Array.isArray(on) && on.includes("push"))) return true;
  if (push === undefined) return false;
  if (push === null) return true; // `push:` with no filters fires on any path.
  const branches = push.branches;
  if (Array.isArray(branches) && !branches.includes("main")) return false;
  if (Array.isArray(push["paths-ignore"])) {
    return push["paths-ignore"].every((glob) => !globToRegExp(glob).test(file));
  }
  if (!Array.isArray(push.paths)) return true;
  // Later entries win, and a `!pattern` excludes what an earlier one included.
  let included = false;
  for (const glob of push.paths) {
    const negated = glob.startsWith("!");
    if (globToRegExp(negated ? glob.slice(1) : glob).test(file)) {
      included = !negated;
    }
  }
  return included;
}

/**
 * Syncs one consumer: compares its snapshot with the canonical document and
 * rewrites it when they differ.
 *
 * @param {{repo: string, snapshotPath: string, dispatchWorkflow: string}} consumer - The target.
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
    // A missing file in a repository that exists is a real problem: the
    // snapshot was moved or renamed and this repo has silently stopped
    // receiving the identity. A missing *repository* is not, and there is
    // always one: a consumer is listed here while its site is still being
    // built, so the entry is ready on the day it is published.
    const repository = await gh(`/repos/${owner}/${repo}`);
    if (repository.status === 404) {
      return { repo, state: "not published", detail: "no repository yet" };
    }
    return {
      repo,
      state: "error",
      detail: `${snapshotPath} is gone, was the file moved?`,
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

  // A commit only "updates" a consumer if its site gets rebuilt. When the
  // docs workflow's own push filter covers the snapshot, the commit starts it;
  // otherwise dispatch it by hand, which is what "updated" used to skip.
  if (
    await pushTriggerCovers(
      owner,
      repo,
      consumer.dispatchWorkflow,
      snapshotPath,
    )
  ) {
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
  // Serially on purpose: a handful of calls, and a credential failure should
  // show up on the first one rather than on all of them at once.
  results.push(await syncConsumer(consumer, owner, commitAuthor, canonical));
}

const ICON = {
  updated: "✓",
  "in sync": "·",
  stale: "→",
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
