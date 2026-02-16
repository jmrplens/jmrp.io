# Hoja de Ruta — Archivos de Contexto AI para jmrp.io

> **Fecha**: 16 de febrero de 2026
> **Estado**: Completado (v4)

---

## Objetivo

Crear un sistema completo de archivos de contexto para que cualquier AI assistant (Claude, Copilot, Gemini, agentes personalizados) tenga contexto inicial completo del proyecto en cualquier conversación futura.

---

## v1 — Creación inicial ✅

### 1. CLAUDE.md (Reescritura completa) ✅

Archivo principal de contexto (~800 líneas) con:

- [x] Project Overview y Core Principles
- [x] Tech Stack completo con versiones verificadas
- [x] Estructura del proyecto detallada
- [x] Content Collections — TODAS las colecciones
- [x] Tools System — arquitectura completa
- [x] Layouts, BaseHead, JSON-LD Schema System
- [x] Utility Functions y Global Types
- [x] CSS Design Tokens completos
- [x] Integration Pipeline y CSP Strategy
- [x] Tests, Scripts, Routing, Config Files
- [x] Environment Variables
- [x] UnoCSS avanzado
- [x] Blog post writing guide + Anti-patterns

### 2. .github/copilot-instructions.md ✅

### 3. src/components/ui/AGENTS.md ✅

### 4. GEMINI.md ✅

### 5. .github/instructions/*.instructions.md ✅

### 6. Verificación final v1 ✅

---

## v2 — Auditoría y correcciones ✅

### Correcciones en CLAUDE.md ✅

- [x] Astro 6.0.0-beta.5 → 6.0.0-beta.11
- [x] MDX 5.0.0-beta.2 → 5.0.0-beta.7
- [x] Playwright ^1.58.1 → ^1.58.2
- [x] Mermaid ^11.12.2 → ^3.0.4 (mermaid-isomorphic)
- [x] MathJax ^4.0.0-beta.11 → rehype-mathjax ^7.1.0
- [x] Iconify 13 collections ^3.1.1 → 12 collections @iconify-json/*
- [x] Posts `description`: Required → Optional
- [x] Eliminar `references` del schema de posts (auto-collected)
- [x] Eliminar directorios fantasma: `common/`, `sections/`
- [x] Corregir orden post-build pipeline
- [x] Callout types: 5 → 8 (add info/error/success/keypoint)
- [x] StateNotice types: 4 → 6 (add mandatory/breaking)
- [x] YouTube prop: `videoId` → `id`
- [x] References: "Uses frontmatter" → "Auto-collected from content links"
- [x] CI scripts: 17 → 19
- [x] Añadir global-teardown.ts a tests
- [x] Añadir test utils: index.ts, types.ts
- [x] Eliminar `pnpm format` (no existe)
- [x] CSS tokens: añadir ~15 variables faltantes
- [x] Añadir docs/CSP_REPORTER.md a tabla de archivos AI
- [x] Añadir .github/prompts/ y copilot-setup-steps.yml a tabla

### Nuevos archivos ✅

- [x] `.github/copilot-setup-steps.yml` — Copilot Coding Agent setup
- [x] Verificar `.github/prompts/*.prompt.md` (ya existían 3)

### Mejoras Copilot ✅

- [x] Añadir `applyTo` frontmatter a 4 archivos .instructions.md
- [x] Añadir test utils faltantes en testing.instructions.md

### Correcciones en GEMINI.md ✅

- [x] Astro version: beta.5 → beta.11
- [x] Componentes: 37+ → 35+
- [x] Icon collections: añadir "(12 collections)"
- [x] Eliminar `pnpm format`
- [x] Añadir prompts y setup-steps a tabla de archivos

### Verificación final v2 ✅

- [x] Build exitoso
- [x] Prettier check OK

---

## v3 — Ecosistema completo de personalización AI ✅

### Investigación web ✅

- [x] Documentación VS Code: custom-instructions, prompt-files, custom-agents, agent-skills
- [x] Taxonomía completa: instructions → prompts → agents → skills → hooks → MCP

### Correcciones en CLAUDE.md ✅

- [x] Mermaid version: `^3.0.4` → `^11.12.2 / ^3.0.4` (mermaid + mermaid-isomorphic)
- [x] UI components: 37 → 35
- [x] CI scripts: 17 → 20
- [x] Dev scripts: 10 → 11
- [x] Eliminar `pnpm format` (no existe como script)
- [x] Añadir `pnpm exec prettier --check .` (format check)
- [x] Env vars: añadir `POSTBUILD_NGINX_RELOAD_TIMEOUT` y `POSTBUILD_NGINX_TEST_TIMEOUT`
- [x] Eliminar `copilot-setup-steps.yml` de tabla AI (no existe)
- [x] Añadir agents y skills a tabla AI Context Files

### Nuevos archivos .instructions.md ✅

- [x] Añadir frontmatter `applyTo` a `astro-components.instructions.md` → `src/components/**/*.astro`
- [x] Añadir frontmatter `applyTo` a `blog-content.instructions.md` → `src/content/posts/**/*.mdx`
- [x] Añadir frontmatter `applyTo` a `testing.instructions.md` → `tests/**/*.ts`
- [x] Añadir frontmatter `applyTo` a `tools.instructions.md` → `src/components/apps/**,src/content/tools/**,src/pages/tools/**`

### Prompt Files (`.github/prompts/`) ✅

- [x] `new-blog-post.prompt.md` — Scaffold nuevo blog post con frontmatter y estructura
- [x] `new-tool.prompt.md` — Scaffold nueva tool con MDX, componente y componentMap
- [x] `new-component.prompt.md` — Scaffold nuevo componente UI con Props y accessibility
- [x] `run-tests.prompt.md` — Ejecutar pipeline QA o suites específicas
- [x] `prepare-pr.prompt.md` — Verificación completa y commit convencional para PR

### Custom Agents (`.github/agents/`) ✅

- [x] `planner.agent.md` — Agente de planificación con herramientas read-only y handoff a implementer
- [x] `implementer.agent.md` — Agente de implementación con herramientas de edición
- [x] `reviewer.agent.md` — Agente de revisión de código (a11y, security, performance, conventions)

### Agent Skills (`.github/skills/`) ✅

- [x] `astro-build/SKILL.md` — Build, preview, QA pipeline, troubleshooting
- [x] `accessibility-audit/SKILL.md` — Auditoría WCAG 2.2 AA, suites de tests, componentes

### Actualización GEMINI.md ✅

- [x] Actualizar tabla de archivos AI con agents y skills
- [x] Eliminar `copilot-setup-steps.yml` de tabla

### Verificación final v3 ✅

- [x] Build exitoso: 53 páginas, 35.11s
- [x] Prettier check OK: "All matched files use Prettier code style!"
- [x] Archivos AI nuevos añadidos a `.prettierignore`

---

## v4 — Configuración AI avanzada + Corrección de duplicados ✅

### Investigación web (AI_CONFIG_TASKS.md) ✅

- [x] Investigación exhaustiva: 9 URLs de docs.github.com, code.visualstudio.com, code.claude.com
- [x] Creación de `AI_CONFIG_TASKS.md` con 25 tareas en 12 secciones

### VS Code Settings ✅

- [x] `.vscode/settings.json`: 5 settings AI (useClaudeMdFile, useAgentsMdFile, etc.)

### Agents mejorados ✅

- [x] `model: sonnet` en los 3 agents
- [x] `handoffs` completos: planner→implementer, implementer→reviewer, reviewer→implementer
- [x] ~~`.claude/agents/`~~ → Eliminado: causaba agentes duplicados en VS Code (lee ambos `.github/agents/` y `.claude/agents/`)

### Skills mejorados ✅

- [x] `argument-hint` en astro-build y accessibility-audit
- [x] `disable-model-invocation: true` en astro-build
- [x] Nueva skill: `csp-debug` (debug CSP/SRI issues) en `.github/skills/` y `.claude/skills/`

### Prompts mejorados ✅

- [x] `agent: implementer` en new-blog-post, new-tool, new-component
- [x] `agent: reviewer` en prepare-pr

### Claude Code (`.claude/`) ✅

- [x] `.claude/settings.json`: permissions (27 allow, 6 deny), PostToolUse hook (prettier)
- [x] `.claude/skills/`: astro-build, accessibility-audit, csp-debug
- [x] `.claude/rules/`: 4 reglas path-scoped (astro-components, blog-content, testing, tools)
- [x] `CLAUDE.local.md`: preferencias locales (gitignored)

### Hooks ✅

- [x] `.github/hooks/auto-format.json`: PostToolUse → prettier
- [x] `.github/hooks/protect-files.json`: PreToolUse → block edits to pnpm-lock, dist/, .env*

### AGENTS.md adicionales ✅

- [x] `src/components/apps/AGENTS.md`: 15 tool components, arquitectura, patrones, guía de registro

### Documentación ✅

- [x] CLAUDE.md: sección "AI Context Files" expandida (4 subsecciones + nota anti-duplicados)
- [x] AI_CONFIG_TASKS.md: checklist 25/25 completado
- [x] `.prettierignore`: añadidos nuevos archivos AI
- [x] `.gitignore`: selectivo para `.claude/` (commit settings, skills, rules; ignore local, memory)

### Tareas evaluadas sin cambios necesarios ✅

- [x] 2.3: `user-invokable`/`disable-model-invocation` — defaults correctos para los 3 agents
- [x] 4.1: `excludeAgent` — ninguna instruction lo necesita
- [x] 7.2: `model` en prompts — innecesario, los agents ya especifican modelo
- [x] 1.2: Workspace settings vs `.vscode/settings.json` — `.vscode/settings.json` es correcto
- [x] 11.1: MCP servers — no necesarios actualmente

### Verificación final v4 ✅

- [x] Agentes duplicados en VS Code: **corregido** (eliminado `.claude/agents/`)
- [x] Build y Prettier check: pendiente verificación
