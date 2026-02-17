# Interactive Tools — Agent Reference

> 15 components, ~25,800 lines total. **All use vanilla JS** via `<script is:inline>` — NO Preact.

## Architecture Rules

1. **No Preact** — Preact is exclusively for `src/components/homelab/`
2. **DOM via `data-*` attributes** — Never use `getElementById` or hardcoded IDs
3. **IDs via `crypto.getRandomValues()`** — Generated at component mount time
4. **No inline `<script>`** — Only `<script is:inline>` (post-build adds CSP nonce)
5. **No inline `style="..."`** — Use UnoCSS classes or scoped `<style>`
6. **Scoped styles** — Each component has its own `<style>` block
7. **Client-side only** — All computation runs in the browser, no server calls

## Component Map

| Component | Lines | Category | Slug |
|---|---|---|---|
| `Base64Encoder` | 1642 | developer | `base64-encoder` |
| `CertInspector` | 1731 | security | `cert-inspector` |
| `ColorContrastChecker` | 1863 | developer | `color-contrast-checker` |
| `CronBuilder` | 1566 | developer | `cron-builder` |
| `CSPBuilder` | 2212 | security | `csp-builder` |
| `HashCalculator` | 576 | security | `hash-calculator` |
| `HTTPHeadersAnalyzer` | 1963 | security | `http-headers-analyzer` |
| `ModbusFrameBuilder` | 2741 | embedded | `modbus-frame-builder` |
| `NginxConfigGenerator` | 2293 | network | `nginx-config-generator` |
| `PasswordGenerator` | 1808 | security | `password-generator` |
| `RegexFlavorTable` | 115 | developer | — (helper, not standalone) |
| `RegexTester` | 1355 | developer | `regex-tester` |
| `SubnetCalculator` | 2327 | network | `subnet-calculator` |
| `TimestampConverter` | 1259 | developer | `timestamp-converter` |
| `WireGuardConfigGenerator` | 2368 | network | `wireguard-config-generator` |

## Registration

Tools are registered in `src/pages/tools/[...slug].astro` via a static `componentMap`:

```typescript
const componentMap: Record<string, any> = {
  CSPBuilder: CSPBuilder,
  HashCalculator: HashCalculator,
  // ... all 14 tools
};
```

The `appComponent` field in `src/content/tools/*.mdx` frontmatter maps to a key in `componentMap`.

## Categories (ordered)

1. **security** — CSPBuilder, HashCalculator, CertInspector, HTTPHeadersAnalyzer, PasswordGenerator
2. **developer** — Base64Encoder, ColorContrastChecker, CronBuilder, RegexTester, TimestampConverter
3. **network** — NginxConfigGenerator, SubnetCalculator, WireGuardConfigGenerator
4. **embedded** — ModbusFrameBuilder
5. **mikrotik** — (none currently, reserved)

## Common Patterns

### ID Generation
```javascript
const prefix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
  .map(b => b.toString(16).padStart(2, '0')).join('');
```

### DOM Selection
```javascript
const el = document.querySelector(`[data-${prefix}-input]`);
```

### Event Delegation
```javascript
container.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  // handle action
});
```

### i18n in Tools

Tool-specific translations are in `src/i18n/translations/{en,es}/tools.ts`. Since tools use `<script is:inline>` (no module imports), inject translations via `data-*` attributes:

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---
<div
  data-error-msg={t("shared.error")}
  data-copy-label={t("shared.copy")}
  data-copied-label={t("shared.copied")}
>
  <!-- Tool UI -->
</div>

<script is:inline nonce="NGINX_CSP_NONCE">
  const container = document.querySelector('[data-error-msg]');
  const errorMsg = container.getAttribute('data-error-msg');
</script>
```

Never hardcode English strings in `<script is:inline>` blocks.

## Adding a New Tool

1. Create `src/components/apps/MyTool.astro` following the patterns above
2. Create `src/content/tools/my-tool.mdx` with frontmatter (`appComponent: "MyTool"`)
3. Register in `componentMap` at `src/pages/tools/[...slug].astro`
4. Add icon to safelist in `uno.config.ts` if dynamically generated
