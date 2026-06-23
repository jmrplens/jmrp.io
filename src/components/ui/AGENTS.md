# AGENTS.md — UI Component Quick Reference

> Quick reference for AI agents creating MDX blog posts and Astro pages.
> For full project context, see [`CLAUDE.md`](../../CLAUDE.md).
> For detailed component documentation, see [`README.md`](./README.md).

## Import Conventions

```mdx
// Direct imports
import Callout from "@components/ui/Callout.astro";

// Barrel exports (tabs)
import { Tabs, TabPanel } from "@components/ui/tabs";

// Barrel exports (terminal session)
import { TerminalSession, TerminalSessionCommand, TerminalSessionOutput } from "@components/ui/terminal-session";
```

---

## i18n in UI Components

All user-facing text in Astro components must use translated strings via `t()`:

```astro
---
import { getLangFromUrl, useTranslations } from "@i18n/utils";
const locale = getLangFromUrl(Astro.url);
const t = useTranslations(locale);
---
<section aria-label={t("aria.sectionName")}>
  <h2>{t("ui.heading")}</h2>
</section>
```

- Translation keys are in `src/i18n/translations/{en,es}/common.ts`
- Never hardcode English strings in templates or ARIA labels
- Component props like `title` in `<Callout>` are set by the caller (post content), not translated internally
- See `docs/I18N_GUIDE.md` for the complete guide

---

## Component Reference

### Content & Summary

#### TLDRSummary

```mdx
import TLDRSummary from "@components/ui/TLDRSummary.astro";
<TLDRSummary>
  Quick summary of the article.
</TLDRSummary>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | `"TL;DR"` |
| `collapsed` | `boolean` | `false` |

#### Callout

```mdx
import Callout from "@components/ui/Callout.astro";
<Callout type="warning" title="Watch out">
  Important information here.
</Callout>
```

| Prop | Type | Default |
|------|------|---------|
| `type` | `"info" \| "warning" \| "error" \| "success" \| "tip" \| "note" \| "keypoint" \| "important"` | `"info"` |
| `title` | `string` | — |
| `icon` | `string` | auto from type |

#### Collapsible

```mdx
import Collapsible from "@components/ui/Collapsible.astro";
<Collapsible summary="Click to expand">
  Hidden content here.
</Collapsible>
```

| Prop | Type | Default |
|------|------|---------|
| `summary` | `string` | `"Details"` |
| `title` | `string` | — *(alias for `summary`, kept for backward compatibility)* |

#### FAQ

Accessible, fully-collapsible FAQ section. Zero-JS: an outer `<details>` (whose
`<summary>` keeps the `<h2>` heading) wraps one nested `<details>` per question.
Answer text stays in the DOM when collapsed, so it remains crawlable/indexable.

> **You normally do NOT import `<FAQ>` in MDX.** Posts and tools declare a `faq`
> array in **frontmatter**; the layout renders this component AND emits the
> matching `FAQPage` JSON-LD from the same data (single source of truth). Import
> it directly only for an ad-hoc FAQ outside a post/tool.

```astro
import FAQ from "@components/ui/FAQ.astro";
<FAQ items={[{ question: "Q?", answer: "A." }]} />
```

| Prop | Type | Default |
|------|------|---------|
| `items` | `{ question: string; answer: string }[]` | **Yes** |
| `open` | `boolean` | `false` (outer block starts collapsed) |

---

### Status & Version

#### StateNotice

```mdx
import StateNotice from "@components/ui/StateNotice.astro";
<StateNotice type="experimental" feature="New API" />
```

| Prop | Type | Default |
|------|------|---------|
| `type` | `"deprecated" \| "mandatory" \| "experimental" \| "preview" \| "breaking" \| "security"` | `"deprecated"` |
| `feature` | `string` | — |
| `alternative` | `string` | — |
| `alternativeUrl` | `string` | — |
| `removalDate` | `string` | — |
| `title` | `string` | — |

#### VersionBadge

```mdx
import VersionBadge from "@components/ui/VersionBadge.astro";
<VersionBadge type="new" value="v2.0" />
```

| Prop | Type | Default |
|------|------|---------|
| `type` | `"version" \| "level" \| "deprecated" \| "new" \| "experimental" \| "stable"` | `"version"` |
| `value` | `string` | capitalized type |

#### SecurityRating

```mdx
import SecurityRating from "@components/ui/SecurityRating.astro";
<SecurityRating rating="A+" title="SSL Labs" description="Perfect score" />
```

| Prop | Type | Required |
|------|------|----------|
| `rating` | `"A+" \| "A" \| "B" \| "C" \| "D" \| "E" \| "F"` | **Yes** |
| `title` | `string` | No |
| `description` | `string` | No |

#### DeprecatedNotice

```mdx
import DeprecatedNotice from "@components/ui/DeprecatedNotice.astro";
<DeprecatedNotice feature="oldAPI" alternative="newAPI" alternativeUrl="/docs/new" />
```

| Prop | Type | Required |
|------|------|----------|
| `feature` | `string` | **Yes** |
| `alternative` | `string` | No |
| `alternativeUrl` | `string` | No |
| `removalDate` | `string` | No |

#### FallbackBanner

```mdx
import FallbackBanner from "@components/ui/FallbackBanner.astro";
<FallbackBanner locale={locale} />
```

Displays a notice when content is shown in the default locale (EN) because no translation
exists for the user's requested locale. Renders nothing when `locale === defaultLocale`.

| Prop | Type | Required |
|------|------|----------|
| `locale` | `Locale` | **Yes** |

> Typically used in bilingual page layouts, not in MDX blog posts. The `locale` value
> comes from `getLangFromUrl(Astro.url)`.

---

### Lists & Steps

#### CheckList

```mdx
import CheckList from "@components/ui/CheckList.astro";
<CheckList title="Requirements">
  <li data-check="check">Completed item</li>
  <li data-check="cross">Missing item</li>
  <li data-check="warning">Needs attention</li>
  <li data-check="optional">Nice to have</li>
</CheckList>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | — |

Valid `data-check` values: `"check"`, `"cross"`, `"warning"`, `"optional"`

#### StepByStep

```mdx
import StepByStep from "@components/ui/StepByStep.astro";
<StepByStep title="Installation">
  <li>Download the package</li>
  <li>Run the installer</li>
  <li>Verify the installation</li>
</StepByStep>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | — |

#### Prerequisite

```mdx
import Prerequisite from "@components/ui/Prerequisite.astro";
<Prerequisite>
  <ul role="list">
    <li>Node.js ≥ 22</li>
    <li>pnpm ≥ 11</li>
  </ul>
</Prerequisite>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | `"Prerequisites"` |

> Add `role="list"` to `<ul>` for Safari/VoiceOver compatibility.

---

### Documentation

#### DirectiveCard

```mdx
import DirectiveCard from "@components/ui/DirectiveCard.astro";
<DirectiveCard name="proxy_pass" syntax="proxy_pass URL" description="Sets the upstream server" mdnUrl="https://..." />
```

| Prop | Type | Required |
|------|------|----------|
| `name` | `string` | **Yes** |
| `syntax` | `string` | No |
| `description` | `string` | No |
| `mdnUrl` | `string` | No |
| `defaultValue` | `string` | No |
| `since` | `string` | No |

#### APIEndpoint

```mdx
import APIEndpoint from "@components/ui/APIEndpoint.astro";
<APIEndpoint method="GET" path="/api/users" description="List all users" auth />
```

| Prop | Type | Required |
|------|------|----------|
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | **Yes** |
| `path` | `string` | **Yes** |
| `description` | `string` | No |
| `auth` | `boolean` | No |

#### KeyValue

```mdx
import KeyValue from "@components/ui/KeyValue.astro";
<KeyValue title="Configuration" items={[
  { key: "Port", value: "443", description: "HTTPS port" },
  { key: "Protocol", value: "TLS 1.3" }
]} />
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | — |
| `items` | `Array<{ key: string; value: string; description?: string }>` | `[]` |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` |

---

### Comparison & Decision

#### BeforeAfter

```mdx
import BeforeAfter from "@components/ui/BeforeAfter.astro";
<BeforeAfter beforeLabel="Old Config" afterLabel="New Config">
  <Fragment slot="before">Old code here</Fragment>
  <Fragment slot="after">New code here</Fragment>
</BeforeAfter>
```

| Prop | Type | Default |
|------|------|---------|
| `beforeLabel` | `string` | `"Before"` |
| `afterLabel` | `string` | `"After"` |

**Slots**: `before`, `after` (named)

#### DecisionTree

```mdx
import DecisionTree from "@components/ui/DecisionTree.astro";
<DecisionTree question="Which protocol to use?">
  <details><summary>Need real-time? → WebSocket</summary>Low latency bidirectional communication.</details>
  <details><summary>REST API? → HTTP/2</summary>Standard request/response pattern.</details>
</DecisionTree>
```

| Prop | Type | Required |
|------|------|----------|
| `question` | `string` | **Yes** |

---

### Code & Terminal

#### Code

```mdx
import Code from "@components/ui/Code.astro";
<Code lang="nginx" title="nginx.conf">
server {
    listen 443 ssl;
}
</Code>
```

| Prop | Type | Default |
|------|------|---------|
| `lang` | `string` | `"text"` |
| `title` | `string` | — |
| `aria-label` | `string` | auto |
| `class` | `string` | — |

#### CodeBlock

```mdx
import CodeBlock from "@components/ui/CodeBlock.astro";
<CodeBlock lang="routeros">
/ip firewall filter add chain=forward action=drop
</CodeBlock>
```

| Prop | Type | Default |
|------|------|---------|
| `lang` | `string` | `"text"` |

> Lightweight code highlighting — same Shiki output as `Code` but with **no wrapper, header, or copy button**. Use inside `<TabPanel noPadding>` or anywhere bare highlighted code is needed.

#### FileContent

```mdx
import FileContent from "@components/ui/FileContent.astro";
<FileContent filename="/etc/nginx/nginx.conf" language="nginx" collapsible>
server { listen 80; }
</FileContent>
```

| Prop | Type | Required |
|------|------|----------|
| `filename` | `string` | **Yes** |
| `icon` | `string` | auto from filename |
| `language` | `string` | No |
| `collapsible` | `boolean` | No |
| `ariaLabel` | `string` | auto |

#### TerminalCommand

```mdx
import TerminalCommand from "@components/ui/TerminalCommand.astro";
<TerminalCommand>
sudo nginx -t && sudo systemctl reload nginx
</TerminalCommand>
```

| Prop | Type | Default |
|------|------|---------|
| `ariaLabel` | `string` | auto from content |

#### TerminalOutput

```mdx
import TerminalOutput from "@components/ui/TerminalOutput.astro";
<TerminalOutput title="Test Results">
All tests passed (43/43)
</TerminalOutput>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | — |
| `ariaLabel` | `string` | auto |

#### TerminalSession (multi-command)

```mdx
import { TerminalSession, TerminalSessionCommand, TerminalSessionOutput } from "@components/ui/terminal-session";
<TerminalSession title="Setup">
  <TerminalSessionCommand>
    npm install
  </TerminalSessionCommand>
  <TerminalSessionOutput>
    added 150 packages
  </TerminalSessionOutput>
  <TerminalSessionCommand prompt="#">
    npm run build
  </TerminalSessionCommand>
</TerminalSession>
```

**TerminalSession** props: `title`, `ariaLabel`
**TerminalSessionCommand** props: `prompt` (default `"$"`), `ariaLabel`
**TerminalSessionOutput** props: `title`, `ariaLabel`

---

### Visual & Data

#### Mermaid

```mdx
import Mermaid from "@components/ui/Mermaid.astro";
<Mermaid caption="Network topology" ariaLabel="Diagram showing network topology with firewall and servers">
flowchart LR
    A[Client] --> B{Firewall}
    B -->|Allow| C[Server]:::success
    B -->|Block| D[Drop]:::danger
</Mermaid>
```

| Prop | Type | Required |
|------|------|----------|
| `ariaLabel` | `string` | **Strongly recommended** |
| `caption` | `string` | No |
| `title` | `string` | No |
| `maxWidth` | `string` | No |
| `maxHeight` | `string` | No |

**Node classes**: `.success` (green), `.warning` (yellow), `.danger` (red), `.info` (blue), `.highlight` (purple), `.secondary` (gray)

#### BarChart

```mdx
import BarChart from "@components/ui/BarChart.astro";
<BarChart title="Response Times" data={[
  { label: "Nginx", value: 12 },
  { label: "Apache", value: 45 },
  { label: "Caddy", value: 18 }
]} valueUnit="ms" colorScheme="okabe-ito" />
```

| Prop | Type | Required |
|------|------|----------|
| `data` | `Array<{ label: string; value: number; color?: string }>` | **Yes** |
| `title` | `string` | No |
| `showPercentage` | `boolean` | No (`true`) |
| `showValue` | `boolean` | No (`true`) |
| `valueUnit` | `string` | No |
| `maxValue` | `number` | No (auto) |
| `colorScheme` | `string` | No (`"okabe-ito"`) |
| `ariaLabel` | `string` | No |
| `caption` | `string` | No |

#### BrowserSupport

```mdx
import BrowserSupport from "@components/ui/BrowserSupport.astro";
<BrowserSupport browsers={[
  { browser: "chrome", version: "90+", support: "full" },
  { browser: "firefox", version: "88+", support: "full" },
  { browser: "safari", version: "15+", support: "partial", note: "No WebP" }
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `browsers` | `BrowserInfo[]` | **Yes** |
| `title` | `string` | No (`"Browser Support"`) |

`BrowserInfo`: `{ browser: "chrome" | "firefox" | "safari" | "edge" | "opera"; version?: string; support: "full" | "partial" | "none" | "unknown"; note?: string }`

#### Table

```mdx
import Table from "@components/ui/Table.astro";
<Table title="Comparison" striped highlight>
  <thead><tr><th>Feature</th><th>Nginx</th><th>Apache</th></tr></thead>
  <tbody>
    <tr><td>HTTP/3</td><td data-status="success">Yes</td><td data-status="error">No</td></tr>
  </tbody>
</Table>
```

| Prop | Type | Default |
|------|------|---------|
| `title` | `string` | — |
| `striped` | `boolean` | `true` |
| `compact` | `boolean` | `false` |
| `highlight` | `boolean` | `true` |
| `bordered` | `boolean` | `false` |
| `ariaLabel` | `string` | `"Data table"` |

Cell `data-status`: `"success"`, `"error"`, `"warning"`, `"info"`

#### Timeline

```mdx
import Timeline from "@components/ui/Timeline.astro";
<Timeline events={[
  { date: "2024-01", title: "Project started", type: "milestone", icon: "i-mdi:rocket-launch" },
  { date: "2024-03", title: "Beta release", type: "success" },
  { date: "2024-06", title: "v1.0", description: "First stable release" }
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `events` | `TimelineEvent[]` | **Yes** |

`TimelineEvent`: `{ date: string; title: string; description?: string; icon?: string; type?: "default" | "success" | "warning" | "milestone" }`

---

### Tabs

```mdx
import { Tabs, TabPanel } from "@components/ui/tabs";
<Tabs>
  <TabPanel label="Ubuntu">
    ```bash
    sudo apt install nginx
    ```
  </TabPanel>
  <TabPanel label="CentOS">
    ```bash
    sudo yum install nginx
    ```
  </TabPanel>
</Tabs>
```

**Tabs** props: `class`
**TabPanel** props: `label` (required), `noPadding`

> Zero-JS implementation using CSS radio inputs. No client JavaScript needed.

---

### Media

#### YouTube

```mdx
import YouTube from "@components/ui/YouTube.astro";
<YouTube id="dQw4w9WgXcQ" title="Tutorial: Setting up Nginx" />
```

| Prop | Type | Required |
|------|------|----------|
| `id` | `string` | **Yes** |
| `title` | `string` | No (`"YouTube Video"`) |

Uses privacy-enhanced embed (`youtube-nocookie.com`), lazy loading, sandboxed iframe.

---

### References

```mdx
import References from "@components/ui/References.astro";
<References references={[
  { text: "Nginx Documentation", url: "https://nginx.org/en/docs/" },
  { text: "MDN Web Docs", url: "https://developer.mozilla.org/" }
]} />
```

> Usually auto-populated from frontmatter. Only use directly when extra references are needed.

---

### Diagram & Embedded

Zero-JS, theme-aware, responsive SVG/CSS diagrams for systems / embedded / C-C++ / networking content. All are `role="img"` figures with an i18n `aria-label` (keys under `components.*`). Prefer these over `Mermaid` for the structured cases below; keep `Mermaid` for arbitrary graphs.

#### MemoryMap

```mdx
import MemoryMap from "@components/ui/MemoryMap.astro";
<MemoryMap title="Where it lives" scale="shared" bars={[
  { label: "FLASH", segments: [
    { label: "kPool", bytes: 13374, sizeLabel: "13.4 KB" },
    { label: "kOffsets", bytes: 2690, sizeLabel: "2.6 KB" },
  ] },
  { label: "RAM", segments: [{ label: "runtime", bytes: 1 }] },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `bars` | `Array<{ label; segments: Array<{ label; bytes; sizeLabel?; color? }> }>` | **Yes** |
| `scale` | `"shared" \| "fill"` | No (`"fill"`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### StructPacking

```mdx
import StructPacking from "@components/ui/StructPacking.astro";
<StructPacking arch="64-bit" members={[
  { type: "uint8_t", name: "tag", size: 1 },
  { type: "void*", name: "next", size: 8 },
  { type: "uint16_t", name: "count", size: 2 },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `members` | `Array<{ type; name; size; align?; color? }>` | **Yes** |
| `arch` | `"32-bit" \| "64-bit"` | No (`"64-bit"`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### RegisterMap

```mdx
import RegisterMap from "@components/ui/RegisterMap.astro";
<RegisterMap title="CTRL" width={32} fields={[
  { name: "EN", bits: 0 },
  { name: "MODE", bits: "2:1" },
  { name: "PRIO", bits: "7:4", note: "priority" },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `fields` | `Array<{ name; bits: number \| "hi:lo"; color?; note? }>` | **Yes** |
| `width` | `number` | No (`32`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

Reserved gaps auto-fill; fits to width on mobile (ruler hidden when >16-bit).

#### ByteFrame

```mdx
import ByteFrame from "@components/ui/ByteFrame.astro";
<ByteFrame title="Inside kPool" fields={[
  { label: "len", bytes: 1 },
  { label: "UTF-8 bytes", bytes: 5, variable: true },
  { label: "NUL", bytes: 1 },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `fields` | `Array<{ label; bytes; variable?; note?; color? }>` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

Single row; for multi-row protocol headers use `PacketDiagram`.

#### PacketDiagram

```mdx
import PacketDiagram from "@components/ui/PacketDiagram.astro";
<PacketDiagram title="IPv4 header" bitsPerRow={32} fields={[
  { name: "Version", bits: 4 }, { name: "IHL", bits: 4 },
  { name: "Total Length", bits: 16 },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `fields` | `Array<{ name; bits; color? }>` | **Yes** |
| `bitsPerRow` | `number` | No (`32`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

Fields that cross a row boundary are split. Fits to width on mobile.

#### SubnetSplit

```mdx
import SubnetSplit from "@components/ui/SubnetSplit.astro";
<SubnetSplit ip="192.168.1.10" prefix={26} />
```

| Prop | Type | Required |
|------|------|----------|
| `ip` | `string` | **Yes** |
| `prefix` | `number` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### BitwiseOp

```mdx
import BitwiseOp from "@components/ui/BitwiseOp.astro";
<BitwiseOp width={8} a={0xb2} op="&" b={0x0f} aLabel="flags" bLabel="mask" />
```

| Prop | Type | Required |
|------|------|----------|
| `a` | `number` | **Yes** |
| `op` | `"&" \| "\|" \| "^" \| "<<" \| ">>" \| "~"` | **Yes** |
| `b` | `number` | No (shift amount / operand) |
| `width` | `number` | No (`8`) |
| `aLabel` / `bLabel` / `title` / `caption` / `ariaLabel` | `string` | No |

#### NumberBases

```mdx
import NumberBases from "@components/ui/NumberBases.astro";
<NumberBases value={0xb8} bits={8} />
```

| Prop | Type | Required |
|------|------|----------|
| `value` | `number` | **Yes** |
| `bits` | `number` | No (`8`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### FloatLayout

```mdx
import FloatLayout from "@components/ui/FloatLayout.astro";
<FloatLayout value={0.15625} precision="single" />
```

| Prop | Type | Required |
|------|------|----------|
| `value` | `number` | **Yes** |
| `precision` | `"single" \| "double"` | No (`"single"`) |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### TimingDiagram

```mdx
import TimingDiagram from "@components/ui/TimingDiagram.astro";
<TimingDiagram signals={[
  { name: "SCLK", wave: "p......" },
  { name: "MOSI", wave: "x=.=.=x", data: ["cmd", "addr", "data"] },
  { name: "CS", wave: "10.....1" },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `signals` | `Array<{ name; wave; data? }>` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

Wave chars: `0`/`1` wire, `p`/`n` clock, `.` extend, `x` don't-care, `z` hi-Z, `=`/`2`-`9` data bus. Scrolls horizontally when wide.

#### EncodingDiagram

```mdx
import EncodingDiagram from "@components/ui/EncodingDiagram.astro";
<EncodingDiagram title="UTF-8" rows={[
  { label: "A (U+0041)", bytes: ["41"] },
  { label: "é (U+00E9)", bytes: ["C3", "A9"] },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `rows` | `Array<{ label; bytes: string[]; note? }>` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### DeltaCompare

```mdx
import DeltaCompare from "@components/ui/DeltaCompare.astro";
<DeltaCompare unit=" B" rows={[
  { label: "Index table", before: 5300, after: 2650 },
  { label: "Firmware", before: 1341067, after: 1338903 },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `rows` | `Array<{ label; before; after; lowerIsBetter? }>` | **Yes** |
| `unit` | `string` | No |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### LayerStack

```mdx
import LayerStack from "@components/ui/LayerStack.astro";
<LayerStack layers={[
  { name: "Application", note: "your code" },
  { name: "HAL" },
  { name: "Registers / silicon" },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `layers` | `Array<{ name; note?; color? }>` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### CallStack

```mdx
import CallStack from "@components/ui/CallStack.astro";
<CallStack frames={[
  { name: "main()" },
  { name: "parse(buf, len)", detail: "locals: 24 B" },
  { name: "decode()", detail: "recursion depth 3" },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `frames` | `Array<{ name; detail?; color? }>` | **Yes** |
| `growthLabel` | `string` | No |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### Matrix

```mdx
import Matrix from "@components/ui/Matrix.astro";
<Matrix rowHeader="lang" cols={["BRAND", "OK"]} rows={["EN", "ES"]} cells={[
  ["@9379", "@1164"],
  ["@9379", "@1164"],
]} highlight={[[0, 0], [1, 0]]} />
```

| Prop | Type | Required |
|------|------|----------|
| `rows` / `cols` | `(string \| number)[]` | **Yes** |
| `cells` | `(string \| number)[][]` | **Yes** |
| `rowHeader` | `string` | No |
| `highlight` | `[number, number][]` | No |
| `title` / `caption` / `ariaLabel` | `string` | No |

#### Pipeline

```mdx
import Pipeline from "@components/ui/Pipeline.astro";
<Pipeline stages={[
  { name: "strings.json", note: "EN · ES" },
  { name: "gen_i18n.py", note: "pack + tail-merge", via: "raw strings" },
  { name: "firmware.elf", note: "13.4 KB .rodata", via: ".o" },
]} />
```

| Prop | Type | Required |
|------|------|----------|
| `stages` | `Array<{ name; note?; via?; color? }>` | **Yes** |
| `title` / `caption` / `ariaLabel` | `string` | No |

`via` labels the arrow into a stage (the artifact handed over). Vertical on mobile.

#### ForkJoin

```mdx
import ForkJoin from "@components/ui/ForkJoin.astro";
<ForkJoin
  ariaLabel="The generator forks into kPool and kOffsets, which the accessor joins."
  beforeLabel="Build time" afterLabel="Runtime"
  before={[{ name: "strings.csv", note: "id, en, es" }, { name: "generator" }]}
  branches={[{ name: "kPool", note: "blob" }, { name: "kOffsets", note: "uint16" }]}
  after={[{ name: "gen::string()" }, { name: "UI render" }]}
/>
```

| Prop | Type | Required |
|------|------|----------|
| `branches` | `Array<{ name; note?; color? }>` | **Yes** |
| `before` / `after` | `Array<{ name; note?; color? }>` | No |
| `beforeLabel` / `afterLabel` | `string` | No |
| `title` / `caption` / `ariaLabel` | `string` | No |

Fork → join data-flow: a linear chain splits into parallel `branches` then merges into another chain. Best with 2–3 branches. Linear sequence → `Pipeline`; arbitrary graph → `Mermaid`.

#### ThemeImage

```mdx
import ThemeImage from "@components/ui/ThemeImage.astro";
<ThemeImage srcLight="/img/x-light.webp" srcDark="/img/x-dark.webp" alt="Request flow" caption="Request flow" />
```

| Prop | Type | Required |
|------|------|----------|
| `src` OR (`srcLight` + `srcDark`) | `string` | **Yes** |
| `alt` | `string` | **Yes** |
| `caption` / `loading` | `string` | No |

#### FileDownload

```mdx
import FileDownload from "@components/ui/FileDownload.astro";
<FileDownload href="/files/string-pool.zip" filename="string-pool.zip" size="4 KB" />
```

| Prop | Type | Required |
|------|------|----------|
| `href` / `filename` | `string` | **Yes** |
| `size` / `description` | `string` | No |

---

## Accessibility Checklist

| Rule | Details |
|------|---------|
| `Mermaid` | Always provide `ariaLabel` describing the diagram |
| `Table` | Use `<thead>` + `<th scope="col">` or `<th scope="row">` |
| Images | Always include descriptive `alt` text |
| Headings | h1 (auto from title) → h2 → h3 — no skipping levels |
| Links | External: `target="_blank"` + `rel="noopener noreferrer"` (auto via rehype) |
| Lists | Add `role="list"` on `<ul>` inside `<Prerequisite>` for Safari VoiceOver |
| Color | Never use color alone to convey information |
| Motion | CSS respects `prefers-reduced-motion` automatically |

---

## Do's and Don'ts

### Do

- Import from barrel exports for Tabs and TerminalSession
- Use `data-check` attributes on `<li>` inside `CheckList`
- Provide `ariaLabel` on `Mermaid` diagrams
- Use `data-status` on `<td>` for colored table cells
- Use `title` prop on `Table` (generates `<caption>`)
- Use named slots (`before`/`after`) for `BeforeAfter`

### Don't

- Don't use Preact components in blog posts (Astro only)
- Don't skip heading levels (h2 → h4)
- Don't use inline styles — use UnoCSS classes
- Don't hardcode IDs — components auto-generate unique IDs
- Don't use `<script>` in MDX — breaks CSP
- Don't import TabPanel/Tabs individually when both are needed — use barrel export
- Don't hardcode English strings — use `t()` from `useTranslations()`
