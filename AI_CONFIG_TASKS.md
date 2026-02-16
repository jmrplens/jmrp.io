# Hoja de Tareas — Configuración AI para jmrp.io

> **Fecha**: Febrero 2026
> **Alcance**: VS Code (Copilot), Copilot CLI, Claude Code, GitHub Coding Agent
> **Fuentes**: docs.github.com, code.visualstudio.com, code.claude.com, agentskills.io

---

## Estado Actual del Proyecto

| Componente | Estado | Ubicación |
|---|---|---|
| `CLAUDE.md` | ✅ Existe (~833 líneas) | `/CLAUDE.md` |
| `GEMINI.md` | ✅ Existe | `/GEMINI.md` |
| `copilot-instructions.md` | ✅ Existe | `.github/copilot-instructions.md` |
| `AGENTS.md` (UI components) | ✅ Existe | `src/components/ui/AGENTS.md` |
| Instructions (4 archivos) | ✅ Con `applyTo` | `.github/instructions/*.instructions.md` |
| Prompts (5 archivos) | ✅ Con `argument-hint` | `.github/prompts/*.prompt.md` |
| Agents (3 archivos) | ✅ Planner con `handoffs` | `.github/agents/*.agent.md` |
| Skills (3 archivos) | ✅ astro-build, accessibility-audit, csp-debug | `.github/skills/*/SKILL.md` |
| `.vscode/settings.json` | ✅ 5 settings AI + SonarLint | `.vscode/settings.json` |
| Claude Code config (`.claude/`) | ✅ settings, skills, rules | `.claude/` |
| Hooks (`.github/hooks/`) | ✅ auto-format, protect-files | `.github/hooks/*.json` |
| MCP servers | ⬜ No necesario actualmente | — |

---

## SECCIÓN 1: VS Code — Copilot Settings

### Tarea 1.1: Configurar settings de VS Code para AI
**Prioridad**: 🔴 Alta
**Estado**: Por hacer

Añadir a `.vscode/settings.json` (o al workspace file):

```jsonc
{
  // Habilitar CLAUDE.md como fuente de instrucciones
  "chat.useClaudeMdFile": true,

  // Habilitar AGENTS.md en subdirectorios (e.g. src/components/ui/AGENTS.md)
  "chat.useAgentsMdFile": true,

  // EXPERIMENTAL: AGENTS.md anidados en subdirectorios
  "chat.useNestedAgentsMdFiles": true,

  // Ubicaciones adicionales de archivos de agentes (por defecto ya busca en .github/agents/)
  // "chat.agentFilesLocations": [".github/agents"],

  // Ubicaciones adicionales de skills
  // "chat.agentSkillsLocations": [".github/skills"],

  // Ubicaciones adicionales de prompts
  // "chat.promptFilesLocations": [".github/prompts"],

  // Ubicaciones adicionales de instrucciones
  // "chat.instructionsFilesLocations": [".github/instructions"],

  // Sugerencias de prompts al abrir chat
  "chat.promptFilesRecommendations": true
}
```

**Acción**: Verificar que los defaults ya cubren `.github/` como ubicación. Si no, descomentar las líneas.

---

### Tarea 1.2: Worksheet settings vs `.vscode/settings.json`
**Prioridad**: 🟡 Media
**Estado**: Por hacer

El archivo `jmrp.io_astro.code-workspace` tiene `"settings": {}` vacío. Decidir si mover los settings de Copilot/AI aquí para que se apliquen al abrir el workspace.

---

## SECCIÓN 2: Agents — Mejoras

### Tarea 2.1: Añadir campo `model` a los agents
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Los tres agents actuales no especifican modelo. Considerar:

```yaml
# planner.agent.md — modelo rápido, solo lectura
model: sonnet

# implementer.agent.md — modelo capaz para código
model: sonnet

# reviewer.agent.md — modelo para análisis profundo
model: sonnet
```

**Nota**: Solo aplica en VS Code. En Claude Code se usa `model: sonnet|opus|haiku|inherit`.

---

### Tarea 2.2: Añadir `handoffs` al reviewer y al implementer
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Actualmente solo `planner` tiene handoffs → `implementer`. Completar el ciclo:

```yaml
# implementer.agent.md — añadir:
handoffs:
  - label: Request Review
    agent: reviewer
    prompt: Review the implementation above for accessibility, security, and convention compliance.

# reviewer.agent.md — añadir:
handoffs:
  - label: Fix Issues
    agent: implementer
    prompt: Fix the issues found in the review above.
```

---

### Tarea 2.3: Añadir `user-invokable` y `disable-model-invocation` donde corresponda
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Evaluar si algún agent debe ser solo manual o solo automático:
- `planner`: `user-invokable: true` (default, OK)
- `implementer`: `user-invokable: true` (default, OK)
- `reviewer`: `user-invokable: true` (default, OK)

**Decisión**: Probablemente no hace falta cambiar nada salvo si se quiere que el reviewer se autoinvoque al detectar cambios.

---

### Tarea 2.4: Crear aliases de agents para Claude Code
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Claude Code busca subagents en `.claude/agents/`. Opciones:
1. **Symlinks**: `.claude/agents/` → `.github/agents/` (requiere adaptar el frontmatter)
2. **Duplicar** con formato Claude Code (name, description, tools, model como frontmatter YAML)
3. **No hacer nada**: VS Code con Copilot lee `.github/agents/`, Claude Code tiene su propio formato

**Nota**: VS Code Copilot lee AMBOS: `.github/agents/` y `.claude/agents/`. Claude Code solo lee `.claude/agents/`.

**Recomendación**: Crear `.claude/agents/` con el formato de Claude Code si se usa Claude Code en terminal. Los campos son diferentes (Claude usa `tools: Read, Grep, Bash`; Copilot usa `tools: search, codebase, editFiles`).

---

## SECCIÓN 3: Skills — Mejoras

### Tarea 3.1: Añadir `argument-hint` a las skills
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

```yaml
# astro-build/SKILL.md
argument-hint: "[command: build|verify|preview|dev]"

# accessibility-audit/SKILL.md
argument-hint: "[suite: all|axe|deep|keyboard|tabs]"
```

---

### Tarea 3.2: Añadir `disable-model-invocation` a astro-build
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

El skill `astro-build` ejecuta comandos que modifican el sistema (build, deploy). Debería ser solo invocación manual:

```yaml
disable-model-invocation: true
```

---

### Tarea 3.3: Evaluar skills adicionales
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Skills candidatas basadas en el proyecto:

| Skill | Descripción | Prioridad |
|---|---|---|
| `verify-icons` | Verificar consistencia de iconos UnoCSS | Media |
| `deploy` | Ejecutar deploy completo (build + CSP + Nginx + Cloudflare) | Media |
| `new-post-setup` | Setup de nuevo blog post desde template | Baja |
| `csp-debug` | Depurar problemas de CSP/SRI | Alta |

---

### Tarea 3.4: Crear skills compatibles con Claude Code
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Claude Code busca skills en `.claude/skills/`. Mismo directorio soportado por VS Code Copilot.

**Opción**: Mover las skills de `.github/skills/` a `.claude/skills/` para compatibilidad cruzada, y configurar VS Code para también buscar ahí via `chat.agentSkillsLocations`.

**Alternativa**: Mantener en `.github/skills/` y configurar Claude Code con `--add-dir` o via settings.

---

## SECCIÓN 4: Instructions — Mejoras

### Tarea 4.1: Evaluar `excludeAgent` en instructions
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

El frontmatter de `.instructions.md` soporta `excludeAgent`:

```yaml
# testing.instructions.md — excluir del coding agent de GitHub (no relevante para CI automatizado)
excludeAgent: coding-agent
```

**Evaluar**: ¿Alguna instrucción debe excluirse del `code-review` agent de GitHub o del `coding-agent`?

---

### Tarea 4.2: Crear `.claude/rules/` como alternativa para Claude Code
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Claude Code usa `.claude/rules/*.md` con soporte de `paths` frontmatter (equivalente a `applyTo`).

**Opción A**: Crear symlinks desde `.claude/rules/` a `.github/instructions/` (requiere adaptar frontmatter de `applyTo` a `paths`)
**Opción B**: Crear archivos separados en `.claude/rules/` con el formato correcto
**Opción C**: No hacer nada — Claude Code lee `CLAUDE.md` que ya contiene toda la info

**Formato Claude Code rules**:
```yaml
---
paths:
  - "src/components/**/*.astro"
  - "src/layouts/**/*.astro"
---
# Instrucciones de componentes Astro...
```

---

## SECCIÓN 5: Claude Code — Configuración Dedicada

### Tarea 5.1: Crear `.claude/settings.json`
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Configuración compartible con el equipo (commit a git):

```jsonc
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(pnpm build)",
      "Bash(pnpm verify)",
      "Bash(pnpm dev)",
      "Bash(pnpm preview)",
      "Bash(pnpm test:e2e *)",
      "Bash(pnpm typecheck *)",
      "Bash(pnpm lint *)",
      "Bash(pnpm lint:css)",
      "Bash(pnpm lint:html)",
      "Bash(pnpm exec prettier *)",
      "Bash(pnpm exec typos)",
      "Bash(node scripts/*)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git status *)",
      "Bash(git add *)",
      "Bash(git commit *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Bash(rm -rf *)",
      "Bash(curl *)",
      "Bash(wget *)"
    ]
  }
}
```

---

### Tarea 5.2: Crear `CLAUDE.local.md`
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Archivo local (auto-gitignored por Claude Code) para preferencias personales:

```markdown
# Preferencias personales (no compartidas)
- Preferir respuestas en español
- Usar pnpm, nunca npm ni yarn
```

**Nota**: `.gitignore` ya incluye `.claude/`. El `CLAUDE.local.md` va en la raíz del proyecto.

---

### Tarea 5.3: Crear `.claude/CLAUDE.md` vs raíz
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Actualmente `CLAUDE.md` está en la raíz. Claude Code soporta ambas ubicaciones:
- `./CLAUDE.md` ✅ (actual)
- `./.claude/CLAUDE.md`

**Recomendación**: Mantener en la raíz. Es más visible y funciona tanto con VS Code como con Claude Code.

---

## SECCIÓN 6: Hooks — Nueva Funcionalidad

### Tarea 6.1: Evaluar hooks para automatización
**Prioridad**: 🔴 Alta
**Estado**: Por hacer

**Hooks son compatibles con**: VS Code Copilot Y Claude Code (misma configuración JSON)

**Ubicación**: `.github/hooks/*.json` (VS Code) o `.claude/settings.json` → `hooks` (Claude Code)

Hooks candidatos para este proyecto:

#### 6.1.1 — PostToolUse: Auto-format después de editar archivos
```jsonc
// .claude/settings.json o .github/hooks/auto-format.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "prettier --write \"$(echo $TOOL_INPUT | jq -r '.file_path')\"",
            "async": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

#### 6.1.2 — PreToolUse: Bloquear escritura en archivos protegidos
```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/protect-files.sh"
          }
        ]
      }
    ]
  }
}
```

Archivos a proteger: `pnpm-lock.yaml`, `dist/`, `playwright-report/`, `.env*`

#### 6.1.3 — Stop: Verificar que el código compila antes de parar
```jsonc
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if the conversation involved code changes. If it did, verify that the user was informed about running `pnpm typecheck` and `pnpm lint`. If code was changed but no verification was mentioned, respond with {\"ok\": false, \"reason\": \"Remind the user to run pnpm typecheck and pnpm lint to verify the changes\"}. Otherwise respond with {\"ok\": true}. Context: $ARGUMENTS"
          }
        ]
      }
    ]
  }
}
```

#### 6.1.4 — SessionStart: Inyectar contexto de desarrollo
```jsonc
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"Branch: '\"$(git branch --show-current)\"', Last commit: '\"$(git log --oneline -1)\"'\"}'"
          }
        ]
      }
    ]
  }
}
```

**Decisión requerida**: ¿Implementar hooks en `.claude/settings.json` (solo Claude Code) o `.github/hooks/` (solo VS Code) o ambos?

---

### Tarea 6.2: Crear directorio y scripts de hooks
**Prioridad**: 🟡 Media (depende de 6.1)
**Estado**: Por hacer

```
.claude/hooks/
├── protect-files.sh       # Bloquea escritura en archivos protegidos
├── auto-lint.sh           # Ejecuta lint después de editar
└── validate-imports.sh    # Verifica orden de imports
```

---

## SECCIÓN 7: Prompts — Mejoras

### Tarea 7.1: Añadir campo `agent` a prompts relevantes
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Los prompts pueden referenciar un agent específico:

```yaml
# prepare-pr.prompt.md — ejecutar con el reviewer
agent: reviewer

# new-blog-post.prompt.md — ejecutar con el implementer
agent: implementer
```

---

### Tarea 7.2: Añadir campo `model` a prompts que lo requieran
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

```yaml
# prepare-pr.prompt.md — necesita modelo capaz para análisis
model: sonnet

# run-tests.prompt.md — cualquier modelo, ejecuta comandos
# (sin model = usa el default del usuario)
```

---

## SECCIÓN 8: AGENTS.md — Mejoras

### Tarea 8.1: Evaluar AGENTS.md en más subdirectorios
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Actualmente solo existe `src/components/ui/AGENTS.md`. Directorios candidatos:

| Directorio | ¿Necesita AGENTS.md? | Razón |
|---|---|---|
| `src/components/apps/` | ✅ Sí | 14 tools complejas con reglas estrictas |  
| `src/components/homelab/` | 🟡 Quizás | Preact islands, reglas diferentes |
| `tests/` | 🟡 Quizás | Estructura de tests, utils, config |
| `scripts/` | 🟢 No urgente | Scripts de CI/dev, bien documentados en CLAUDE.md |
| `src/integrations/` | 🟡 Quizás | Pre-build y post-build, pipeline compleja |

**Nota**: Con `chat.useNestedAgentsMdFiles` habilitado, VS Code carga automáticamente `AGENTS.md` de subdirectorios cuando se navegan archivos ahí.

---

## SECCIÓN 9: Compatibilidad Claude Code ↔ VS Code

### Tarea 9.1: Matriz de compatibilidad cruzada
**Prioridad**: 🟡 Media — Informativa
**Estado**: Referencia

| Archivo | VS Code Copilot | Claude Code CLI | GitHub Coding Agent |
|---|---|---|---|
| `CLAUDE.md` | ✅ (setting) | ✅ Nativo | ✅ |
| `GEMINI.md` | ✅ (setting) | ❌ | ❌ |
| `.github/copilot-instructions.md` | ✅ Nativo | ❌ | ✅ |
| `.github/instructions/*.md` | ✅ Nativo | ❌ (usar `.claude/rules/`) | ✅ |
| `.github/agents/*.agent.md` | ✅ Nativo | ❌ (usar `.claude/agents/`) | ✅ |
| `.github/skills/*/SKILL.md` | ✅ Nativo | ❌ (usar `.claude/skills/`) | ❌ |
| `.github/prompts/*.prompt.md` | ✅ Nativo | ❌ | ✅ |
| `.github/hooks/*.json` | ✅ Nativo | ❌ (usar `.claude/settings.json` → `hooks`) | ❌ |
| `.claude/settings.json` | ❌ | ✅ Nativo | ❌ |
| `.claude/agents/` | ✅ (setting) | ✅ Nativo | ❌ |
| `.claude/skills/` | ✅ (setting) | ✅ Nativo | ❌ |
| `.claude/rules/` | ❌ | ✅ Nativo | ❌ |
| `src/**/AGENTS.md` | ✅ (setting) | ❌ | ❌ |
| `CLAUDE.local.md` | ✅ (setting) | ✅ Nativo (gitignored) | ❌ |

---

### Tarea 9.2: Decidir estrategia de compatibilidad
**Prioridad**: 🔴 Alta
**Estado**: Por hacer

**Opciones**:

**A — Solo VS Code + GitHub** (mínimo esfuerzo):
- Mantener todo en `.github/` como está
- Configurar `.vscode/settings.json` para habilitar `chat.useClaudeMdFile`
- No crear nada en `.claude/`

**B — Dual VS Code + Claude Code** (máxima compatibilidad):
- Mantener `.github/` para VS Code/GitHub
- Crear `.claude/` con: `settings.json`, `agents/`, `skills/`, `rules/`
- Duplicar configuración en ambos formatos
- Configurar `.vscode/settings.json` para buscar en ambas ubicaciones

**C — Claude Code principal** (si es la herramienta principal):
- Mover skills a `.claude/skills/` y configurar VS Code con `chat.agentSkillsLocations`
- Crear `.claude/agents/` con formato Claude Code
- Crear `.claude/rules/` con path scoping
- Mantener `.github/` para GitHub Coding Agent

**Recomendación**: **Opción A** si solo usas VS Code. **Opción B** si usas ambos regularmente.

---

## SECCIÓN 10: GitHub Coding Agent

### Tarea 10.1: Verificar configuración para GitHub Coding Agent
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

El GitHub Coding Agent (cloud) lee:
- `.github/copilot-instructions.md` ✅
- `.github/instructions/*.md` con `applyTo` ✅
- `CLAUDE.md` ✅
- `.github/agents/*.agent.md` (los puede usar como referencia)

**Acción**: No se necesita configuración adicional. El proyecto ya está preparado.

**Nota**: El Coding Agent puede auto-generar un `copilot-instructions.md` si no existe (comando `/init`). El proyecto ya lo tiene.

---

## SECCIÓN 11: MCP Servers

### Tarea 11.1: Evaluar MCP servers útiles para el proyecto
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

MCP (Model Context Protocol) servers dan herramientas adicionales a los AI agents. Candidatos:

| Server | Uso | Prioridad |
|---|---|---|
| `@anthropic-ai/mcp-server-github` | Gestión de issues/PRs desde el agent | Baja |
| `@anthropic-ai/mcp-server-filesystem` | Acceso a archivos fuera del workspace | Baja |
| Custom MCP para homelab | Stats en tiempo real para el agente | Baja |

**Nota**: VS Code ya tiene MCP integrado a través de la configuración de settings. Claude Code usa `.mcp.json` en la raíz del proyecto.

---

## SECCIÓN 12: Documentación de AI Context

### Tarea 12.1: Actualizar CLAUDE.md con nueva sección de configuración AI
**Prioridad**: 🟡 Media
**Estado**: Por hacer

Añadir sección "AI Configuration" con:
- Lista completa de archivos de configuración AI y sus propósitos
- Instrucciones para contribuidores sobre cómo añadir/modificar AI context
- Referencia a este documento de tareas

---

### Tarea 12.2: Actualizar `AI_CONTEXT_ROADMAP.md`
**Prioridad**: 🟢 Baja
**Estado**: Por hacer

Sincronizar con las tareas de esta lista. Marcar como completadas las fases anteriores y añadir nuevas.

---

## Checklist de Progreso

### 🔴 Alta (hacer primero)
- [x] **1.1** — Configurar `.vscode/settings.json` con settings de AI
- [x] **6.1** — Evaluar y decidir hooks a implementar
- [x] **9.2** — Decidir estrategia de compatibilidad VS Code ↔ Claude Code → **Opción B (Dual)**

### 🟡 Media (hacer después)
- [x] **2.1** — Añadir `model` a agents
- [x] **2.2** — Completar `handoffs` en agents
- [x] **2.4** — ~~Crear agents formato Claude Code en `.claude/agents/`~~ → Revertido: causa agentes duplicados en VS Code. Agents solo en `.github/agents/`
- [x] **3.3** — Evaluar skills adicionales → Creada skill `csp-debug` en `.github/skills/` y `.claude/skills/`
- [x] **3.4** — Crear skills compatibles con Claude Code
- [x] **4.2** — Crear `.claude/rules/` para Claude Code
- [x] **5.1** — Crear `.claude/settings.json`
- [x] **6.2** — Crear scripts de hooks
- [x] **8.1** — AGENTS.md en más subdirectorios → Creado `src/components/apps/AGENTS.md`
- [x] **12.1** — Actualizar CLAUDE.md

### 🟢 Baja (nice to have)
- [x] **1.2** — Workspace settings vs .vscode/settings.json → `.vscode/settings.json` es la ubicación correcta ✅
- [x] **2.3** — `user-invokable` / `disable-model-invocation` en agents → Defaults correctos, sin cambios ✅
- [x] **3.1** — `argument-hint` en skills
- [x] **3.2** — `disable-model-invocation` en astro-build
- [x] **4.1** — `excludeAgent` en instructions → Ninguna lo necesita ✅
- [x] **5.2** — Crear `CLAUDE.local.md`
- [x] **5.3** — Ubicación de CLAUDE.md → Mantener en raíz ✅
- [x] **7.1** — Campo `agent` en prompts
- [x] **7.2** — Campo `model` en prompts → Innecesario, agents ya especifican modelo ✅
- [x] **10.1** — Verificar GitHub Coding Agent → Ya configurado ✅
- [x] **11.1** — Evaluar MCP servers → No necesarios actualmente ✅
- [x] **12.2** — Actualizar AI_CONTEXT_ROADMAP.md → v4 añadida ✅

**✅ 25/25 tareas completadas**

---

## Notas de Investigación

### Fuentes Consultadas
- [GitHub Docs — Repository Instructions](https://docs.github.com/en/copilot/customizing-copilot/adding-repository-instructions-for-github-copilot)
- [VS Code — Copilot Customization](https://code.visualstudio.com/docs/copilot/copilot-customization)
- [VS Code — Custom Agents](https://code.visualstudio.com/docs/copilot/copilot-customization/custom-agents)
- [VS Code — Agent Skills](https://code.visualstudio.com/docs/copilot/copilot-customization/agent-skills)
- [VS Code — Prompt Files](https://code.visualstudio.com/docs/copilot/copilot-customization/prompt-files)
- [VS Code — Hooks](https://code.visualstudio.com/docs/copilot/copilot-customization/hooks)
- [VS Code — Custom Instructions](https://code.visualstudio.com/docs/copilot/copilot-customization/custom-instructions)
- [Claude Code — Settings](https://code.claude.com/docs/en/settings)
- [Claude Code — Memory](https://code.claude.com/docs/en/memory)
- [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code — Skills](https://code.claude.com/docs/en/skills)
- [Claude Code — Hooks Reference](https://code.claude.com/docs/en/hooks)
- [Agent Skills Open Standard](https://agentskills.io/)

### Funcionalidades Nuevas Descubiertas (no existían en la fase anterior)
1. **Hooks** — 14 eventos de lifecycle (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, SubagentStart, SubagentStop, Stop, TeammateIdle, TaskCompleted, PreCompact, SessionEnd)
2. **Prompt hooks (`type: "prompt"`)** — LLM evalúa condiciones
3. **Agent hooks (`type: "agent"`)** — Subagent multi-turn verifica condiciones
4. **Async hooks** — `"async": true` para hooks que no bloquean
5. **Claude Code Plugins** — Sistema de marketplace para extensiones
6. **Agent Teams** — Múltiples agents coordinados en paralelo
7. **Persistent Memory** en subagents — `memory: user|project|local`
8. **CLAUDE.md imports** — `@path/to/file` importa otros archivos
9. **`.claude/rules/` con `paths`** — Reglas condicionales por glob
10. **Skill `context: fork`** — Ejecutar skill en subagent aislado
11. **Skill dynamic context** — `!`command`` ejecuta comandos antes del prompt
