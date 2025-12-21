### Propuesta de Optimización de Rendimiento (Lighthouse)

Basado en el análisis del reporte de Lighthouse (97/100), se identifican las siguientes áreas de mejora para alcanzar el 100%:

1. **Eliminar recursos que bloquean el renderizado**:
   - Actualmente `astro.config.mjs` tiene `inlineStylesheets: "never"`.
   - **Acción**: Cambiar a `inlineStylesheets: "auto"` o `"always"` para inyectar CSS crítico directamente en el HTML.

2. **Mejorar el Cumulative Layout Shift (CLS)**:
   - El CLS (0.092) es causado por la carga de fuentes web que desplazan el contenido.
   - **Acción**:
     - Revisar que se use `font-display: swap` en `src/styles/fonts.css`.
     - Añadir `<link rel="preload">` para las fuentes más críticas en `BaseHead.astro`.
     - Considerar el uso de "font metric overrides" para que la fuente de fallback ocupe el mismo espacio que la fuente final.

3. **Optimización de Imágenes**:
   - Aunque no es el problema principal en el reporte analizado, siempre es bueno asegurar que todas las imágenes tengan atributos `width` y `height` explícitos para reservar espacio.
