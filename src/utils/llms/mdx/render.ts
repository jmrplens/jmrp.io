import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  ComponentMarkdown,
  EstreeNode,
  MarkdownContext,
  MdxAttribute,
  MdxNode,
} from "./types";

/**
 * Renders a post or tool MDX body to markdown for the LLM corpus.
 *
 * ── Why an AST and not a line scanner ─────────────────────────────────────
 * The previous converter walked the file line by line and left every
 * component tag in the output, because rewriting them from text meant
 * re-implementing a JSX parser: multi-line props, nested quotes, template
 * literals, and — the reason the old code refused to try — angle brackets
 * that are not tags at all. `<CLIENT_PRIVATE_KEY>` appears in the prose of
 * post 007 inside an inline code span, and `# comment` lines appear inside
 * shell fences. A line scanner protects those with heuristics (column
 * anchoring, a name whitelist, a fence flag); a parser protects them by
 * construction, because they are `inlineCode` and `code` nodes and never
 * enter the JSX branch at all. All 58 published MDX files parse cleanly.
 *
 * ── Why the source is sliced rather than re-serialized ────────────────────
 * Every mdast node carries its byte offsets. Anything that is NOT a component
 * is emitted by slicing the original source, so prose, tables, lists and —
 * above all — fenced code keep their exact bytes. Only component ranges are
 * replaced. A mdast→markdown serializer would have to round-trip all of that
 * correctly, and every bug in it would corrupt a code sample.
 *
 * @module
 */

/**
 * Builds the tag→renderer map.
 *
 * Kept as a function taking the modules rather than globbing here, because
 * `import.meta.glob` only exists under Vite: the Astro build passes the glob
 * (see `registry.ts`) while the offline harness passes modules it imported by
 * scanning the directory itself, and both get the identical renderer.
 *
 * @param modules - Module namespaces, keyed by path.
 * @returns Tag name → component markdown spec.
 */
export function buildRegistry(
  modules: Record<string, { default?: ComponentMarkdown }>,
): Map<string, ComponentMarkdown> {
  const registry = new Map<string, ComponentMarkdown>();
  for (const module of Object.values(modules)) {
    const spec = module.default;
    if (!spec) continue;
    for (const tag of Array.isArray(spec.tag) ? spec.tag : [spec.tag]) {
      registry.set(tag, spec);
    }
  }
  return registry;
}

const PROCESSOR = unified().use(remarkParse).use(remarkMdx);

/** Node types that are a JSX element, flow or inline. */
const ELEMENT_TYPES = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);

/** Node types that carry no content of their own into the output. */
/** MDX `{…}` nodes, whose literal content is real prose rather than syntax. */
const EXPRESSION_TYPES = new Set(["mdxTextExpression", "mdxFlowExpression"]);

const SCAFFOLDING_TYPES = new Set([
  "mdxjsEsm",
  "mdxFlowExpression",
  "mdxTextExpression",
]);

/**
 * Node types that sit inside a paragraph rather than beside it.
 *
 * The first version listed only text, inlineCode and mdxJsxTextElement, so any
 * component whose direct children were phrasing nodes had them joined with a
 * blank line: `<li>Uses **nonces** or **hashes**</li>` came out as three
 * paragraphs. Every phrasing type mdast can produce belongs here.
 */
const INLINE_TYPES = new Set([
  "text",
  "inlineCode",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "strong",
  "emphasis",
  "delete",
  "link",
  "linkReference",
  "image",
  "imageReference",
  "break",
  "footnoteReference",
  "html",
]);

/**
 * Raw inline HTML written by hand in the MDX, mapped to markdown.
 *
 * These are NOT components, so there is no `.astro` to put a `.md.ts` beside
 * and they have to live here. Without them the generic fail-safe keeps only
 * the text: 102 `<a>` lose their destination, 860 `<code>` lose their
 * backticks, and — the reason this is a correctness fix rather than a fidelity
 * one — `10<sup>4</sup>` collapses to "104", which is not a lost distinction
 * but a false statement about a magnitude.
 */
const HTML_INLINE: Record<string, (inner: string) => string> = {
  code: (inner) => (inner.includes("`") ? inner : `\`${inner}\``),
  kbd: (inner) => (inner.includes("`") ? inner : `\`${inner}\``),
  strong: (inner) => `**${inner}**`,
  b: (inner) => `**${inner}**`,
  em: (inner) => `*${inner}*`,
  i: (inner) => `*${inner}*`,
  del: (inner) => `~~${inner}~~`,
  s: (inner) => `~~${inner}~~`,
  // Markdown has no superscript. `^` is the notation every plain-text
  // convention uses for it, and it keeps the exponent attached to its base.
  sup: (inner) => `^${inner}`,
  sub: (inner) => `_${inner}`,
  small: (inner) => inner,
  span: (inner) => inner,
  abbr: (inner) => inner,
  mark: (inner) => inner,
  br: () => "\n",
  wbr: () => "",
};

/** A JSX element node, flow or inline. */
function isElement(node: MdxNode): boolean {
  return ELEMENT_TYPES.has(node.type);
}

/** Import/export statements and `{/* … *​/}` expressions are page scaffolding. */
function isScaffolding(node: MdxNode): boolean {
  return SCAFFOLDING_TYPES.has(node.type);
}

/** Reads a string attribute, ignoring expression and spread attributes. */
function readAttr(node: MdxNode, name: string): string | undefined {
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || attribute.name !== name) {
      continue;
    }
    const { value } = attribute;
    if (typeof value === "string") return value;
    // `foo` with no value is a bare boolean, not a string.
    if (value === null) return undefined;
    if (value && typeof value === "object") {
      // `foo={"bar"}` — an expression that happens to be a string literal.
      const literal = evaluateAttribute(attribute);
      return typeof literal === "string" ? literal : undefined;
    }
  }
  return undefined;
}

/** Raw source of an expression attribute (`items={…}`), if present. */
function readExprSource(node: MdxNode, name: string): string | undefined {
  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute" || attribute.name !== name) {
      continue;
    }
    const { value } = attribute;
    if (value && typeof value === "object" && typeof value.value === "string") {
      return value.value;
    }
  }
  return undefined;
}

/**
 * Evaluates a JSX expression attribute from the ESTree the MDX parser already
 * attached to it.
 *
 * Component props here are hand-written JavaScript literals — unquoted keys,
 * single quotes, trailing commas, template literals — so `JSON.parse` cannot
 * read them. The obvious shortcut is `new Function`, and it is the wrong one:
 * it executes whatever it is handed. `remark-mdx` has already parsed the
 * expression into an ESTree (`value.data.estree`), so walking that and
 * accepting ONLY literal node types gives the same result with no evaluation
 * at all. Anything else — a call, an identifier, a spread — yields
 * `undefined`, and the component module falls back to its children.
 *
 * @param node - An ESTree node.
 * @returns The literal value, or `undefined` when the node is not a literal.
 */
function fromEstree(node: EstreeNode | undefined): unknown {
  if (!node) return undefined;
  switch (node.type) {
    case "Literal": {
      return node.value;
    }
    case "ArrayExpression": {
      return (node.elements ?? []).map((element) => fromEstree(element));
    }
    case "ObjectExpression": {
      return objectFromEstree(node);
    }
    case "UnaryExpression": {
      const value = fromEstree(node.argument);
      if (typeof value !== "number") return undefined;
      return node.operator === "-" ? -value : value;
    }
    case "TemplateLiteral": {
      // Only a template with no interpolations is a literal.
      if ((node.expressions ?? []).length > 0) return undefined;
      return (node.quasis ?? []).map((q) => q.value?.cooked ?? "").join("");
    }
    default: {
      return undefined;
    }
  }
}

/**
 * An object literal, as a plain object.
 *
 * @param node - An `ObjectExpression` node.
 * @returns The object, with computed and spread properties skipped.
 */
function objectFromEstree(node: EstreeNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const property of node.properties ?? []) {
    if (property.type !== "Property") continue;
    const key = propertyKey(property.key);
    if (key) out[key] = fromEstree(property.value);
  }
  return out;
}

/**
 * The one expression an attached estree consists of, when it is exactly one.
 *
 * Both callers wrap a single expression — a JSX attribute and an MDX `{…}`
 * node — so anything else (no program, several statements, a declaration) is
 * not a literal this renderer reads.
 *
 * @param program - The estree the MDX parser attached.
 * @returns The expression node, or `undefined`.
 */
function soleExpression(
  program: EstreeNode | undefined,
): EstreeNode | undefined {
  const statement = program?.body?.[0];
  return statement?.type === "ExpressionStatement"
    ? statement.expression
    : undefined;
}

/**
 * Name of an object-literal property: `{ foo: 1 }` or `{ "foo": 1 }`.
 *
 * @param key - The key node.
 * @returns The property name, or "" when the key is computed.
 */
function propertyKey(key: EstreeNode | undefined): string {
  if (!key) return "";
  if (key.type === "Identifier") return key.name ?? "";
  const { value } = key;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

/**
 * The literal value of an expression attribute.
 *
 * @param attribute - The JSX attribute.
 * @returns The value, or `undefined`.
 */
function evaluateAttribute(attribute: MdxAttribute): unknown {
  const value = attribute.value;
  if (!value || typeof value !== "object") return undefined;
  return fromEstree(soleExpression(value.data?.estree));
}

/**
 * The string an MDX expression node evaluates to, when it is a plain literal.
 *
 * @param node - An `mdxTextExpression` or `mdxFlowExpression` node.
 * @returns The string, or `undefined` when the expression is not a literal.
 */
function literalExpression(node: MdxNode): string | undefined {
  const value = fromEstree(soleExpression(node.data?.estree));
  return typeof value === "string" ? value : undefined;
}

/** Concatenated visible text of a subtree, with markup dropped. */
function plainText(node: MdxNode): string {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  if (node.type === "code") return node.value ?? "";
  if (isElement(node) || node.children) {
    return (node.children ?? []).map(plainText).join("");
  }
  return "";
}

/** Every descendant element, outermost first, without entering nested ones. */
function outermostElements(node: MdxNode): MdxNode[] {
  const found: MdxNode[] = [];
  const walk = (current: MdxNode) => {
    for (const child of current.children ?? []) {
      if (isElement(child) || isScaffolding(child)) {
        found.push(child);
        continue; // its own descendants are handled when IT is rendered
      }
      walk(child);
    }
  };
  walk(node);
  return found;
}

/**
 * Removes the indentation a block inherited from the component that wrapped it.
 *
 * A slice starts at the node's first character, so the opening line arrives
 * with no indent while every following line keeps the two spaces it had inside
 * the component — which turns a flat list into a nested one. Restoring the
 * first line's own indent and then dedenting by the common minimum fixes that
 * while preserving indentation that is structural, such as a nested list or
 * the body of a fenced block.
 *
 * @param text - Rendered block.
 * @param column - 1-based column the node started at.
 * @returns The block, dedented.
 */
function dedent(text: string, column: number): string {
  const restored = column > 1 ? " ".repeat(column - 1) + text : text;
  const lines = restored.split("\n");
  let min = Infinity;
  for (const line of lines) {
    if (line.trim() === "") continue;
    min = Math.min(min, /^ */u.exec(line)?.[0].length ?? 0);
  }
  if (!Number.isFinite(min) || min === 0) return restored;
  return lines.map((line) => line.slice(min)).join("\n");
}

/** Trims a run of blank lines down to at most one. */
function collapseBlankRuns(text: string): string {
  return text.replaceAll(/\n{3,}/gu, "\n\n");
}

/**
 * Deepest heading markdown has.
 *
 * A tool body's deepest heading is `<h4>`, and the corpus builder shifts it by
 * two, so it lands exactly on this bound and the clamp is never reached today.
 * It exists because the alternative failure is silent: `####### Title` is not a
 * heading in any parser, it is a paragraph that starts with seven hashes, and a
 * section title would become body text without anything erroring.
 */
const MAX_HEADING_DEPTH = 6;

/**
 * Converts one MDX body to markdown.
 *
 * @param body - The MDX source, without frontmatter.
 * @param options - Locale, site origin and the component registry.
 * @returns Markdown.
 */
export function mdxToMarkdown(
  body: string,
  options: {
    locale: "en" | "es";
    siteUrl: string;
    registry: Map<string, ComponentMarkdown>;
    /**
     * Levels to push a heading down by, for a body being nested under a
     * heading the caller wrote. Zero — the default — publishes the body's own
     * depths untouched, which is what a standalone document wants.
     *
     * This reaches the output only through `ctx.heading`, which is to say only
     * where a component module asks for it. It is deliberately NOT applied to
     * mdast `heading` nodes here: the renderer cannot tell a heading that is
     * document structure from one that is content another component will
     * re-wrap, and the corpus contains the second kind. `# Safely appends
     * without removing existing jobs` inside a `<TerminalSessionOutput>` is
     * terminal output that remark parses as an h1 and `TerminalSession` then
     * fences; rewriting it here turned that comment into `###` inside a code
     * block. `<ToolInfo>` shifts its own `<h2>`–`<h4>` tags, where the
     * distinction is unambiguous.
     */
    headingOffset?: number;
  },
): string {
  const REGISTRY = options.registry;
  const headingOffset = options.headingOffset ?? 0;
  const source = body;
  const tree = PROCESSOR.parse(source) as MdxNode;

  const slice = (node: MdxNode): string => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) return "";
    return source.slice(start, end);
  };

  const ctx: MarkdownContext = {
    locale: options.locale,
    siteUrl: options.siteUrl,
    attr: readAttr,
    flag: (node, name) => {
      for (const attribute of node.attributes ?? []) {
        if (attribute.type !== "mdxJsxAttribute" || attribute.name !== name) {
          continue;
        }
        if (attribute.value === null) return true;
        const raw = readExprSource(node, name) ?? readAttr(node, name);
        return raw === "true";
      }
      return false;
    },
    expr: <T>(node: MdxNode, name: string) => {
      const attribute = (node.attributes ?? []).find(
        (a) => a.type === "mdxJsxAttribute" && a.name === name,
      );
      return attribute
        ? (evaluateAttribute(attribute) as T | undefined)
        : undefined;
    },
    text: (node) => plainText(node).trim(),
    body: (node) => renderChildren(node),
    render: (node) => renderNode(node),
    heading: (depth, text) => {
      const level = Math.min(
        MAX_HEADING_DEPTH,
        Math.max(1, depth + headingOffset),
      );
      return `${"#".repeat(level)} ${text}`;
    },
  };

  /**
   * Renders a node by slicing its source and substituting only the ranges
   * occupied by components. Right-to-left so earlier offsets stay valid.
   */
  function renderWithSubstitutions(node: MdxNode): string {
    const base = node.position?.start.offset;
    if (base === undefined) return "";
    let out = slice(node);
    const elements = outermostElements(node);
    for (const element of elements.toReversed()) {
      const start = element.position?.start.offset;
      const end = element.position?.end.offset;
      if (start === undefined || end === undefined) continue;
      out =
        out.slice(0, start - base) +
        renderNode(element) +
        out.slice(end - base);
    }
    // Only for flow nodes: an inline node starts mid-line, so its "column" is
    // an offset into a sentence, not indentation. Restoring it as spaces put
    // the leading space of a text node into the common minimum and stripped
    // it, welding `**nonces** or **hashes**` into `**nonces**or **hashes**`.
    return INLINE_TYPES.has(node.type)
      ? out
      : dedent(out, node.position?.start.column ?? 1);
  }

  function renderNode(node: MdxNode): string {
    // `{"…"}` and `{`…`}` are how an author escapes MDX syntax — braces, angle
    // brackets, a lone backtick — so the literal inside them is CONTENT. Only
    // imports and `{/* … */}` comments are scaffolding. Treating every
    // expression as scaffolding emptied `<code>{"(?<name>…)"}</code>`.
    if (EXPRESSION_TYPES.has(node.type)) return literalExpression(node) ?? "";
    if (isScaffolding(node)) return "";

    if (isElement(node)) {
      const spec = node.name ? REGISTRY.get(node.name) : undefined;
      if (spec) return spec.toMarkdown(node, ctx);

      // Raw inline HTML the author wrote inside the MDX.
      const inlineHtml = node.name ? HTML_INLINE[node.name] : undefined;
      if (inlineHtml) return inlineHtml(renderChildren(node));
      if (node.name === "a") {
        const inner = renderChildren(node);
        const href = readAttr(node, "href");
        return href ? `[${inner}](${href})` : inner;
      }
      // Fail safe: an unknown tag contributes its children, never its own
      // syntax. A component added tomorrow degrades to its content instead of
      // publishing `<NewThing prop="…">` to a language model.
      return renderChildren(node);
    }

    // Anything that is not a component keeps its exact source bytes, so long
    // as no component is nested inside it.
    return renderWithSubstitutions(node);
  }

  function renderChildren(node: MdxNode): string {
    const parts: string[] = [];
    for (const child of node.children ?? []) {
      const rendered = renderNode(child);
      if (rendered.trim() === "") continue;
      parts.push(rendered);
    }
    // Flow children are separated by a blank line; inline children are not.
    const inline = node.children?.every((c) => INLINE_TYPES.has(c.type));
    return parts.join(inline ? "" : "\n\n");
  }

  return collapseBlankRuns(renderChildren(tree)).trim() + "\n";
}
