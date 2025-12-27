# Plan de Mejora del Proyecto (jmrp.io)

Este documento detalla los pasos para optimizar el proyecto siguiendo los estándares de Astro, TypeScript y buenas prácticas de desarrollo.

## 1. Configuración de Aliases de Ruta (Path Aliases) ✅

- [x] Configurar `tsconfig.json` con aliases para directorios clave.
- [x] Actualizar todos los `import` en el proyecto para usar los nuevos aliases (`@components/*`, `@assets/*`, etc.).
- **Resultado**: Código más limpio y mantenible.

## 2. Migración a Content Collections para Datos (YAML) ✅

- [x] Mover los archivos YAML de `src/data/` a `src/content/`.
- [x] Definir esquemas de validación con Zod en `src/content/config.ts`.
- [x] Refactorizar componentes (`Header`, `Footer`, `CV`, etc.) para usar `getEntry` o `getCollection`.
- **Resultado**: Validación automática de datos, tipado estático y eliminación de `fs`/`js-yaml` en componentes.

## 3. Optimización de Imágenes con Astro Assets ✅

- [x] Usar componentes `<Image />` y la API `getImage` para optimización automática.
- [x] Configurar `ViteImageOptimizer` para procesar assets estáticos.
- **Resultado**: Mejora de Core Web Vitals y reducción de peso de imágenes.

## 4. Refactorización de Tipos TypeScript (Eliminar `any`) ✅

- [x] Sustituir usos de `any` por interfaces específicas en `BaseHead`, `Header`, `Footer`, `CV` y `Publications`.
- [x] Tipar las respuestas de API en el componente `ServiceStats` (Preact).
- **Resultado**: Robustez del código y detección de errores en tiempo de compilación.

## 5. Gestión de Variables de Entorno ✅

- [x] Crear `.env.example` con las variables necesarias.
- **Resultado**: Mejor documentación para nuevos desarrolladores y segregación de secretos.

## 6. Consolidación de Scripts de Cliente ✅

- [x] Integrar scripts en componentes Astro para permitir el empaquetado optimizado de Vite.
- **Resultado**: Reducción de peticiones HTTP y mejor rendimiento.
