/**
 * Contract between the MDX→markdown renderer and the per-component modules.
 *
 * Each component that needs a markdown form ships a sibling `<Name>.md.ts`
 * next to its `.astro`, so the behavior lives with the component instead of
 * in a central switch that has to be kept in sync with 62 tags.
 *
 * @module
 */

/** A node of the MDX mdast, narrowed to the fields this renderer touches. */
export interface MdxNode {
  type: string;
  /** Component or HTML tag name, for `mdxJsx*Element` nodes. */
  name?: string | null;
  attributes?: MdxAttribute[];
  children?: MdxNode[];
  /** Raw text, for `text`/`code`/`inlineCode`/`html` nodes. */
  value?: string;
  /** Fence info string, for `code` nodes. */
  lang?: string | null;
  depth?: number;
  /** ESTree attached by remark-mdx to expression nodes. */
  data?: { estree?: EstreeNode };
  position?: {
    start: { offset?: number; column?: number };
    end: { offset?: number };
  };
}

/**
 * An ESTree node, narrowed to the literal forms a component prop can take.
 *
 * `remark-mdx` attaches this to every expression attribute, which is what
 * lets props be read without evaluating anything.
 */
export interface EstreeNode {
  type: string;
  value?: unknown;
  name?: string;
  operator?: string;
  argument?: EstreeNode;
  elements?: (EstreeNode | undefined)[];
  properties?: {
    type: string;
    key?: EstreeNode;
    value?: EstreeNode;
  }[];
  expressions?: EstreeNode[];
  quasis?: { value?: { cooked?: string } }[];
  expression?: EstreeNode;
  body?: EstreeNode[];
}

/** A JSX attribute: `foo="bar"`, `foo={expr}` or `{...spread}`. */
export interface MdxAttribute {
  type: string;
  name?: string;
  value?:
    | string
    | { type: string; value?: string; data?: { estree?: EstreeNode } }
    | null;
}

/** Helpers handed to every component module. */
export interface MarkdownContext {
  /** Locale of the source file, for components with visible wording. */
  locale: "en" | "es";
  /** Absolute site origin, for turning root-relative links absolute. */
  siteUrl: string;
  /** String value of a JSX attribute, or `undefined` when absent. */
  attr: (node: MdxNode, name: string) => string | undefined;
  /** Boolean attribute: bare `foo`, `foo={true}` or `foo="true"`. */
  flag: (node: MdxNode, name: string) => boolean;
  /**
   * Value of an expression attribute (`items={[…]}`), evaluated as a
   * JavaScript literal. Returns `undefined` when the attribute is absent or
   * is not a literal this renderer can evaluate.
   */
  expr: <T>(node: MdxNode, name: string) => T | undefined;
  /** The node's children, already rendered to markdown. */
  body: (node: MdxNode) => string;
  /** The node's children as plain text, with markup flattened. */
  text: (node: MdxNode) => string;
  /** Renders one node to markdown (for handlers that walk their own tree). */
  render: (node: MdxNode) => string;
  /**
   * A heading line at the depth the source wrote it, shifted by the offset the
   * caller passed to `mdxToMarkdown`.
   *
   * A module that builds headings itself must go through this rather than
   * emitting a `#` run of its own. The same body is published two ways — as a
   * standalone document, where its `<h2>` is a top-level section, and nested
   * under a heading the corpus builder wrote, where that `<h2>` has to sit
   * below it. Only the caller knows how deep the document was nested, so the
   * depth arithmetic belongs here and not in the module.
   */
  heading: (depth: number, text: string) => string;
}

/** What a `<Name>.md.ts` module default-exports. */
export interface ComponentMarkdown {
  /**
   * Tag name(s) this module handles. An array registers aliases — a barrel
   * component whose sub-tags share one file, such as the terminal session.
   */
  tag: string | string[];
  /**
   * Markdown for one occurrence of the component.
   *
   * Return `""` to drop the component entirely. Throwing is never correct:
   * the renderer would fall back to the children, silently losing the
   * transform. Prefer returning the children verbatim when a prop is missing.
   */
  toMarkdown: (node: MdxNode, ctx: MarkdownContext) => string;
}

/**
 * Declares a component's markdown form.
 *
 * A thin identity helper, but it gives every module the same shape and makes
 * the contract checked at the definition site rather than at the registry.
 *
 * @param spec - The tag name(s) and the renderer.
 * @returns The same object, typed.
 */
export function markdownFor(spec: ComponentMarkdown): ComponentMarkdown {
  return spec;
}
