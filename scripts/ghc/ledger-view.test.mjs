/**
 * Guards the ledger's order: entries by merged work, merged rows first, and
 * the repo prefix only where a row is the odd one out.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { ledgerProjects, rowPrefix } from "./ledger-view.mjs";

let day = 0;
/**
 * A ledger row, each one a day newer than the last.
 *
 * @param {string} state - merged, open or closed.
 * @param {string} [fullName] - Its repository.
 * @returns {{state: string, createdAt: string, fullName: string, n: number}} The row.
 */
const item = (state, fullName = "o/r") => {
  day += 1;
  const createdAt = new Date(Date.UTC(2026, 0, 1) + day * 86_400_000)
    .toISOString()
    .slice(0, 19);
  return { state, fullName, createdAt, n: day };
};

test("entries with merged work first, most merged first", () => {
  const ledger = {
    2026: {
      small: [item("merged")],
      big: [item("merged"), item("merged"), item("merged")],
      openOnly: [item("open")],
      mid: [item("merged"), item("merged"), item("open")],
    },
  };
  assert.deepEqual(
    ledgerProjects(ledger, []).map((e) => e.project),
    ["big", "mid", "small", "openOnly"],
  );
});

test("ties go to contributedTo's order, then to the name", () => {
  const ledger = {
    2026: {
      zeta: [item("merged")],
      alpha: [item("merged")],
      starry: [item("merged")],
    },
  };
  const contributedTo = [{ project: "starry" }, { project: "zeta" }];
  assert.deepEqual(
    ledgerProjects(ledger, contributedTo).map((e) => e.project),
    ["starry", "zeta", "alpha"],
  );
});

test("open-only entries go last, latest activity first", () => {
  const ledger = {
    2026: {
      older: [item("open")],
      newer: [item("open")],
      landed: [item("merged")],
    },
  };
  assert.deepEqual(
    ledgerProjects(ledger, []).map((e) => e.project),
    ["landed", "newer", "older"],
  );
});

test("closed rows are left out, and an entry of only closed rows too", () => {
  const ledger = {
    2026: { a: [item("closed"), item("merged")], gone: [item("closed")] },
  };
  const [entry, ...rest] = ledgerProjects(ledger, []);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    entry.items.map((it) => it.state),
    ["merged"],
  );
});

test("an entry of 85 merged and 20 open opens with ten merged rows", () => {
  const rows = [];
  for (let i = 0; i < 85; i += 1) rows.push(item("merged"));
  for (let i = 0; i < 20; i += 1) rows.push(item("open"));
  const [entry] = ledgerProjects({ 2026: { GitLab: rows } }, []);
  assert.equal(entry.merged, 85);
  assert.equal(entry.open, 20);
  assert.ok(entry.items.slice(0, 10).every((it) => it.state === "merged"));
});

test("merged rows first, then open ones, newest first within each", () => {
  const rows = [
    item("open"),
    item("merged"),
    item("open"),
    item("merged"),
    item("open"),
  ];
  const [entry] = ledgerProjects({ 2026: { p: rows } }, []);
  assert.deepEqual(
    entry.items.map((it) => `${it.state[0]}${it.n}`),
    [
      `m${rows[3].n}`,
      `m${rows[1].n}`,
      `o${rows[4].n}`,
      `o${rows[2].n}`,
      `o${rows[0].n}`,
    ],
  );
});

test("rows from several years fold into one entry", () => {
  const ledger = {
    2023: { p: [item("merged")] },
    2026: { p: [item("merged"), item("open")] },
  };
  const [entry] = ledgerProjects(ledger, []);
  assert.equal(entry.merged, 2);
  assert.equal(entry.open, 1);
});

test("rowPrefix names only the rows outside a strict-majority repo", () => {
  const solo = [{ fullName: "o/a" }, { fullName: "o/a" }];
  assert.equal(rowPrefix(solo, solo[0]), "");

  const gitlab = [
    ...Array.from({ length: 104 }, () => ({ fullName: "gitlab-org/gitlab" })),
    { fullName: "gitlab-org/cells/http-router" },
  ];
  assert.equal(rowPrefix(gitlab, gitlab[0]), "");
  assert.equal(rowPrefix(gitlab, gitlab[104]), "http-router ");

  const even = [
    { fullName: "henrygd/beszel" },
    { fullName: "henrygd/beszel-docs" },
  ];
  assert.equal(rowPrefix(even, even[0]), "beszel ");
  assert.equal(rowPrefix(even, even[1]), "beszel-docs ");
});
