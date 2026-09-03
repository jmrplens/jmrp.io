/**
 * Unit tests for `restoreVerbatimTypography`
 * (`src/integrations/post-build/typography.ts`).
 *
 * The subject lives in `src/`, the test lives here: `pnpm test:unit` is
 * `node --test "scripts/**\/*.test.mjs"`, so this is the only place the runner
 * looks. Node loads the `.ts` module directly — it has no runtime imports, only
 * a `CheerioAPI` type — so there is nothing to build first.
 *
 * What these lock down, in order of why they exist:
 *
 *   1. The repair reaches every verbatim surface, including the ones that are
 *      neither `<code>` nor `<pre>` (GEO audit #7, A3, counted on the deployed
 *      build: 28 visible commands on 12 pages, 44 clipboard payloads, and the
 *      84 accessible names that quote those 28 commands).
 *   2. It reaches a line shape that does not exist yet, because the selectors
 *      are keyed on the CONTAINER — that is the difference between fixing a
 *      defect and closing a class of defect.
 *   3. It does NOT reach prose. Straightening an authored apostrophe in a paper
 *      abstract or a link's accessible name is the obvious way to overshoot,
 *      and the deployed build carries 1,001 curly quotes in prose text plus 19
 *      prose accessible names and 8 prose clipboard payloads that must
 *      survive.
 */
import assert from "node:assert/strict";
import test from "node:test";

import * as cheerio from "cheerio";

import { restoreVerbatimTypography } from "../../src/integrations/post-build/typography.ts";

/** Loads a fragment and runs the repair over it. */
function repair(html) {
  const $ = cheerio.load(html);
  const modified = restoreVerbatimTypography($);
  return { $, modified };
}

/** Decodes a `<CopyButton>` clipboard payload. */
function payload($, selector = "button.copy-button") {
  return decodeURIComponent($(selector).attr("data-content") ?? "");
}

/**
 * The DOM `<TerminalCommand>` emits: the copy button (with the payload and the
 * accessible name) in the head, the command lines as spans in the body.
 */
function terminalCommand(command) {
  return `<div class="jmrp-term terminal-command-wrapper copy-container">
    <div class="jmrp-term__head">
      <span class="jmrp-term__label jmrp-term__label--title">Decode</span>
      <button class="copy-button copy-button--term" type="button"
        aria-label="Copy command: Terminal command: ${command}"
        data-content="${encodeURIComponent(command)}"></button>
    </div>
    <div class="jmrp-term__body">
      <div class="jmrp-term__scroll" aria-label="Terminal command: ${command}">
        <div class="jmrp-term__line"><span class="term-prompt">❯</span><span
          class="term-cmd">${command}</span></div>
      </div>
    </div>
  </div>`;
}

test("repairs a command line rendered as <span class=term-cmd>", () => {
  const { $, modified } = repair(terminalCommand("base64 —decode file.b64"));
  assert.equal(modified, true);
  assert.equal($(".term-cmd").text(), "base64 --decode file.b64");
});

test("repairs the clipboard payload beside it, re-encoded", () => {
  const { $ } = repair(terminalCommand("date -d “2025-02-12” +%s"));
  assert.equal(payload($), 'date -d "2025-02-12" +%s');
  // Still a well-formed percent-encoded value, not raw text.
  assert.ok(!$("button").attr("data-content").includes('"'));
});

test("repairs the accessible names that quote the command", () => {
  const { $ } = repair(terminalCommand("tr -dc ‘A-Za-z0-9’ < /dev/urandom"));
  for (const label of $("[aria-label]")
    .map((_i, el) => $(el).attr("aria-label"))
    .get()) {
    assert.match(label, /tr -dc 'A-Za-z0-9' < \/dev\/urandom$/);
  }
});

test("visible text and clipboard payload agree afterwards", () => {
  // The exact regression the `code, pre` pass never covered: <TerminalOutput>
  // renders into a <pre> (repaired) but hands its button a separate copy that
  // the pass never visited. The page showed `--with-http_v3_module` while the
  // button copied `—with-http_v3_module`, on post 004, in both locales.
  const damaged = "configure arguments: --with-http_v3_module".replace(
    "--",
    "—",
  );
  const { $ } = repair(`<section class="jmrp-term">
    <div class="jmrp-term__head">
      <button class="copy-button" data-content="${encodeURIComponent(damaged)}"></button>
    </div>
    <div class="jmrp-term__body">
      <div class="jmrp-term__scroll"><pre class="jmrp-term__out">${damaged}</pre></div>
    </div>
  </section>`);
  assert.equal($("pre").text(), payload($));
  assert.match($("pre").text(), /--with-http_v3_module/);
});

test("repairs a terminal session's hidden raw text and clipboard fallback", () => {
  const cmd = String.raw`grep -Pn ‘\bfoo\b’ access.log`;
  const { $ } = repair(`<div class="jmrp-term terminal-session copy-container">
    <div class="jmrp-term__head"><button class="copy-button"
      data-content="${encodeURIComponent(cmd)}"></button></div>
    <div class="jmrp-term__body">
      <div class="ts-command" aria-label="Terminal command: ${cmd}">
        <div class="ts-command-raw" hidden>${cmd}</div>
        <div class="jmrp-term__line"><span class="term-cmd">${cmd}</span></div>
      </div>
      <div class="ts-output"><span class="ts-output__line">default-src ‘self’</span></div>
    </div>
    <div class="copy-content" hidden>${cmd}</div>
  </div>`);
  const expected = String.raw`grep -Pn '\bfoo\b' access.log`;
  assert.equal($(".ts-command-raw").text(), expected);
  assert.equal($(".jmrp-term > .copy-content").text(), expected);
  assert.equal($(".term-cmd").text(), expected);
  assert.equal($(".ts-output__line").text(), "default-src 'self'");
  assert.equal(payload($), expected);
});

test("closes the class: a line shape that does not exist yet is repaired", () => {
  // No selector names `.term-future`. It is repaired because it is inside the
  // terminal body, which is the whole point of keying on the container.
  const { $ } = repair(`<div class="jmrp-term"><div class="jmrp-term__body">
    <div class="jmrp-term__line"><b><i><span class="term-future"
      >curl —fail https://example.com</span></i></b></div>
  </div></div>`);
  assert.equal($(".term-future").text(), "curl --fail https://example.com");
});

test("still repairs plain <code> and <pre> (the original contract)", () => {
  const { $ } = repair(
    `<p>Set <code>Content-Security-Policy: ‘unsafe-inline’</code> and reload.</p>` +
      `<pre><code>return 200 “OK”;</code></pre>`,
  );
  assert.equal($("p code").text(), "Content-Security-Policy: 'unsafe-inline'");
  assert.equal($("pre").text(), 'return 200 "OK";');
});

test("leaves prose alone", () => {
  const prose = `<p>The author’s point — that “metadiffusers” work — stands.</p>
    <li>He said “no”.</li><h2>Nginx Beginner’s Guide</h2>`;
  const { $, modified } = repair(prose);
  assert.equal(modified, false);
  assert.match($("p").text(), /author’s point — that “metadiffusers”/);
  assert.equal($("li").text(), "He said “no”.");
  assert.equal($("h2").text(), "Nginx Beginner’s Guide");
});

test("leaves a paper abstract and its copy payload alone", () => {
  // <PublicationItem> reuses `.copy-content` and `.copy-container` for prose.
  // Eight abstracts on /publications/ carry authored curly quotes; a selector
  // written as a bare `.copy-content` would straighten every one of them.
  const abstract =
    "The proposed “metadiffusers” exploit the designer’s intent.";
  const { $, modified } = repair(`<article class="publication-item">
    <div class="pub-abstract"><div class="pub-card-wrapper copy-container">
      <div class="pub-card-header"><button class="copy-button"
        data-content="${encodeURIComponent(abstract)}"></button></div>
      <div class="pub-card-content copy-content">${abstract}</div>
    </div></div>
  </article>`);
  assert.equal(modified, false);
  assert.equal($(".copy-content").text(), abstract);
  assert.equal(payload($), abstract);
});

test("leaves a prose link's accessible name alone", () => {
  // 19 of these on the site: "O’Dwyer on ELF string merging (opens in new tab)".
  const { $, modified } = repair(
    `<p><a class="external-link" href="https://x.test"
      aria-label="O’Dwyer on ELF string merging (opens in new tab)">O’Dwyer</a></p>`,
  );
  assert.equal(modified, false);
  assert.match($("a").attr("aria-label"), /^O’Dwyer/);
});

test("leaves authored en dashes, ellipses and standalone em dashes in code", () => {
  // cron-builder ships `0–59`, string-pool-packer `id,en,es,…`, and
  // TimestampConverter uses a bare <code>—</code> as its empty-value placeholder.
  const { $, modified } = repair(
    `<code>0–59</code><code>id,en,es,…</code><code>—</code>` +
      `<div class="jmrp-term"><div class="jmrp-term__body">` +
      `<span class="term-cmd">sleep 1 — done</span></div></div>`,
  );
  assert.equal(modified, false);
  assert.equal($("code").eq(0).text(), "0–59");
  assert.equal($("code").eq(1).text(), "id,en,es,…");
  assert.equal($("code").eq(2).text(), "—");
  assert.equal($(".term-cmd").text(), "sleep 1 — done");
});

test("reports no change, and makes none, on a clean page", () => {
  const clean = terminalCommand("base64 --decode file.b64");
  const { $, modified } = repair(clean);
  assert.equal(modified, false);
  assert.equal($(".term-cmd").text(), "base64 --decode file.b64");
});

test("is idempotent", () => {
  const $ = cheerio.load(terminalCommand("base64 —decode “x” ‘y’"));
  assert.equal(restoreVerbatimTypography($), true);
  const once = $.html();
  assert.equal(restoreVerbatimTypography($), false);
  assert.equal($.html(), once);
});

test("does not double-process a text node reachable through nested roots", () => {
  // `<pre>` inside `.jmrp-term__body` matches both roots.
  const { $ } = repair(
    `<div class="jmrp-term"><div class="jmrp-term__body">` +
      `<pre><code>curl —silent “a—b”</code></pre></div></div>`,
  );
  assert.equal($("pre").text(), 'curl --silent "a--b"');
});

test("leaves a malformed clipboard payload untouched instead of throwing", () => {
  const { $, modified } = repair(
    `<div class="jmrp-term"><div class="jmrp-term__head">` +
      `<button class="copy-button" data-content="%E0%A4%A"></button>` +
      `</div></div>`,
  );
  assert.equal(modified, false);
  assert.equal($("button").attr("data-content"), "%E0%A4%A");
});
