/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Declare module for 'citation-js' as it lacks official TypeScript definitions.
 * This prevents implicit 'any' errors when importing it.
 */
declare module "citation-js";
