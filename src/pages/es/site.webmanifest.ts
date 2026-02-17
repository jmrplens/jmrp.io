import { generateManifest } from "@utils/manifest";
import type { APIRoute } from "astro";

/**
 * Endpoint for generating the Progressive Web App (PWA) manifest file (ES).
 *
 * Spanish locale version of the PWA manifest with translated
 * name, description, shortcuts, and locale-prefixed URLs.
 */
export const GET: APIRoute = async () => {
  return generateManifest("es");
};
