# Plan de Mejora del Proyecto (jmrp.io)

Este documento detalla los pasos para optimizar el proyecto siguiendo los estándares de Astro, TypeScript y buenas prácticas de desarrollo.

## 1. Configuración de Aliases de Ruta (Path Aliases) ✅

- [x] Configurar `tsconfig.json` con aliases para directorios clave.

- [x] Actualizar todos los `import` en el proyecto para usar los nuevos aliases (`@components/*`, `@assets/*`, etc.).

- **Resultado**: Código más limpio y mantenible.



## 2. Migración a Content Collections para Datos (YAML) 🟢 (En curso)

- [ ] Mover los archivos YAML de `src/data/` a `src/content/data/` (o configurar una colección de tipo 'data').
- [ ] Definir esquemas de validación con Zod en `src/content/config.ts`.
- [ ] Refactorizar componentes (`Header`, `Footer`, `CV`, etc.) para usar `getEntry` o `getCollection`.
- **Objetivo**: Eliminar el uso de `fs` y `js-yaml` en tiempo de ejecución, ganar tipado estático y validación automática.

## 3. Optimización de Imágenes con Astro Assets

- [ ] Identificar etiquetas `<img>` restantes y reemplazarlas por el componente `<Image />` de `astro:assets`.
- [ ] Revisar el uso de `getImage` en `BaseHead.astro` y `site.webmanifest.ts` para asegurar máxima eficiencia.
- **Objetivo**: Mejora de Core Web Vitals (LCP, CLS) mediante optimización automática de imágenes.

## 4. Refactorización de Tipos TypeScript (Eliminar `any`)

- [ ] Sustituir todos los usos de `any` por interfaces específicas o tipos generados por Content Collections.
- [ ] Asegurar que las props de los componentes estén debidamente tipadas.
- **Objetivo**: Robustez del código y mejores sugerencias en el IDE.

## 5. Gestión de Variables de Entorno

- [ ] Mover configuraciones estáticas/URLs a un archivo `.env`.
- [ ] Usar `import.meta.env` para acceder a ellas de forma segura.
- **Objetivo**: Segregación de configuración y entorno.

## 6. Consolidación de Scripts de Cliente

- [ ] Evaluar si los scripts en `src/scripts/` pueden integrarse directamente en sus componentes mediante etiquetas `<script>`.
- [ ] Optimizar la carga de scripts de terceros si los hubiera.
- **Objetivo**: Reducir peticiones HTTP y mejorar el empaquetado.
