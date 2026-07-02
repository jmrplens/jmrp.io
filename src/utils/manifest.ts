/**
 * Shared Web App Manifest generation utilities.
 *
 * Used by both `/site.webmanifest` (EN) and `/es/site.webmanifest` (ES)
 * endpoints to generate locale-specific PWA manifests.
 */
import icon192Src from "@assets/icons/pwa/icon-192.png";
import icon512Src from "@assets/icons/pwa/icon-512.png";
import { defaultLocale, type Locale, localeConfig } from "@i18n/config";
import { useTranslations } from "@i18n/utils";
import { getImage } from "astro:assets";
import { getEntry } from "astro:content";

/** Site data shape needed for the manifest. */
interface SiteData {
  author?: string;
  background_color?: string;
  theme_color?: string;
}

/**
 * Generate a PWA manifest Response for the given locale.
 *
 * @param locale - The target locale.
 * @returns A JSON Response with the manifest content.
 */
export async function generateManifest(locale: Locale): Promise<Response> {
  const t = useTranslations(locale);
  const pathPrefix = locale === defaultLocale ? "" : `/${locale}`;

  const siteEntry = await getEntry("site_config", "site");
  const siteData = siteEntry?.data as unknown as SiteData;

  const icon192 = await getImage({
    src: icon192Src,
    format: "png",
    width: 192,
    height: 192,
  });
  const icon192Webp = await getImage({
    src: icon192Src,
    format: "webp",
    width: 192,
    height: 192,
  });
  const icon512 = await getImage({
    src: icon512Src,
    format: "png",
    width: 512,
    height: 512,
  });
  const icon512Webp = await getImage({
    src: icon512Src,
    format: "webp",
    width: 512,
    height: 512,
  });

  const manifest = {
    name: "jmrp.io",
    short_name: "JMRP",
    description: t("seo.siteDescription"),
    start_url: `${pathPrefix}/`,
    display: "standalone",
    background_color: siteData?.background_color || "#0A0A0B",
    theme_color: siteData?.theme_color || "#0A0A0B",
    orientation: "portrait-primary",
    icons: [
      {
        src: icon192Webp.src,
        sizes: "192x192",
        type: "image/webp",
        purpose: "any",
      },
      {
        src: icon192.src,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon192Webp.src,
        sizes: "192x192",
        type: "image/webp",
        purpose: "maskable",
      },
      {
        src: icon192.src,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: icon512Webp.src,
        sizes: "512x512",
        type: "image/webp",
        purpose: "any",
      },
      {
        src: icon512.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon512Webp.src,
        sizes: "512x512",
        type: "image/webp",
        purpose: "maskable",
      },
      {
        src: icon512.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: t("pwa.shortcutBlog"),
        url: `${pathPrefix}/blog/`,
        description: t("pwa.shortcutBlogDesc"),
      },
      {
        name: t("pwa.shortcutCV"),
        url: `${pathPrefix}/cv`,
        description: t("pwa.shortcutCVDesc"),
      },
      {
        name: t("pwa.shortcutPublications"),
        url: `${pathPrefix}/publications`,
        description: t("pwa.shortcutPublicationsDesc"),
      },
    ],
    categories: ["education", "technology", "portfolio"],
    lang: localeConfig[locale].bcp47,
    dir: localeConfig[locale].dir,
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
    },
  });
}
