import { defaultLocale } from "@i18n/config";
import { generateManifest } from "@utils/manifest";
import type { APIRoute } from "astro";

/**
 * Endpoint for generating the Progressive Web App (PWA) manifest file (EN).
 *
 * This manifest includes:
 * - Application metadata (name, description, theme colors).
 * - Multi-resolution icons for different devices and purposes (any, maskable).
 * - Navigation shortcuts for quick access to key site sections.
 */
export const GET: APIRoute = async () => {
  return generateManifest(defaultLocale);
};
