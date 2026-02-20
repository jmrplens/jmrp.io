# WebMCP Analyzer

A command-line tool that validates and analyzes [WebMCP](https://webmachinelearning.github.io/webmcp/) implementations on any website — like a Lighthouse audit, but for the W3C WebMCP specification.

WebMCP (Web Model Context Protocol) is a proposed standard that enables websites to expose functionality as "tools" invocable by browser-based AI agents. This analyzer inspects a site's implementation without needing a browser.

## Features

- **Manifest Discovery** — Checks `/.well-known/webmcp.json` and `<link rel="webmcp-manifest">`
- **Structure Validation** — Validates JSON structure, required fields, naming conventions
- **Tool Definitions** — Inspects each tool for name, description, schema, and annotations
- **Per-Page Analysis** — Detects provider scripts, registered tools, and WebMCP blocks
- **JavaScript Bundle Scanning** — Detects `registerTool`/`modelContext` patterns in external JS files
- **Declarative Form Detection** — Finds `toolname`/`tooldescription` attributes on `<form>` elements
- **Cross-Reference** — Compares manifest tools vs. tools actually found on pages
- **Security Checks** — HTTPS verification, sensitive data detection
- **Implementation Type Detection** — Identifies manifest-based, JS-runtime, declarative, or hybrid approaches
- **Scoring System** — Weighted 0–100 score across 5 categories
- **JSON Output** — Machine-readable results for CI/CD integration
- **Sitemap Crawling** — Automatically discovers pages via sitemap
- **Subpath URL Support** — Correctly resolves manifests at domain root for apps on subpaths

## Installation

```bash
# From the webmcp-analyzer directory
pip install -e .

# Or install directly
pip install .
```

Requires Python 3.10+.

## Usage

### Quick scan (root page only)

```bash
webmcp-analyzer https://jmrp.io
```

### Analyze specific pages

```bash
webmcp-analyzer https://jmrp.io --pages /blog/ /tools/ /tools/hash-calculator/
```

### Crawl sitemap for multi-page analysis

```bash
webmcp-analyzer https://jmrp.io --crawl --verbose
```

### JSON output for CI

```bash
webmcp-analyzer https://jmrp.io --crawl --json > webmcp-report.json
```

### All options

```
usage: webmcp-analyzer [-h] [--pages PATH [PATH ...]] [--crawl]
                       [--max-pages N] [--json] [--verbose] [--timeout SECS]
                       [--no-verify] [--version]
                       url

positional arguments:
  url                   Target website URL to analyze

options:
  --pages PATH [PATH ...]  Specific page paths to analyze
  --crawl                  Crawl sitemap to discover pages
  --max-pages N            Max pages when crawling (default: 30)
  --json                   Output results as JSON
  --verbose, -v            Show detailed information
  --timeout SECS           HTTP timeout in seconds (default: 15)
  --no-verify              Skip SSL certificate verification
  --version                Show version
```

## Scoring

The analyzer produces a weighted score from 0 to 100 across five categories:

| Category  | Weight | What it checks                                                 |
| --------- | ------ | -------------------------------------------------------------- |
| Discovery | 25%    | Manifest exists, Content-Type, link tag, caching, JS detection |
| Manifest  | 25%    | Valid JSON, tools array, required fields, uniqueness           |
| Tools     | 25%    | Per-tool validation: names, descriptions, schemas              |
| Pages     | 15%    | Provider detection, tool registration, JS bundles, declarative |
| Security  | 10%    | HTTPS, no sensitive data in manifest                           |

Severity levels:

- **PASS** → Full points
- **WARNING** → Half points
- **ERROR** → Zero points
- **INFO** → Not scored (informational only)

### Implementation Types & Expected Scores

| Implementation             | Expected Score | Notes                                          |
| -------------------------- | -------------- | ---------------------------------------------- |
| Manifest + provider (full) | 90–100         | Best: static discovery + runtime integration   |
| JS-runtime only            | ~56            | Works at runtime, lacks static discoverability |
| Declarative forms only     | ~56            | HTML-based tools, no manifest                  |
| Broken manifest + JS       | ~56            | Manifest exists but JSON is invalid            |
| No WebMCP detected         | ~10            | Only HTTPS check passes                        |

## Example Output

### Full manifest implementation (100/100)

```text
╭─────────────────────────────────────────────╮
│ WebMCP Analyzer v0.2.0                      │
│ Target: https://jmrp.io                     │
│ Implementation: manifest + provider         │
╰─────────────────────────────────────────────╯

Discovery
  ✓ Manifest found at /.well-known/webmcp.json
  ✓ Manifest Content-Type is application/json
  ✓ Manifest is valid JSON
  ✓ Manifest has Cache-Control header
  ✓ <link rel="webmcp-manifest"> found in HTML
  ✓ Link href matches well-known manifest location
  ████████████████████ 6/6 checks — 100%

╭── Summary ──────────────────────────────────╮
│ ████████████████████████████████████████     │
│ Overall Score: 100/100  ✓ 46 passed         │
╰─────────────────────────────────────────────╯
```

### JS-only implementation (56/100)

```text
╭─────────────────────────────────────────────╮
│ WebMCP Analyzer v0.2.0                      │
│ Target: https://example.com/webmcp-demo     │
│ Implementation: js-runtime                  │
╰─────────────────────────────────────────────╯

Discovery
  ⚠ Manifest not found at /.well-known/webmcp.json
  ✓ WebMCP JS runtime detected (1 bundle(s))
  ██████████░░░░░░░░░░ 1/2 checks — 50%

Recommendations
  1. Add /.well-known/webmcp.json manifest for static
     discoverability by AI agents and crawlers.
  2. Add <link rel="webmcp-manifest"> to HTML <head>.

╭── Summary ──────────────────────────────────╮
│ ██████████████████████░░░░░░░░░░░░░░░░░░    │
│ Overall Score: 56/100  ✓ 3 passed  ⚠ 2 warn│
╰─────────────────────────────────────────────╯
```

## How It Works

The analyzer performs pure HTTP-based analysis — no headless browser required:

1. **Security check** — Verifies HTTPS usage
2. **Fetches `/.well-known/webmcp.json`** at the domain root and validates the response (Content-Type, JSON structure, caching headers)
3. **Parses HTML** looking for `<link rel="webmcp-manifest">` tags
4. **Validates each tool** in the manifest against the WebMCP spec (names, descriptions, schemas, annotations)
5. **Scans pages** for provider scripts with `data-webmcp-tools` attributes, inline `registerTool` calls, and `// === WebMCP START ===` blocks
6. **Scans external JS bundles** — Downloads same-origin `<script src>` files (skipping CDNs) and searches for `modelContext`/`registerTool`/`provideContext` patterns
7. **Detects declarative forms** — Finds `<form toolname="...">` and `<webmcp-tool>` custom elements
8. **Post-analysis adjustment** — If JS-only implementation is detected without a manifest, softens manifest-related errors and adds credit for the detected approach
9. **Cross-references** manifest tools against tools found on pages
10. **Calculates a weighted score** across all categories

### Subpath URL Handling

When analyzing apps on subpaths (e.g., `https://user.github.io/project/demo/`), the analyzer correctly:

- Checks the manifest at the **domain root**: `https://user.github.io/.well-known/webmcp.json`
- Analyzes the **given URL path** as the initial page
- Resolves relative script URLs correctly for JS scanning

## WebMCP Specification

This tool validates against the [W3C WebMCP proposal](https://webmachinelearning.github.io/webmcp/):

### Three approaches detected

1. **Manifest-based** — `/.well-known/webmcp.json` with `tools[]` array + `<link rel="webmcp-manifest">` in `<head>`. Best for static discoverability.
2. **JavaScript runtime** — `navigator.modelContext.registerTool()` calls in JavaScript bundles. Works at runtime but invisible to crawlers.
3. **Declarative forms** — `<form toolname="..." tooldescription="...">` with `toolparamdescription` on inputs. Chrome Labs approach.

### Validated tool fields

- `name` — Required, kebab-case convention
- `description` — Required, 10–500 characters
- `inputSchema` — Optional JSON Schema with `type: "object"`, `properties`, `required`
- `annotations` — Optional, currently only `readOnlyHint` is specified

## Tested Sites

Sites the analyzer has been validated against:

| Site                                                                                                       | Type        | Score |
| ---------------------------------------------------------------------------------------------------------- | ----------- | ----- |
| [jmrp.io](https://jmrp.io)                                                                                 | manifest    | 100   |
| [andreinwald/webmcp-demo](https://andreinwald.github.io/webmcp-demo)                                       | js-runtime  | 56    |
| [ChromeLabs french-bistro](https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/)           | declarative | 56    |
| [ChromeLabs react-flightsearch](https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch/) | js-runtime  | 56    |
| [travel-demo.bandarra.me](https://travel-demo.bandarra.me/)                                                | js-runtime  | 56    |
| [guilindev.xyz](https://guilindev.xyz)                                                                     | js-runtime  | 56    |
| [webmcp.sh](https://webmcp.sh)                                                                             | js-runtime  | 56    |

## Development

```bash
cd webmcp-analyzer
pip install -e .

# Run against a local site
webmcp-analyzer http://localhost:4321 --verbose

# Run against production
webmcp-analyzer https://jmrp.io --crawl -v
```

## License

Same as the parent project — see [LICENSE](../LICENSE).
