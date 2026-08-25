import { markdownFor } from "@utils/llms/mdx/types";

/**
 * A REST endpoint card: HTTP verb, path, whether it needs authentication, a
 * description and an optional slot body carrying request/response examples.
 *
 * The verb and path become one bold code span, because `POST /v1/usage-metrics`
 * is the string a model has to reproduce to be useful and splitting it across
 * two spans invites it to quote only half. The auth flag is spelled out rather
 * than copying the page's `Auth` chip: a chip is legible next to a padlock, a
 * bare word in a text corpus is not.
 *
 * Colour — the only other thing the card encodes — is dropped, since it merely
 * restates the verb.
 */
const LABEL = {
  en: { auth: "authentication required" },
  es: { auth: "autenticación requerida" },
} as const;

export default markdownFor({
  tag: "APIEndpoint",
  toMarkdown(node, ctx) {
    const method = ctx.attr(node, "method");
    const path = ctx.attr(node, "path");
    const description = ctx.attr(node, "description");
    const body = ctx.body(node);

    // The component is also used as a bare card with no props at all, with the
    // verb and path written as bold prose inside it (see the CrowdSec bouncer
    // draft). Synthesizing a header from missing props would print
    // `**undefined undefined**` over content that already says it.
    const signature = [method, path].filter(Boolean).join(" ");
    if (!signature) return body;

    const heading = ctx.flag(node, "auth")
      ? `**\`${signature}\`** (${LABEL[ctx.locale].auth})`
      : `**\`${signature}\`**`;

    return [heading, description ?? "", body]
      .filter((block) => block.trim() !== "")
      .join("\n\n");
  },
});
