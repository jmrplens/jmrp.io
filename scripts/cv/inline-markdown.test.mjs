import assert from "node:assert/strict";
import { test } from "node:test";

import {
  escapeLatex,
  markdownToHtml,
  markdownToLatex,
} from "./inline-markdown.mjs";

test("escapeLatex escapes LaTeX special characters", () => {
  assert.equal(escapeLatex("50% & more #1"), String.raw`50\% \& more \#1`);
  assert.equal(escapeLatex("a_b"), String.raw`a\_b`);
  assert.equal(escapeLatex("{x}"), String.raw`\{x\}`);
  assert.equal(
    escapeLatex("~tilde^caret"),
    String.raw`\textasciitilde{}tilde\textasciicircum{}caret`,
  );
  assert.equal(
    escapeLatex(String.raw`back\slash`),
    String.raw`back\textbackslash{}slash`,
  );
});

test("markdownToLatex: plain text is escaped", () => {
  assert.equal(
    markdownToLatex("CPU del 80% al 17%"),
    String.raw`CPU del 80\% al 17\%`,
  );
});

test("markdownToLatex: bold and italic", () => {
  assert.equal(markdownToLatex("**x**"), String.raw`\textbf{x}`);
  assert.equal(markdownToLatex("*y*"), String.raw`\textit{y}`);
});

test("markdownToLatex: absolute link", () => {
  assert.equal(
    markdownToLatex("[Text](https://example.com)"),
    String.raw`\href{https://example.com}{Text}`,
  );
});

test("markdownToLatex: relative link resolves to jmrp.io", () => {
  assert.equal(
    markdownToLatex("[Doc](/pdf/a.pdf)"),
    String.raw`\href{https://jmrp.io/pdf/a.pdf}{Doc}`,
  );
});

test("markdownToLatex: link title (aria) is ignored", () => {
  assert.equal(
    markdownToLatex('[PE](https://x.io "Power Electronics web")'),
    String.raw`\href{https://x.io}{PE}`,
  );
});

test("markdownToLatex: percent in url is escaped", () => {
  assert.equal(
    markdownToLatex("[AµTech](https://x.io/a-%C2%B5tech/)"),
    String.raw`\href{https://x.io/a-\%C2\%B5tech/}{AµTech}`,
  );
});

test("markdownToLatex: mixed inline + link", () => {
  assert.equal(
    markdownToLatex("Investigador en **UPV** ([web](https://upv.es)) y más"),
    String.raw`Investigador en \textbf{UPV} (\href{https://upv.es}{web}) y más`,
  );
});

test("markdownToLatex: special chars in link text escaped, url not", () => {
  assert.equal(
    markdownToLatex("[R&D](https://x.io?a=1)"),
    String.raw`\href{https://x.io?a=1}{R\&D}`,
  );
});

test("markdownToLatex: empty/undefined yields empty", () => {
  assert.equal(markdownToLatex(""), "");
  assert.equal(markdownToLatex(), "");
  assert.equal(markdownToLatex(null), "");
});

test("markdownToHtml: plain text is HTML-escaped", () => {
  assert.equal(markdownToHtml("a < b & c"), "a &lt; b &amp; c");
});

test("markdownToHtml: bold and italic", () => {
  assert.equal(markdownToHtml("**x**"), "<strong>x</strong>");
  assert.equal(markdownToHtml("*y*"), "<em>y</em>");
});

test("markdownToHtml: link keeps relative url and sets rel/target", () => {
  assert.equal(
    markdownToHtml("[Doc](/pdf/a.pdf)"),
    '<a href="/pdf/a.pdf" target="_blank" rel="external noopener noreferrer">Doc</a>',
  );
});

test("markdownToHtml: link title becomes aria-label prefixed with the visible text (WCAG 2.5.3 label-in-name)", () => {
  assert.equal(
    markdownToHtml('[PE](https://x.io "Power Electronics web")'),
    '<a href="https://x.io" target="_blank" rel="external noopener noreferrer" aria-label="PE — Power Electronics web">PE</a>',
  );
});

test("markdownToHtml: attribute value is escaped", () => {
  assert.equal(
    markdownToHtml('[t](https://x.io "a & b")'),
    '<a href="https://x.io" target="_blank" rel="external noopener noreferrer" aria-label="t — a &amp; b">t</a>',
  );
});

test("markdownToHtml: unsafe link scheme is dropped (keeps text)", () => {
  assert.equal(markdownToHtml("[x](javascript:alert)"), "x");
  assert.equal(markdownToHtml("[y](data:text/html,bad)"), "y");
});

test("markdownToHtml: protocol-relative link is dropped (keeps text)", () => {
  assert.equal(markdownToHtml("[z](//evil.example.com)"), "z");
});

test("markdownToLatex: unsafe/protocol-relative links are dropped", () => {
  assert.equal(markdownToLatex("[x](javascript:alert)"), "x");
  assert.equal(markdownToLatex("[z](//evil.example.com)"), "z");
});
