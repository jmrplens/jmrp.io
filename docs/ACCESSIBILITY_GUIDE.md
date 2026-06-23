# Accessibility Guide for Content Authors

This guide outlines the best practices for using MDX components in blog posts to ensure the site remains accessible, performant, and deterministic.

## Core Principles

1. **Determinism:** For unchanged content, the built HTML should be identical between builds. Avoid output that varies build-to-build (timestamps, unseeded randomness); build-time–generated stable IDs (e.g. `crypto.getRandomValues()` for ARIA wiring) are fine, since they stay consistent within a build.
2. **Semantic HTML:** Use the correct component for the job (e.g., `<TerminalCommand>` for shell commands, `<Table>` for data).
3. **Explicit Context:** Provide `aria-label`, `title`, or `caption` props to give context to screen readers.

## Component Usage

### 1. TerminalCommand

Used for displaying shell commands or code snippets that look like a terminal.

**Required:**

- No explicit props required, but highly recommended to add context.

**Best Practice:**

- If the command is complex or the context isn't clear from the surrounding text, use `ariaLabel`.

```jsx
// Good (Auto-generated label based on content)
<TerminalCommand>
  sudo apt update && sudo apt upgrade -y
</TerminalCommand>

// Better (Explicit context)
<TerminalCommand ariaLabel="Command to update system packages">
  sudo apt update && sudo apt upgrade -y
</TerminalCommand>
```

### 2. Table

Used for structured data.

**Required:**

- `title` (acts as caption) OR `ariaLabel`. **One is mandatory.**

**Best Practice:**

- Prefer `title` as it provides a visible caption for all users.
- Use `ariaLabel` only if a visual caption is redundant or design-prohibited.

```jsx
// Best (Visible caption)
<Table title="Comparison of Nginx Modules">
  <thead>...</thead>
  <tbody>...</tbody>
</Table>

// Acceptable (Hidden label)
<Table ariaLabel="Comparison of Nginx Modules">
  <thead>...</thead>
  <tbody>...</tbody>
</Table>

// AVOID (Will trigger build warning and use generic fallback)
<Table>
  <thead>...</thead>
</Table>
```

### 3. Callout

Used for alerts, tips, and warnings.

**Required:**

- `type` (defaults to 'info').
- `title` OR `ariaLabel`.

**Best Practice:**

- Use `title` for a bold header.
- Use `type` to convey semantic meaning (info, warning, error, success, tip).

```jsx
// Best
<Callout type="warning" title="Deprecation Notice">
  This feature is deprecated in v2.0.
</Callout>

// Acceptable (Auto-generated label: "Warning callout")
<Callout type="warning">
  This feature is deprecated in v2.0.
</Callout>
```

### 4. Mermaid

Used for diagrams and charts.

**Required:**

- `caption` OR `title` OR `ariaLabel`.

**Best Practice:**

- Use `caption` for a visible description below the diagram.
- Use `title` for an internal title (rendered by Mermaid).

```jsx
// Best
<Mermaid caption="Figure 1: Authentication Flow">
  sequenceDiagram
    Alice->>Bob: Hello John, how are you?
</Mermaid>
```

### 5. BarChart

Used for visualizing data.

**Required:**

- `data` array.
- `title` OR `ariaLabel`.

**Best Practice:**

- If `title` or `ariaLabel` is missing, the component will fall back to a generic label like "Bar chart showing X items", but this is less descriptive. Always provide a title.

```jsx
<BarChart
  title="Server Response Times"
  data={[
    { label: "US-East", value: 120 },
    { label: "EU-West", value: 85 },
  ]}
/>
```

### 6. FileContent

Used for displaying file contents with a filename header.

**Required:**

- `filename`.

**Best Practice:**

- `ariaLabel` is auto-generated from filename and content, but can be overridden.

```jsx
<FileContent filename="nginx.conf" language="nginx">
  server {
    listen 80;
  }
</FileContent>
```

### 7. Diagram & Embedded components

The `MemoryMap`, `StructPacking`, `RegisterMap`, `ByteFrame`, `PacketDiagram`, `SubnetSplit`, `BitwiseOp`, `NumberBases`, `FloatLayout`, `TimingDiagram`, `EncodingDiagram`, `DeltaCompare`, `LayerStack`, `CallStack`, `Matrix` and `Pipeline` components share one accessibility pattern: each renders a `role="img"` figure with an i18n `aria-label` (keys under `components.*`), so a screen reader announces a single meaningful name instead of reading every cell.

**Best Practice:**

- Always pass a `title` (or an explicit `ariaLabel`) so the generated label is descriptive — without it the label falls back to a generic count (e.g. "Register layout with 3 fields").
- The decorative SVG/CSS internals are `aria-hidden`; where a tabular fallback matters (e.g. `DeltaCompare`) an `sr-only` table carries the data.
- Colors are paired with text/positional cues (set-bit highlighting, before/after order, legends), never color alone.

```jsx
<RegisterMap
  title="CTRL register"
  width={32}
  fields={[
    { name: "EN", bits: 0 },
    { name: "MODE", bits: "2:1" },
  ]}
/>
```
