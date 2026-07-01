# design-audit (temporary)

Capturas generadas de **todas las páginas** del sitio (posts, tools, listados,
homelab, CV, publicaciones, github, listado/tag de blog, 404 — en EN y ES),
para que el proyecto **design** de Claude audite la fidelidad visual sin depender
del dominio en vivo. **Excluye** las páginas aparcadas `/about`, `/uses`, `/now`.

Generado con `capture.mjs` contra el build actual (beta.jmrp.io = HEAD de la rama).

## Estructura

```
design-audit/
├── dark/   desktop/<pagina>-NN.jpg   mobile/<pagina>-NN.jpg
├── light/  desktop/<pagina>-NN.jpg   mobile/<pagina>-NN.jpg
├── html/<pagina>.html      # HTML renderizado (con islands hidratados)
└── capture.mjs             # script reproducible
```

- **Temas**: `dark/` y `light/` (ambos capturados).
- **Viewports**: `desktop` = 1600px de ancho; `mobile` = iPhone 17 Pro Max
  (440×956 CSS @3x).
- **Trozos**: cada página se corta en trozos numerados (`-01`, `-02`, …) de
  altura de viewport, así se ve toda la página sin escalar ni recortar.
- **Nombres**: la ruta con `/`→`-` (p.ej. `es-blog-tags-nginx`, `tools-csp-builder`,
  `blog-012-device-bound-key-derivation`); `home` y `es-home` para las portadas.

## Regenerar

```bash
node design-audit/capture.mjs            # usa beta.jmrp.io
AUDIT_BASE=http://localhost:4321 node design-audit/capture.mjs   # contra preview local
```

> Carpeta **temporal**: se elimina al cerrar el rediseño (y se quita de los
> ignores de prettier/eslint/cspell/lychee).
