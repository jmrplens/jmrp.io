# Interactive tools: agent reference

> 17 tools plus 1 helper component (`RegexFlavorTable`), about 32,100 lines in total (counted 2026-11-07). **All use vanilla JS** via `<script is:inline>`, never Preact.

## Architecture rules

1. **No Preact**: Preact is only for `src/components/homelab/`, and even there it renders SSR-only.
2. **Per-instance IDs, never hardcoded ones**: the frontmatter builds `uniqueId` with `crypto.getRandomValues()` (for example `` `wg-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}` ``), marks the root with a `data-*-id` attribute, and gives every element an id derived from it (`${uniqueId}-mtu`). The script looks elements up through that prefix, so two instances on one page never collide.
3. **No inline `<script>`**: only `<script is:inline>` (the post-build step adds the CSP nonce).
4. **No `style="..."` built by script**: the nonce-only CSP blocks `style-src-attr`, and `csp-filters.mjs` files such reports as extension noise, so the breakage goes unnoticed. Use the `hidden` attribute (plus a scoped `[hidden] { display: none; }` when the class sets `display`) or CSSOM `el.style`. In the markup, prefer UnoCSS classes or the scoped `<style>`.
5. **Scoped styles do not reach nodes the script creates**: Astro scopes rules as `.class[data-astro-cid-xxx]`, and nodes made with `createElement` or `innerHTML` lack that attribute. Either copy the root's `data-astro-cid-*` attribute onto each new node (as the element helpers of `TimestampConverter`, `EnvelopeVisualizer`, `CSPBuilder` and `StringPoolPacker` do) or write the rule with `:global()`.
6. **Client-side first**: all processing runs in the browser. A tool may reach the network only when the user presses its button and only for the target it inspects (today `cert-inspector` queries public Certificate Transparency logs and `http-headers-analyzer` fetches through a no-log proxy on this domain), and every surface that summarizes the tools must name those exceptions.

## Component map

Line counts as of 2026-11-07; the category is the `category` field of each tool's MDX.

| Component | Lines | Category | Slug |
|---|---|---|---|
| `Base64Encoder` | 1683 | developer | `base64-encoder` |
| `BruteForceCost` | 709 | security | `pin-brute-force-calculator` |
| `CertInspector` | 1840 | security | `cert-inspector` |
| `ColorContrastChecker` | 1966 | developer | `color-contrast-checker` |
| `CronBuilder` | 1660 | developer | `cron-builder` |
| `CSPBuilder` | 2301 | security | `csp-builder` |
| `EnvelopeVisualizer` | 2047 | security | `etm-envelope-visualizer` |
| `HashCalculator` | 615 | security | `hash-calculator` |
| `HTTPHeadersAnalyzer` | 2114 | security | `http-headers-analyzer` |
| `ModbusFrameBuilder` | 2913 | embedded | `modbus-frame-builder` |
| `NginxConfigGenerator` | 2358 | network | `nginx-config-generator` |
| `PasswordGenerator` | 1870 | security | `password-generator` |
| `RegexFlavorTable` | 147 | developer | helper, not a tool: the `regex-tester` MDX renders it below the app; its markdown twin is `RegexFlavorTable.md.ts` |
| `RegexTester` | 1361 | developer | `regex-tester` |
| `StringPoolPacker` | 1444 | embedded | `string-pool-packer` |
| `SubnetCalculator` | 2597 | network | `subnet-calculator` |
| `TimestampConverter` | 1369 | developer | `timestamp-converter` |
| `WireGuardConfigGenerator` | 3118 | mikrotik | `wireguard-config-generator` |

## How a tool page is wired

There is no registry. Each tool MDX (`src/content/tools/{en,es}/<slug>.mdx`) imports its own app component, renders it inside `ToolApp` and puts its documentation inside `ToolInfo`:

```mdx
import WireGuardConfigGenerator from "@components/apps/WireGuardConfigGenerator.astro";
import ToolApp from "@components/ui/ToolApp.astro";
import ToolInfo from "@components/ui/ToolInfo.astro";

<ToolApp>
  <WireGuardConfigGenerator />
</ToolApp>

<ToolInfo>
  <!-- documentation -->
</ToolInfo>
```

`src/pages/tools/[...slug].astro` renders the MDX through `ToolPage.astro` inside `ToolLayout`. Until 2026-08-22 a static `componentMap` in `ToolPage` picked the app from an `appComponent` frontmatter field; Vite then bundled the CSS of every app into a shared chunk, 68 KB of foreign rules on each tool page. The import statement is now the single source of truth: `src/integrations/sitemap-post-dates.ts` reads the `@components/apps/*.astro` imports from the MDX to fold the component's git date into the tool's `<lastmod>`.

## Categories (display order)

1. **security**: CSPBuilder, HashCalculator, CertInspector, HTTPHeadersAnalyzer, PasswordGenerator, EnvelopeVisualizer, BruteForceCost
2. **developer**: Base64Encoder, ColorContrastChecker, CronBuilder, RegexTester, TimestampConverter
3. **network**: NginxConfigGenerator, SubnetCalculator
4. **embedded**: ModbusFrameBuilder, StringPoolPacker
5. **mikrotik**: WireGuardConfigGenerator

## Common patterns

### Element lookup

```javascript
var container = document.querySelector('[data-wg-id="' + uniqueId + '"]');
function el(suffix) {
  return document.getElementById(uniqueId + "-" + suffix);
}
```

### Event delegation

```javascript
container.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  // handle action
});
```

### i18n in tools

Tool translations live in `src/i18n/translations/{en,es}/tools.ts`, one block per tool, with the same keys in both locales. The frontmatter collects the strings the script needs into an `i18n` object and passes it with `define:vars`; markup text uses `t()` directly:

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
const uniqueId = `my-tool-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
/** Translations passed to the inline script via define:vars. */
const i18n = {
  copied: t("tools.shared.copied"),
  error: t("tools.shared.error"),
};
---
<div data-my-tool-id={uniqueId}>
  <button type="button">{t("tools.shared.copy")}</button>
</div>

<script is:inline define:vars={{ uniqueId, i18n }}>
  // i18n.copied, i18n.error ...
</script>
```

Never hardcode English strings in the markup or in `<script is:inline>` blocks, and that includes fallbacks for unusual values.

## Testing a tool

- Functional tests live in `tests/tools.functional.spec.ts`, one `describe` per tool. They run against a build, never against `astro dev`.
- Axe in CI only sees the page as it loads. After changing a tool, interact with it (open sections, raise warnings, generate output) and run axe again in both themes.
- In the production checkout a build is a deploy: verify in a worktree with `pnpm exec astro build --outDir <worktree>/dist`.

## Adding a new tool

1. Create `src/components/apps/MyTool.astro` following the patterns above.
2. Create `src/content/tools/en/my-tool.mdx` and `src/content/tools/es/my-tool.mdx` with the frontmatter that `src/content.config.ts` defines. The `description` (155 characters at most) says where the tool runs. The body imports the component inside `<ToolApp>`.
3. Add the tool's translations to `src/i18n/translations/{en,es}/tools.ts`.
4. Update every surface that counts or summarizes the tools: `<cat>Desc` and `<cat>Context` under `pages.toolsCategory` in `src/i18n/translations/{en,es}/common.ts`, `pages.tools.intro`, the home FAQ and `llms.txt` with its twins. If the tool reaches the network, name it wherever the tools are described as client-side (`scripts/ci/published-claims.test.mjs` checks that claim).
5. If it builds icon classes dynamically, add them to the safelist in `uno.config.ts`.
6. Add a `describe` block to `tests/tools.functional.spec.ts`.
