# UI Components - Agent Reference

> **Purpose**: Quick reference for AI agents editing MDX content. Optimized for token efficiency and fast component selection.

## Component Import Pattern

```mdx
import ComponentName from "@/components/ui/ComponentName.astro";
import { Tabs, TabPanel } from "@/components/ui/tabs";
```

---

## Content Components

### TLDRSummary
**Use**: Executive summary at article start.
```mdx
<TLDRSummary title="Key Points">
  - Point 1
  - Point 2
</TLDRSummary>
```
Props: `title?: string`, `collapsed?: boolean`

### Callout
**Use**: Highlighted boxes for notes/warnings.
```mdx
<Callout type="warning" title="Title">Content</Callout>
```
Props: `type: "note" | "tip" | "important" | "warning" | "caution"`, `title?: string`

Types:
- `note` = FYI, background info
- `tip` = Best practices
- `important` = Critical info
- `warning` = Potential issues
- `caution` = Dangerous actions

### Collapsible
**Use**: Expandable sections for optional content.
```mdx
<Collapsible summary="More Details">
  Hidden content...
</Collapsible>
```
Props: `summary?: string` (or `title` as alias), `open?: boolean` (native details attribute)

---

## Status Indicators

### StateNotice
**Use**: Prominent status banners.
```mdx
<StateNotice type="deprecated" feature="report-uri" alternative="report-to" removalDate="2024-01" />
<StateNotice type="experimental" feature="trusted-types" />
```
Props: `type: "deprecated" | "mandatory" | "experimental" | "preview" | "breaking" | "security"`, `feature?: string`, `alternative?: string`, `alternativeUrl?: string`, `removalDate?: string`

### VersionBadge
**Use**: Inline version/level indicators.
```mdx
CSP <VersionBadge type="level" value="3" /> introduces `strict-dynamic`.
This is <VersionBadge type="new" />.
```
Props: `type: "version" | "level" | "deprecated" | "new" | "experimental" | "stable"`, `value?: string`

### SecurityRating
**Use**: A+ to F grade badges.
```mdx
<SecurityRating rating="A+" title="Excellent" description="Your policy meets all requirements." />
```
Props: `rating: "A+" | "A" | "B" | "C" | "D" | "F"`, `title?: string`, `description?: string`

---

## Lists

### CheckList
**Use**: Lists with semantic icons (check/cross/warning).
```mdx
<CheckList title="Requirements">
  <li data-check="check">Required item</li>
  <li data-check="cross">Not allowed</li>
  <li data-check="warning">Caution item</li>
  <li data-check="optional">Optional item</li>
</CheckList>
```
Props: `title?: string`
Item attr: `data-check="check" | "cross" | "warning" | "optional"`

### StepByStep
**Use**: Numbered sequential instructions.
```mdx
<StepByStep title="Setup">
  <li>Step one</li>
  <li>Step two</li>
</StepByStep>
```
Props: `title?: string`

### Prerequisite
**Use**: Tutorial prerequisites box.
```mdx
<Prerequisite>
  - Nginx 1.19+
  - SSL configured
</Prerequisite>
```
Props: `title?: string` (default: "Prerequisites")

---

## Documentation

### DirectiveCard
**Use**: Document config directives/options.
```mdx
<DirectiveCard
  name="default-src"
  syntax="default-src <source-list>"
  description="Fallback for other directives."
  defaultValue="none"
  since="CSP Level 1"
  mdnUrl="https://developer.mozilla.org/..."
>
  Additional notes...
</DirectiveCard>
```
Props: `name: string`, `syntax?: string`, `description?: string`, `defaultValue?: string`, `since?: string`, `mdnUrl?: string`

### APIEndpoint
**Use**: REST API endpoint documentation.
```mdx
<APIEndpoint method="POST" path="/api/reports" description="Receives reports" auth>
  Request body details...
</APIEndpoint>
```
Props: `method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"`, `path: string`, `description?: string`, `auth?: boolean`

### KeyValue
**Use**: Key-value pair display.
```mdx
<KeyValue items={[
  { key: "Version", value: "1.0" },
  { key: "License", value: "MIT" }
]} />
```
Props: `items: { key: string; value: string }[]`, `title?: string`

---

## Comparisons

### BeforeAfter
**Use**: Side-by-side comparison.
```mdx
<BeforeAfter beforeLabel="Without CSP" afterLabel="With CSP">
  <div slot="before">Vulnerable...</div>
  <div slot="after">Protected...</div>
</BeforeAfter>
```
Props: `beforeLabel?: string`, `afterLabel?: string`

### BeforeAfter (for code comparisons)
**Use**: Side-by-side code comparison with slots.
```mdx
<BeforeAfter beforeLabel="Before" afterLabel="After">
  <div slot="before">
    ```nginx
    old code
    ```
  </div>
  <div slot="after">
    ```nginx
    new code
    ```
  </div>
</BeforeAfter>
```
Props: `beforeLabel?: string`, `afterLabel?: string`

> Note: `CompareCode` component was removed. Use `BeforeAfter` with code blocks in slots instead.

### DecisionTree
**Use**: Interactive decision guide.
```mdx
<DecisionTree question="Which option?">
  <details>
    <summary>Option A</summary>
    <p>Use this when...</p>
  </details>
  <details>
    <summary>Option B</summary>
    <p>Use this when...</p>
  </details>
</DecisionTree>
```
Props: `question: string`

---

## Code Blocks

### Code
**Use**: Syntax-highlighted snippets.
```mdx
<Code lang="javascript" title="Example" showLineNumbers highlight="1,3-5">
const x = 1;
</Code>
```
Props: `lang?: string`, `title?: string`, `showLineNumbers?: boolean`, `highlight?: string`

### FileContent
**Use**: Complete file with path header.
```mdx
<FileContent filename="/etc/nginx/nginx.conf" language="nginx" collapsible>
server { ... }
</FileContent>
```
Props: `filename: string`, `language?: string`, `icon?: string`, `collapsible?: boolean`, `ariaLabel?: string`

### TerminalCommand
**Use**: CLI commands to execute.
```mdx
<TerminalCommand>sudo nginx -t</TerminalCommand>
```
Props: `title?: string`, `prompt?: string` (default: "$")

### TerminalOutput
**Use**: Command output display.
```mdx
<TerminalOutput title="Output">
nginx: syntax is ok
</TerminalOutput>
```
Props: `title?: string`

---

## Visual

### Mermaid
**Use**: Diagrams (flowcharts, sequence).
```mdx
<Mermaid caption="Request Flow" maxWidth="600px">
flowchart LR
    A[Request] --> B{Valid?}
    B -->|Yes| C[Allow]:::success
    B -->|No| D[Block]:::danger
</Mermaid>
```
Props: `caption?: string`, `title?: string`, `ariaLabel?: string`, `maxWidth?: string`, `maxHeight?: string`

Node classes: `.success`, `.warning`, `.danger`, `.info`, `.highlight`, `.secondary`

### BarChart
**Use**: Bar chart visualization.
```mdx
<BarChart
  title="Scores"
  items={[
    { label: "A", value: 95, color: "#10b981" },
    { label: "B", value: 72, color: "#f59e0b" }
  ]}
/>
```
Props: `items: { label: string; value: number; color?: string }[]`, `title?: string`, `max?: number`

### BrowserSupport
**Use**: Browser compatibility table.
```mdx
<BrowserSupport
  title="CSP Support"
  browsers={[
    { browser: "chrome", version: "25", support: "full" },
    { browser: "firefox", version: "23", support: "full" },
    { browser: "safari", version: "7", support: "partial", note: "No report-to" },
    { browser: "edge", version: "12", support: "full" }
  ]}
/>
```
Props: `title?: string`, `browsers: BrowserInfo[]`

BrowserInfo: `{ browser: "chrome"|"firefox"|"safari"|"edge"|"opera", version?: string, support: "full"|"partial"|"none"|"unknown", note?: string }`

### Timeline
**Use**: Chronological events.
```mdx
<Timeline events={[
  { date: "2020", title: "v1.0", description: "Initial release", type: "milestone" },
  { date: "2021", title: "v2.0", description: "Major update", type: "success" }
]} />
```
Props: `events: { date: string; title: string; description?: string; type?: "default" | "success" | "warning" | "milestone"; icon?: string }[]`

---

## Tables & Tabs

### Table
**Use**: Data tables with semantic HTML.
```mdx
<Table title="Config Options" striped highlight>
  <thead>
    <tr><th>Name</th><th>Value</th></tr>
  </thead>
  <tbody>
    <tr><td>key1</td><td data-status="success">Active</td></tr>
    <tr><td>key2</td><td data-status="warning">Pending</td></tr>
  </tbody>
</Table>
```
Props: `title?: string`, `striped?: boolean`, `compact?: boolean`, `highlight?: boolean`, `bordered?: boolean`, `ariaLabel?: string`, `id?: string`, `class?: string`

Cell attr: `data-status="success" | "error" | "warning" | "info"`

### Tabs & TabPanel
**Use**: Tabbed content alternatives.
```mdx
import { Tabs, TabPanel } from "@/components/ui/tabs";

<Tabs>
  <TabPanel label="Nginx">Nginx config...</TabPanel>
  <TabPanel label="Apache">Apache config...</TabPanel>
</Tabs>
```
TabPanel Props: `label: string`

---

## References & Media

### CSPBuilder
**Use**: Interactive CSP policy builder with checkboxes.
```mdx
<CSPBuilder title="Build Your CSP" />
```
Props: `title?: string`, `showCategories?: boolean`

### HashCalculator
**Use**: SHA-256 hash calculator for CSP inline scripts.
```mdx
<HashCalculator
  title="CSP Hash Calculator"
  defaultCode="console.log('hello');"
/>
```
Props: `title?: string`, `defaultCode?: string`, `showExplanation?: boolean`

### References
**Use**: External links section.
```mdx
<References links={[
  { title: "MDN Docs", url: "https://...", description: "Official docs" }
]} />
```
Props: `links: { title: string; url: string; description?: string }[]`, `title?: string`

### YouTube
**Use**: Video embed.
```mdx
<YouTube id="videoID" title="Video Title" />
```
Props: `id: string`, `title?: string`

---

## Quick Selection Guide

| Need | Use |
|------|-----|
| Article summary | `TLDRSummary` |
| Warning/note | `Callout` |
| Hidden details | `Collapsible` |
| Feature status | `StateNotice` (banner) or `VersionBadge` (inline) |
| Grade/rating | `SecurityRating` |
| Requirements list | `CheckList` |
| Step-by-step | `StepByStep` |
| Prerequisites | `Prerequisite` |
| Config doc | `DirectiveCard` |
| API doc | `APIEndpoint` |
| Key-value | `KeyValue` |
| Code snippet | `Code` |
| Config file | `FileContent` |
| Command | `TerminalCommand` |
| Output | `TerminalOutput` |
| Diagram | `Mermaid` |
| Chart | `BarChart` |
| Browser support | `BrowserSupport` |
| History | `Timeline` |
| Before/after | `BeforeAfter` |
| Decision help | `DecisionTree` |
| Data table | `Table` |
| Alternatives | `Tabs` |
| External links | `References` |
| Video | `YouTube` |

---

## Internal Components (Do Not Use Directly)

- `CopyButton` - Used internally by code components
- `IconDetector` - Icon rendering helper
- `SRIEventListener` - SRI event handling
- `ThemeToggle` - Theme switcher
- `DeprecatedNotice` - Legacy, use `StateNotice` instead
