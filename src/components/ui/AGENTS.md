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
<Collapsible title="Click to expand">
  Hidden content here.
</Collapsible>
```
| Prop | Type | Default |
|------|------|---------|
| `summary` / `title` | `string` | `"Details"` |

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
    <li>pnpm ≥ 10</li>
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
