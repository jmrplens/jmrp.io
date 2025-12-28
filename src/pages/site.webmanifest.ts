import type { APIRoute } from "astro";
import { getImage } from "astro:assets";
import icon192Src from "@assets/icons/pwa/icon-192.png";
import icon512Src from "@assets/icons/pwa/icon-512.png";

export const GET: APIRoute = async () => {
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
    name: "José Manuel Requena Plens",
    short_name: "JMRP",
    description:
      "Academic and R&D Portfolio of José Manuel Requena Plens. Specializing in Embedded Systems, Acoustics, and Industrial Software Development.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#B509AC",
    orientation: "portrait-primary",
    icons: [
      {
        src: icon192.src,
        sizes: "192x192",
        type: "image/png",
        purpose: "any maskable",
      },
      {
        src: icon512.src,
        sizes: "512x512",
        type: "image/png",
        purpose: "any maskable",
      },
    ],
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
