import icon192Src from "@assets/icons/pwa/icon-192.png";
import icon512Src from "@assets/icons/pwa/icon-512.png";
import type { APIRoute } from "astro";
import { getImage } from "astro:assets";
import { getEntry } from "astro:content";

/**
 * Endpoint for generating the Progressive Web App (PWA) manifest file.
 *
 * This manifest includes:
 * - Application metadata (name, description, theme colors).
 * - Multi-resolution icons for different devices and purposes (any, maskable).
 * - Navigation shortcuts for quick access to key site sections.
 */
export const GET: APIRoute = async () => {
  interface Shortcut {
    name: string;
    url: string;
    description?: string;
  }

  interface SiteData {
    author?: string;
    description?: string;
    background_color?: string;
    theme_color?: string;
    shortcuts?: Shortcut[];
  }

  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data as unknown as SiteData;

  const icon192 = await getImage({
    src: icon192Src,
    format: "png",
    width: 192,
    height: 192,
  });
  const icon512 = await getImage({
    src: icon512Src,
    format: "png",
    width: 512,
    height: 512,
  });

  const manifest = {
    name: siteData?.author || "José Manuel Requena Plens",
    short_name: "JMRP",
    description: siteData?.description,
    start_url: "/",
    display: "standalone",
    background_color: siteData?.background_color || "#000000",
    theme_color: siteData?.theme_color || "#B509AC",
    orientation: "portrait-primary",
    icons: [
      {
        src: icon192.src,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon192.src,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: icon512.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon512.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Properly typed shortcuts to satisfy TS
    shortcuts: siteData?.shortcuts?.map((s) => ({
      name: s.name,
      url: s.url,
      description: s.description,
    })),
    categories: ["education", "technology", "portfolio"],
    lang: "en-US",
    dir: "ltr",
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
};
