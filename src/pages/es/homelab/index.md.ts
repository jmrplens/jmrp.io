import { homelabMarkdown } from "@utils/llms/homelab-markdown";
import { singleMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/es/homelab/index.md` — the markdown twin of the homelab page.
 *
 * Unlike every other twin, this one ships `HLM_*` placeholders rather than
 * values: nginx substitutes them as the file is served, from the same lua
 * filter the HTML page uses. Its nginx location must therefore send
 * `no-store` and disable the precompressed variants — see the module docs in
 * `@utils/llms/homelab-markdown`.
 */
export const { GET } = singleMarkdownRoute(
  (siteUrl, locale) => homelabMarkdown(locale, siteUrl),
  "es",
);
