# CHANGELOG — Implementación de la revisión de diseño (P1–P9)

Rama `redesign/lab-system`. Un commit por P. Verificado con `astro check` + build +
axe-core (claro y oscuro) en las páginas afectadas; red de seguridad final con
`pnpm verify` (suite axe completa). **axe-core: 0 violaciones** en todas las páginas
tocadas, en ambos temas.

Restricciones DURAS respetadas: WCAG 2.2 AA (claro+oscuro), cero JS de cliente (solo
las islas ya existentes), oscuro por defecto, CLS 0, EN/ES, CSP con nonce, `tokens.css`
como fuente de verdad. Fuera de alcance (no tocado): diagramas embebidos y copys de posts.

| P   | Estado     | Commit                                | Archivos                                                                            |
| --- | ---------- | ------------------------------------- | ----------------------------------------------------------------------------------- |
| P1  | ✅         | `fix(a11y): harden faint token…`      | `src/styles/tokens.css`, `src/components/layout/NavDrawer.astro`                    |
| P2  | ✅         | `fix(home): group date·title·tag…`    | `src/components/pages/HomePage.astro`                                               |
| P3  | ✅         | `fix(tools): subnet result styles…`   | `src/components/apps/SubnetCalculator.astro`                                        |
| P4  | ✅         | `fix(about): real avatar + copy…`     | `src/components/pages/AboutPage.astro`                                              |
| P5  | ✅         | `fix(publications): calm co-authors…` | `src/components/publications/PublicationItem.astro`                                 |
| P6  | ✅         | `fix(blog): collapse tag cloud…`      | `src/components/blog/TagCloud.astro`, `BlogTagPage.astro`, `i18n/{en,es}/common.ts` |
| P7  | ⚠️ parcial | `fix(homelab): …no-data KPI`          | `src/components/homelab/HomelabKpi.tsx`, `styles/components/homelab-components.css` |
| P8  | ✅         | (mismo commit que P7)                 | `src/styles/components/homelab-components.css`                                      |
| P9  | ✅         | `chore(blog): drop dead .page-header` | `src/styles/blog.css`                                                               |

## Detalle

- **P1 · a11y [GLOBAL].** `--color-text-faint` claro `#8c8b82` (3.3:1) → `#807f76`
  (≈4.0:1) en los dos bloques de claro. Añadidos alias de intención `--color-meta`
  (→`faint-alt`, siempre AA) y `--color-faint-lg` (→`faint`, solo texto grande). Los
  dos glyphs del árbol del NavDrawer pasan a `--color-meta`. Nota: las metas de tarjeta
  ya usaban `--color-text-muted` (AA), así que la exposición real era pequeña.

- **P2 · home.** La fila de últimas entradas usaba una columna de título `1fr` que
  empujaba el tag al borde derecho (río blanco). Título+tag agrupados en un flex; el tag
  vive junto al título.

- **P3 · tools.** _Causa raíz distinta a la del handoff:_ los resultados de Subnet se
  construyen en cliente con `createElement`, pero el `<style>` es Astro-scoped → las
  reglas `.net-result-*` nunca alcanzaban esos nodos (sin atributo `data-astro`), y se
  veían como lista plana «etiquetavalor». Fix: esas reglas pasan a `:global` (clases
  `net-*`, sin colisión) con el layout que pedía la revisión: rejilla 2 columnas
  `etiqueta · valor`, `column-gap` real, etiqueta en `--color-text-muted`, valor en
  `--color-text-heading`. **Alcance = solo Subnet:** HTTP Headers ya usaba `:global`
  (no afectado); Timestamp/Hash no tienen ese patrón.

- **P4 · about.** Slot «photo» vacío → avatar real de GitHub (`astro:assets` Image,
  dimensionado, sin CLS). Copy del hero diferenciado del de la home (titular + lead
  propios, EN+ES). **El copy nuevo es un primer borrador**, abierto a que lo ajustes.

- **P5 · publications.** Coautores en color de cuerpo con subrayado revelado al hover;
  autor propio en color de título + semibold (pista no-cromática). Acento reservado a
  las acciones (BibTeX/PDF/DOI). Verificado: axe `link-in-text-block` limpio en ambos temas.

- **P6 · blog.** `TagCloud` compartido: top ~12 tags visibles + `+N más` en `<details>`
  nativo (cero JS); prop `activeTag` marca el tag actual en las páginas de tag (y lo
  mantiene visible aunque caiga fuera del top). Los pills ocultos siguen en el DOM, así
  que el filtro cliente del índice los encuentra. Añadida clave i18n `blog.moreTopics`.

- **P8 · homelab (menor).** La rejilla de 5 nodos dejaba una tarjeta huérfana con hueco
  ancho (grid no centra una última fila incompleta cuando la fila 1 llena todas las
  columnas). `.node-grid` pasa a flex-wrap + `justify-content:center` con `max-width` de
  tarjeta → la fila incompleta se centra.

- **P7 · homelab (parcial, prioridad baja).** El em dash de «no data» del KPI se estiliza
  como estado intencional (`--color-meta`) en vez de parecer un valor roto. **Pendiente:**
  el cambio completo `—`/`...` → «sin datos» dentro de las islas Preact (NodeCards,
  InfrastructureInsights) requiere plumbing de i18n a través de los props de la isla, y
  ese estado vacío es un **artefacto de captura** (API gated por _referer_; en producción
  carga). Lo dejo documentado como pendiente menor, listo para un pase dedicado si lo quieres.

- **P9 · higiene.** Eliminadas las reglas globales muertas `.page-header` centradas de
  `blog.css` (cada consumidor —BlogIndex, BlogTagPage, ToolLayout— ya define su propio
  `.page-header` scoped alineado a la izquierda que las anulaba).

## Pendientes

- **P7 completo** (texto «sin datos» en las islas del homelab) — menor, artefacto de captura.
- El copy del hero de About (P4) es borrador — dime si quieres otro tono/titular.
