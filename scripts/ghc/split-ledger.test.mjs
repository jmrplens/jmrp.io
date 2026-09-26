import assert from "node:assert/strict";
import { test } from "node:test";

import { splitLedger } from "./build-data.mjs";

const contributions = {
  exclude: ["ARM-software/MDK-Middleware#131"],
  listingRepos: ["microsoft/winget-pkgs"],
  listingAliases: {},
  displayName: { "henrygd/beszel-docs": "Beszel", "henrygd/beszel": "Beszel" },
  securityTitleAllow: [],
};
const listingSet = new Set(contributions.listingRepos);
const item = (over) => ({
  kind: "pull_request",
  state: "merged",
  fullName: "henrygd/beszel",
  number: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  hoursToMerge: 1,
  comments: 0,
  title: "feat: something",
  ...over,
});

test("code PRs land in the ledger, folded by project and year", () => {
  const { ledgerByYear } = splitLedger(
    [item({}), item({ fullName: "henrygd/beszel-docs", number: 2 })],
    contributions,
    listingSet,
  );
  assert.deepEqual(Object.keys(ledgerByYear), ["2026"]);
  assert.equal(ledgerByYear["2026"].Beszel.length, 2);
});

test("excluded items vanish from every view", () => {
  const out = splitLedger(
    [
      item({ fullName: "ARM-software/MDK-Middleware", number: 131 }),
      item({
        fullName: "ARM-software/MDK-Middleware",
        number: 131,
        kind: "issue",
      }),
    ],
    contributions,
    listingSet,
  );
  assert.deepEqual(out.ledgerByYear, {});
  assert.deepEqual(out.issuesByProject, {});
});

test("issues go to issuesByProject only", () => {
  const out = splitLedger(
    [
      item({ kind: "issue", state: "open" }),
      item({ kind: "issue", state: "closed" }),
    ],
    contributions,
    listingSet,
  );
  assert.deepEqual(out.ledgerByYear, {});
  assert.deepEqual(out.issuesByProject, { Beszel: { open: 1, closed: 1 } });
});

test("listing PRs group under the own project named in the title", () => {
  const out = splitLedger(
    [
      item({
        fullName: "microsoft/winget-pkgs",
        title: "New version: jmrplens.gitlab-mcp-server version 2.7.5",
      }),
      item({
        fullName: "microsoft/winget-pkgs",
        state: "closed",
        title: "jmrplens.gitlab-mcp-server 2.7.4",
      }),
    ],
    contributions,
    listingSet,
  );
  assert.deepEqual(out.ledgerByYear, {});
  assert.deepEqual(
    out.listingsByOwnProject["gitlab-mcp-server"]["winget-pkgs"],
    {
      fullName: "microsoft/winget-pkgs",
      merged: 1,
      open: 0,
    },
  );
});
