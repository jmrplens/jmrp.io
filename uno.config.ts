/**
 * UnoCSS Configuration
 *
 * Scans all source and content files for icon patterns.
 * Custom extractor ensures icons in YAML/MDX/TS are detected even without 'i-' prefix.
 */
import { readFileSync } from "node:fs";

import { defineConfig, presetIcons, presetWind4 } from "unocss";

const iconCollections = [
  "fa-solid",
  "fa-brands",
  "mdi",
  "logos",
  "simple-icons",
  "vscode-icons",
  "devicon",
  "tabler",
];

/**
 * Bare Iconify ids authored as `icon:` values in a source file, returned as
 * `i-`-prefixed utility names.
 *
 * Accepts the YAML form (`icon: simple-icons:npm`) and the TS one
 * (`icon: "simple-icons:torproject"`), because the two rosters that need this
 * are written in the two languages.
 *
 * @param relativePath - Source file to read, relative to this config.
 * @returns Utility class names to safelist.
 */
function authoredIcons(relativePath: string): string[] {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  return [...source.matchAll(/\bicon:\s*"?([a-z0-9-]+:[a-z0-9-]+)"?/g)].map(
    (match) => `i-${match[1]}`,
  );
}

export default defineConfig({
  content: {
    filesystem: [
      "src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue,yaml,yml}",
    ],
  },
  extractors: [
    {
      name: "icon-extractor",
      extract(context) {
        const content = context.code;
        const icons = new Set<string>();
        const collectionsPattern = iconCollections.join("|");
        // Regex to find "collection:name" or i-collection:name
        const regex = new RegExp(
          String.raw`\b(${collectionsPattern}):([a-z0-9-]+)\b`,
          "gi",
        );

        let match;
        while ((match = regex.exec(content)) !== null) {
          icons.add(`i-${match[1].toLowerCase()}:${match[2].toLowerCase()}`);
        }
        return icons;
      },
    },
  ],
  safelist: [
    // Icons authored as data rather than as a literal class. In both files the
    // consumer builds the class at runtime as `i-${entry.icon}`, so neither
    // the Vite-side extractor nor the `content.filesystem` scan above ever
    // produces those utilities — the class ships in the HTML and resolves to
    // nothing. Reading the rosters here keeps a NEW entry's icon working with
    // no hand-maintained list (/cv solves the same problem with a block of
    // literal <span>s).
    //
    // The homelab roster earned its way in: moving those arrays out of
    // `HomelabPage.astro` into a plain `.ts` module silently dropped
    // `i-simple-icons:torproject` from the generated CSS — the only icon on
    // that page used nowhere else — and shipped four invisible Tor cards.
    ...authoredIcons("src/content/profile/projects.yaml"),
    ...authoredIcons("src/components/homelab/inventory.ts"),
    // Footer custom_social icons (dynamically generated from socials.yaml)
    "i-mdi:key",
    "i-simple-icons:mikrotik",
    "i-mdi:file-outline",
    "i-mdi:file-cog-outline",
    "i-mdi:file-settings-outline",
    "i-mdi:code-json",
    "i-mdi:xml",
    "i-mdi:database",
    // Timeline component icons (dynamically generated)
    "i-mdi:circle-medium",
    "i-mdi:check-circle",
    "i-mdi:alert-circle",
    "i-mdi:close-circle",
    "i-mdi:help-circle",
    "i-mdi:star",
    // BrowserSupport component icons
    "i-logos:chrome",
    "i-logos:firefox",
    "i-logos:safari",
    "i-logos:microsoft-edge",
    "i-logos:opera",
    // LanguageSwitcher icon
    "i-tabler:language",
    // FileDownload component (icon chosen dynamically from file extension)
    "i-mdi:file-download-outline",
    "i-devicon:python",
    "i-devicon:typescript",
    "i-mdi:language-c",
    "i-mdi:bash",
    "i-mdi:file-delimited-outline",
    "i-mdi:language-markdown",
  ],
  presets: [
    presetWind4({
      // Disable built-in reset styles that override our custom typography in global.css
      preflights: {
        reset: false,
      },
    }),
    presetIcons({
      prefix: "i-",
      extraProperties: {
        display: "inline-block",
        "vertical-align": "middle",
      },
    }),
  ],
});
