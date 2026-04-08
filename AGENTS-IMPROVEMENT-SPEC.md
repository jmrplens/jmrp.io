# AGENTS-IMPROVEMENT-SPEC.md

> **Status**: ✅ Completed (April 2026) — preserved as a historical reference. Contents may be stale.

> Concrete improvement plan for the agent context files in this repository.
> Based on audit of: `CLAUDE.md`, `src/components/ui/AGENTS.md`, `src/components/apps/AGENTS.md`,
> `.claude/rules/*.md`, `.claude/skills/*/SKILL.md`, `.claude/settings.json`,
> `.github/agents/*.agent.md`, `.github/instructions/*.instructions.md`,
> `.github/prompts/*.prompt.md`, `.github/copilot-instructions.md`, `CONTRIBUTING.md`.

---

## Summary

The agent context system is well-structured and unusually thorough. The main gaps are:
missing skills for common workflows (i18n, new blog post, new component), stale counts
and version stamps in several files, a few factual errors in CONTRIBUTING.md and prompt
files, and missing entries for new components and path aliases.

---

## Fixes (correct errors in existing files)

### F1 — `CONTRIBUTING.md`: verify pipeline is wrong

**File**: `CONTRIBUTING.md`

**Problem**: The "Verification & Testing" section describes a 9-step pipeline and lists
`pnpm verify-icons` as step 5. The actual pipeline (`scripts/run-verify.mjs`) has 14
steps and does **not** include `verify-icons` (it runs separately).

**Fix**: Replace the pipeline description with the accurate 14-step table from
`CLAUDE.md` and remove the `verify-icons` entry. Add a note that `verify-icons` is a
standalone command, not part of `pnpm verify`.

---

### F2 — `run-tests.prompt.md`: suite count and list are stale

**File**: `.github/prompts/run-tests.prompt.md`

**Problem**: Says "11 total" suites and lists 11. The `tests/` directory has 17 spec
files. Missing from the list: `content-integrity.spec.ts`, `edge-cases.spec.ts`,
`i18n.spec.ts`, `schema-validation.spec.ts`, `tools.functional.spec.ts`,
`ui-components.spec.ts`.

**Fix**: Update the count to 17 and add the six missing suites with one-line
descriptions:

| Suite                       | Focus                                                       |
| --------------------------- | ----------------------------------------------------------- |
| `content-integrity.spec.ts` | Frontmatter validation, description length, slug uniqueness |
| `edge-cases.spec.ts`        | 404 handling, malformed URLs, edge inputs                   |
| `i18n.spec.ts`              | EN/ES routing, translated strings, locale switching         |
| `schema-validation.spec.ts` | JSON-LD schema correctness per page type                    |
| `tools.functional.spec.ts`  | Interactive tool input/output behavior                      |
| `ui-components.spec.ts`     | UI component rendering and prop validation                  |

---

### F3 — `src/components/apps/AGENTS.md`: tool count inconsistency

**File**: `src/components/apps/AGENTS.md`

**Problem**: Intro says "15 components" but the MDX content collection has 14 slugs.
`RegexFlavorTable` is a helper component embedded inside `RegexTester`, not a standalone
tool. The ambiguity will cause agents to generate incorrect `componentMap` entries or
wrong tool counts.

**Fix**: Change intro to "14 standalone tools + 1 internal helper component". Add a
`Helper` column or footnote to the component map table marking `RegexFlavorTable` as
`(internal — not registered in componentMap)`.

---

### F4 — `src/components/ui/AGENTS.md`: `Collapsible` prop name is ambiguous

**File**: `src/components/ui/AGENTS.md`

**Problem**: The props table shows `summary` / `title` as a combined entry, implying
both names work. Agents will guess which to use.

**Fix**: Check the actual component source and document the canonical prop name only.
If both are accepted as aliases, document the primary name and note the alias explicitly:
`summary` (alias: `title`).

---

### F5 — `src/components/ui/AGENTS.md`: `FallbackBanner` is missing

**File**: `src/components/ui/AGENTS.md`

**Problem**: `FallbackBanner.astro` exists in `src/components/ui/` but has no entry in
the quick reference. Agents creating content that needs a fallback notice will not know
this component exists.

**Fix**: Add a `FallbackBanner` entry under an appropriate section (Status & Version, or
a new "Banners" group) with its props table and a usage example.

---

### F6 — `.github/copilot-instructions.md` and `.github/instructions/astro-components.instructions.md`: missing `@i18n/*` alias

**Files**:

- `.github/copilot-instructions.md` (TypeScript section)
- `.github/instructions/astro-components.instructions.md` (Path Aliases section)

**Problem**: Both files list path aliases but omit `@i18n/*`, which is used in nearly
every component for `getLangFromUrl` and `useTranslations`. Agents will write incorrect
import paths.

**Fix**: Add `@i18n/* → src/i18n/*` to both alias lists. Also verify whether `@data/*`
and `@languages/*` are present in both files and add if missing.

---

### F7 — `CLAUDE.md`: version stamp

**File**: `CLAUDE.md`

**Problem**: Header says "Last verified: March 2026 (Astro 6.1.2, UnoCSS 66.6.7)".
Current `package.json` shows `unocss: ^66.6.7` and `preact: ^10.29.0`. The stamp is
accurate for the pinned versions but the date will drift.

**Fix**: Replace the static date with a note to check `package.json` for current
versions, or automate the stamp update as part of the release process. At minimum,
update the preact version in the tech stack table from `^10.28.3` to `^10.29.0`.

---

### F8 — `CLAUDE.md`: test suite count

**File**: `CLAUDE.md`

**Problem**: Project structure comment says "12 Playwright test suites + utils". The
actual count is 17 spec files.

**Fix**: Update to "17 Playwright test suites + utils".

---

## Additions (new files to create)

### A1 — Create `.claude/skills/i18n/SKILL.md`

**Why**: The i18n system is the most complex recurring task not covered by a skill.
Agents adding translations, fixing missing keys, or adding a new locale have no guided
workflow. The `docs/I18N_GUIDE.md` exists but is not surfaced as an invocable skill.

**Frontmatter**:

```yaml
name: i18n
description: Add or update translations for the EN/ES bilingual system. Use when asked about translations, missing keys, locale routing, or adding a new language.
argument-hint: "[action: add-key|fix-missing|audit|new-locale]"
```

**Content to include**:

- Translation file locations: `src/i18n/translations/{en,es}/{common,tools}.ts`
- The `t()` pattern with import snippet
- Interpolation syntax: `t("key", { param: value })` with `{param}` in string
- How to inject translations into `<script is:inline>` via `data-*` attributes (the
  non-obvious part agents get wrong)
- `formatDate()`, `formatNumber()`, `pluralize()` from `@i18n/utils`
- `useTranslatedPath(locale)` for localized URLs
- How to audit for missing keys: grep for hardcoded English strings in `.astro` files
- Command to run i18n tests: `pnpm test:e2e tests/i18n.spec.ts`
- Link to `docs/I18N_GUIDE.md` for full reference

---

### A2 — Create `.claude/skills/new-blog-post/SKILL.md`

**Why**: Writing a blog post is the most frequent content task. A Copilot prompt exists
(`.github/prompts/new-blog-post.prompt.md`) but there is no Claude skill. The workflow
has several non-obvious steps (number lookup, description length enforcement, draft flag,
component imports) that benefit from a skill.

**Frontmatter**:

```yaml
name: new-blog-post
description: Scaffold and write a new MDX blog post. Use when asked to create a blog post, write an article, or add content to the posts collection.
argument-hint: "[topic] [tags]"
```

**Content to include**:

- How to determine the next file number (check `src/content/posts/` for highest `NNN-`)
- Full frontmatter template with all fields and constraints
- `description` ≤ 155 chars — enforced by `tests/content-integrity.spec.ts`
- Heading hierarchy rule (h1 auto from title → h2 → h3)
- Which components to import for common patterns (TLDRSummary, Callout, Code, Mermaid)
- Draft workflow: set `draft: true` until ready, then remove or set `false`
- Verification: `pnpm test:e2e tests/content-integrity.spec.ts` to check constraints
- Reference to `src/components/ui/AGENTS.md` for component usage
- Reference to `docs/BLOG_POST_GUIDE.md` for full guide

---

### A3 — Create `.claude/skills/new-component/SKILL.md`

**Why**: Adding a UI component requires touching multiple files (the `.astro` file,
`AGENTS.md`, `README.md`, and potentially barrel exports). A Copilot prompt exists but
no Claude skill. The accessibility and i18n requirements are easy to miss.

**Frontmatter**:

```yaml
name: new-component
description: Create a new reusable Astro UI component in src/components/ui/. Use when asked to add a component, build a UI element, or extend the component library.
argument-hint: "[component-name] [description]"
```

**Content to include**:

- File location: `src/components/ui/ComponentName.astro`
- Required structure: Props interface → unique ID generation → template → scoped style
- Accessibility checklist: `aria-labelledby`, keyboard access, focus-visible, ARIA roles
- i18n: use `t()` for all user-facing text, never hardcode English
- CSS: use custom properties from `src/styles/global.css`, no inline styles
- After creation: add entry to `src/components/ui/AGENTS.md` (required)
- After creation: add entry to `src/components/ui/README.md` (required)
- If component needs barrel export: update or create `src/components/ui/barrel-name.ts`
- Verification: `pnpm typecheck && pnpm lint && pnpm test:e2e tests/ui-components.spec.ts`

---

### A4 — Create root `AGENTS.md`

**Why**: `AGENTS.md` at the repo root is the conventional entry point for agent context
(used by Ona/Gitpod, some GitHub tooling, and generic agents). Currently only `CLAUDE.md`
exists. Agents from platforms that look for `AGENTS.md` get no context.

**Approach**: Create a lean `AGENTS.md` that is a navigation index, not a duplicate of
`CLAUDE.md`. It should:

- State the project in 2–3 sentences
- List the 7 core principles (already in CLAUDE.md)
- Point to the authoritative files for each concern:

```markdown
| Need                 | File                                        |
| -------------------- | ------------------------------------------- |
| Full project context | CLAUDE.md                                   |
| UI component usage   | src/components/ui/AGENTS.md                 |
| Interactive tools    | src/components/apps/AGENTS.md               |
| Build & verify       | .claude/skills/astro-build/SKILL.md         |
| Accessibility audit  | .claude/skills/accessibility-audit/SKILL.md |
| CSP/SRI debugging    | .claude/skills/csp-debug/SKILL.md           |
| i18n / translations  | .claude/skills/i18n/SKILL.md                |
| Blog post workflow   | .claude/skills/new-blog-post/SKILL.md       |
| New component        | .claude/skills/new-component/SKILL.md       |
| Coding conventions   | .github/copilot-instructions.md             |
| Blog writing guide   | docs/BLOG_POST_GUIDE.md                     |
| Accessibility guide  | docs/ACCESSIBILITY_GUIDE.md                 |
| i18n guide           | docs/I18N_GUIDE.md                          |
```

- List the anti-patterns (already in CLAUDE.md §Anti-Patterns) — these are the most
  important single thing for an agent to know before touching any file.

**Keep it under 100 lines.** The goal is fast orientation, not duplication.

---

### A5 — Create `.github/instructions/i18n.instructions.md`

**Why**: There are path-scoped instructions for components, blog content, testing, and
tools, but nothing for `src/i18n/**`. Agents editing translation files get no guidance.

**Frontmatter**:

```yaml
applyTo: "src/i18n/**/*.ts"
```

**Content**: Mirror the i18n section from `.claude/rules/astro-components.md` plus:

- File structure: `translations/{en,es}/{common,tools}.ts`
- Key naming convention (dot-notation, section prefix: `nav.`, `ui.`, `aria.`, `tools.`)
- Both locales must be updated together — never add a key to one without the other
- Client-side injection pattern for `<script is:inline>` blocks
- How to run the i18n test suite: `pnpm test:e2e tests/i18n.spec.ts`

---

### A6 — Document environment variables in `CLAUDE.md`

**Why**: Five env vars are referenced across skills and CLAUDE.md but there is no single
reference listing all of them. Agents setting up the project or debugging CI failures
have to grep for them.

**Fix**: Add an "Environment Variables" section to `CLAUDE.md` (or a dedicated
`docs/ENV_VARS.md` linked from CLAUDE.md):

| Variable                 | Required        | Used by                           | Purpose                           |
| ------------------------ | --------------- | --------------------------------- | --------------------------------- |
| `PUBLIC_CF_BEACON_TOKEN` | Production only | `BaseHead.astro`                  | Cloudflare Web Analytics          |
| `SONAR_TOKEN`            | CI only         | `pnpm verify` steps 12–13         | SonarCloud authentication         |
| `SONAR_PROJECT_KEY`      | CI only         | `scripts/ci/get-sonar-issues.mjs` | SonarCloud project identifier     |
| `TELEGRAM_BOT_TOKEN`     | Optional        | `scripts/csp-reporter.mjs`        | CSP violation notifications       |
| `TELEGRAM_CHAT_ID`       | Optional        | `scripts/csp-reporter.mjs`        | CSP violation notification target |

---

## Priority order

| Priority | Item                                     | Effort | Impact                                    |
| -------- | ---------------------------------------- | ------ | ----------------------------------------- |
| 1        | F2 — Fix run-tests suite count           | Low    | High — agents run wrong test commands     |
| 2        | F3 — Fix apps/AGENTS.md tool count       | Low    | Medium — confuses tool registration       |
| 3        | F1 — Fix CONTRIBUTING.md pipeline        | Low    | Medium — misleads contributors            |
| 4        | F5 — Add FallbackBanner to ui/AGENTS.md  | Low    | Medium — component is invisible to agents |
| 5        | F6 — Add `@i18n/*` alias to instructions | Low    | High — used in every component            |
| 6        | A4 — Create root AGENTS.md               | Low    | High — platform compatibility             |
| 7        | A1 — Create i18n skill                   | Medium | High — most complex unguided workflow     |
| 8        | A2 — Create new-blog-post skill          | Medium | Medium — frequent task                    |
| 9        | A3 — Create new-component skill          | Medium | Medium — multi-file workflow              |
| 10       | A5 — Create i18n instructions file       | Low    | Medium — path-scoped guidance gap         |
| 11       | A6 — Document env vars                   | Low    | Medium — setup and CI debugging           |
| 12       | F4 — Fix Collapsible prop ambiguity      | Low    | Low — minor confusion                     |
| 13       | F7 — Update CLAUDE.md version stamp      | Low    | Low — cosmetic accuracy                   |
| 14       | F8 — Update CLAUDE.md test count         | Low    | Low — cosmetic accuracy                   |
