import { markdownFor } from "@utils/llms/mdx/types";

/**
 * Nothing of an image reaches a reader that cannot see it except the two texts
 * written for exactly that reader: `alt` (what the picture shows) and
 * `caption` (the line printed under it). Both are kept, joined; the rest of the
 * component is display.
 *
 * No markdown image is emitted. `src` is an imported `ImageMetadata` binding
 * rather than a URL — the real path is a content-hashed `/_astro/…` name the
 * bundler decides — so `![alt](…)` could only be written with a target that
 * does not resolve. A described image beats a broken one.
 *
 * `srcLight`/`srcDark` collapse into that same description on purpose: the
 * pair is one picture drawn for two themes and shares a single `alt`, so
 * mentioning the swap would describe the site's styling, not the content.
 */
const IMAGE = { en: "Image", es: "Imagen" } as const;

export default markdownFor({
  tag: "ThemeImage",
  toMarkdown(node, ctx) {
    const alt = ctx.attr(node, "alt")?.trim();
    const caption = ctx.attr(node, "caption")?.trim();
    // A caption that repeats the alt would be said twice; authors do reuse one
    // sentence for both when the image is its own caption.
    const parts = [alt, caption === alt ? undefined : caption].filter(Boolean);
    return parts.length > 0
      ? `**${IMAGE[ctx.locale]}:** ${parts.join(" — ")}`
      : "";
  },
});
