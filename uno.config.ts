/**
 * UnoCSS Configuration
 *
 * Scans all source and content files for icon patterns.
 * Custom extractor ensures icons in YAML/MDX/TS are detected even without 'i-' prefix.
 */
import { defineConfig, presetIcons, presetWind4 } from "unocss";

const iconCollections = [
  "fa-solid",
  "fa-brands",
  "fa-regular",
  "mdi",
  "logos",
  "simple-icons",
  "vscode-icons",
  "devicon",
  "carbon",
  "tabler",
  "heroicons",
  "lucide",
];

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
