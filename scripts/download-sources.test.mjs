/**
 * Guards the download/verification split in `download-sources.mjs`: the
 * published "downloads" figure must never count an asset that merely verifies
 * a download.
 *
 * Every name below is a real release-asset name from the owner's public
 * repositories (503 distinct names on 2026-09-02), except the signing shapes
 * marked as such, which no pipeline emits yet and which the pattern covers so
 * that switching signing on cannot silently re-inflate the figure.
 *
 * @module
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { isVerificationAsset, readNuGetTotal } from "./download-sources.mjs";

test("isVerificationAsset: verification artifacts are excluded", () => {
  const verification = [
    // Real, from gitlab-mcp-server / libgen-mcp / cs-routeros-bouncer.
    "checksums.txt",
    "checksums.txt.bundle",
    "checksums.txt.sigstore.json",
    "gitlab-mcp-server_1.20.0_linux_x86_64.tar.gz.spdx.json",
    "gitlab-mcp-server_1.20.0_windows_arm64.zip.spdx.json.sigstore.json",
    // Not emitted yet: release signing and GitHub artifact attestations.
    "gitlab-mcp-server-linux-amd64.bundle",
    "gitlab-mcp-server-linux-amd64.sig",
    "cs-routeros-bouncer_1.5.0_linux_x86_64.tar.gz.asc",
    "cs-routeros-bouncer_1.5.0_linux_x86_64.tar.gz.sha256",
    "cs-routeros-bouncer_1.5.0_linux_x86_64.tar.gz.md5",
    "cosign.pub.pem",
    "bom.sbom.json",
    "provenance.intoto.jsonl",
  ];
  for (const name of verification) {
    assert.equal(isVerificationAsset(name), true, `expected excluded: ${name}`);
  }
});

test("isVerificationAsset: distributable artifacts are counted", () => {
  const artifacts = [
    // Real: every distinct shape the account publishes.
    "gitlab-mcp-server-linux-amd64",
    "gitlab-mcp-server-windows-amd64.exe",
    "gitlab-mcp-server_1.20.0_linux_x86_64.tar.gz",
    "gitlab-mcp-server_1.20.0_windows_arm64.zip",
    "cs-routeros-bouncer_1.5.0_linux_x86_64.tar.gz",
    "cf-updater-linux-x86_64",
    "cloudflare-dns-updater-monolith.sh",
    "ALab.mlappinstall",
    "ALab_OnlineInstaller_Windows.exe",
    "LoVE-BASS.v0.9.-.MacOS.Standalone.zip",
    "TFG-TFM_EPS_UA.pdf",
    // Adversarial: a real program whose NAME contains the word, which is why
    // the manifest pattern anchors on `.` or end-of-string, not a word break.
    "foo-checksums-tool.tar.gz",
    "my_checksums_report.zip",
    // Adversarial: signing-adjacent words that are not the extension.
    "signal-cli.tar.gz",
    "sha-utils.zip",
  ];
  for (const name of artifacts) {
    assert.equal(isVerificationAsset(name), false, `expected counted: ${name}`);
  }
});

test("isVerificationAsset: tolerates a malformed asset payload", () => {
  // A release asset that arrives without a `name` must not be silently
  // counted as a distributable artifact.
  for (const missing of [undefined, null, 42, {}, ""]) {
    assert.equal(
      isVerificationAsset(missing),
      false,
      `expected false: ${missing}`,
    );
  }
});

test("readNuGetTotal: reads the lifetime count of the package asked for", () => {
  // Shape of a real `q=packageid:` response, trimmed to the fields read.
  const body = {
    totalHits: 1,
    data: [{ id: "gitlab-mcp-server", version: "2.7.5", totalDownloads: 100 }],
  };
  assert.equal(readNuGetTotal(body, "gitlab-mcp-server"), 100);
  // NuGet ids are case-insensitive, and the registry echoes the id in the
  // casing it was published with, not the casing that was asked for.
  assert.equal(readNuGetTotal(body, "GitLab-MCP-Server"), 100);
});

test("readNuGetTotal: never counts a package other than the one asked for", () => {
  // `q=packageid:` is a query, not a lookup. A response carrying a near match
  // must throw rather than let another author's package into the total.
  const body = {
    data: [
      { id: "gitlab-mcp-server.linux-x64", totalDownloads: 49 },
      { id: "someone-elses-gitlab-mcp-server", totalDownloads: 999_999 },
    ],
  };
  assert.throws(
    () => readNuGetTotal(body, "gitlab-mcp-server"),
    /lists no such package/,
  );
});

test("readNuGetTotal: rejects a payload it cannot believe", () => {
  // Each of these would otherwise publish a figure that is not a count:
  // an empty result reads as "the package is gone", a missing or non-numeric
  // `totalDownloads` as a silent zero, and a string would turn every sum
  // downstream into concatenation.
  const unusable = [
    undefined,
    null,
    {},
    { data: [] },
    { data: null },
    { data: [{ id: "gitlab-mcp-server" }] },
    { data: [{ id: "gitlab-mcp-server", totalDownloads: "100" }] },
    { data: [{ id: "gitlab-mcp-server", totalDownloads: NaN }] },
  ];
  for (const body of unusable) {
    assert.throws(
      () => readNuGetTotal(body, "gitlab-mcp-server"),
      TypeError,
      `expected a throw for: ${JSON.stringify(body)}`,
    );
  }
});
