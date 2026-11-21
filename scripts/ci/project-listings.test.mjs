/**
 * Unit tests for `src/utils/project-listings.ts`, the rows of the "All
 * listings" popover on /projects/. Covers the case that used to render two
 * identical rows: one project listed twice on the same directory.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { projectListings } from "../../src/utils/project-listings.ts";

/** Only the fields `projectListings` reads; the rest of `Project` is unused. */
const PHONOMETRY = {
  id: "phonometry",
  listings: [
    { url: "https://pypi.org/project/phonometry/", label: "PyPI", icon: "x" },
  ],
  sameAs: [
    "https://pypi.org/project/PyOctaveBand/",
    "https://anaconda.org/conda-forge/phonometry",
    "https://doi.org/10.5281/zenodo.0000000",
  ],
};

describe("projectListings", () => {
  it("keeps the bare host when a project is on a directory once", () => {
    const rows = projectListings({
      id: "solo",
      sameAs: ["https://www.npmjs.com/package/x", "https://mcp.so/server/x"],
    });
    assert.deepEqual(
      rows.map((row) => [row.label, row.host]),
      [
        ["mcp.so", "mcp.so"],
        ["npm", "npmjs.com"],
      ],
    );
  });

  it("shows the path on every row of a repeated directory, and only there", () => {
    const rows = projectListings(PHONOMETRY);
    assert.deepEqual(
      rows.map((row) => [row.label, row.host, row.onCard]),
      [
        ["PyPI", "pypi.org/project/phonometry", true],
        ["conda-forge", "anaconda.org", false],
        ["DOI", "doi.org", false],
        ["PyPI", "pypi.org/project/PyOctaveBand", false],
      ],
    );
  });

  it("makes every row of one project distinguishable by label and host", () => {
    const rows = projectListings(PHONOMETRY);
    const names = rows.map((row) => `${row.label} ${row.host}`);
    assert.equal(new Set(names).size, names.length);
  });

  it("disambiguates an unmapped host whose label is the host itself", () => {
    const rows = projectListings({
      id: "twice",
      sameAs: ["https://example.net/b/", "https://example.net/a"],
    });
    assert.deepEqual(
      rows.map((row) => [row.label, row.host]),
      [
        ["example.net", "example.net/a"],
        ["example.net", "example.net/b"],
      ],
    );
  });

  it("orders rows of the same directory by path, whatever the YAML order", () => {
    const urls = [
      "https://pypi.org/project/zeta/",
      "https://pypi.org/project/alpha/",
    ];
    const forward = projectListings({ id: "f", sameAs: urls });
    const reverse = projectListings({ id: "r", sameAs: urls.toReversed() });
    assert.deepEqual(
      forward.map((row) => row.url),
      reverse.map((row) => row.url),
    );
    assert.equal(forward[0].host, "pypi.org/project/alpha");
  });
});
