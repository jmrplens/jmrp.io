/**
 * Unit tests for the software `@id` rule shared by the project nodes, the
 * series hubs, the canonical `#person` (`owns`) and the drift check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { load as loadYaml } from "js-yaml";

import { softwareId } from "./software-id.mjs";

test("a project with a public repository keeps the GitHub form", () => {
  assert.equal(
    softwareId({
      id: "gitlab-mcp-server",
      repo: "https://github.com/jmrplens/gitlab-mcp-server",
      docs: "https://docs.jmrp.io/gitlab-mcp-server/",
    }),
    "https://github.com/jmrplens/gitlab-mcp-server#software",
  );
});

test("a bare repository name is the GitHub form", () => {
  assert.equal(
    softwareId("phonometry"),
    "https://github.com/jmrplens/phonometry#software",
  );
});

test("a project without a repository is identified by its documentation", () => {
  assert.equal(
    softwareId({ id: "example", docs: "https://docs.jmrp.io/example/" }),
    "https://docs.jmrp.io/example/#software",
  );
});

test("a fragment already in the docs URL is replaced, not doubled", () => {
  assert.equal(
    softwareId({ id: "example", docs: "https://docs.jmrp.io/example/#intro" }),
    "https://docs.jmrp.io/example/#software",
  );
});

test("every project in projects.yaml keeps the @id it had before the rule moved here", () => {
  // The previous inline rule, verbatim: the GitHub form from the `id`. Every
  // project that has a repository must still get exactly that, or the nodes
  // jmrp.io and the docs sites publish would split in two.
  const { projects } = loadYaml(
    readFileSync(
      new URL("../../src/content/profile/projects.yaml", import.meta.url),
      "utf8",
    ),
  );
  for (const project of projects) {
    if (!project.repo) continue;
    assert.equal(
      softwareId(project),
      `https://github.com/jmrplens/${project.id}#software`,
      project.id,
    );
  }
});
