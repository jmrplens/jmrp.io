/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly GITHUB_USERNAME?: string;
  readonly GITHUB_TOKEN?: string;
  readonly PUBLIC_POTATOMESH_URL?: string;
  readonly PUBLIC_MESH_LF_URL?: string;
  readonly PUBLIC_MESH_MF_URL?: string;
  readonly TELEGRAM_BOT_TOKEN?: string;
  readonly TELEGRAM_CHAT_ID?: string;
  readonly GOOGLE_API_KEY?: string;
  readonly GEMINI_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Declare module for 'citation-js' as it lacks official TypeScript definitions.
 * This prevents implicit 'any' errors when importing it.
 */
declare module "citation-js";
