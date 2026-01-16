/**
 * Centralized icon mapping for code blocks and file types.
 * Used by Code.astro and FileContent.astro components.
 */

// Comprehensive map of languages/extensions to Iconify icon names
const iconMap: Record<string, string> = {
  // Languages
  nginx: "devicon:nginx",
  conf: "mdi:file-cog-outline",
  javascript: "devicon:javascript",
  js: "devicon:javascript",
  mjs: "devicon:javascript",
  cjs: "devicon:javascript",
  typescript: "devicon:typescript",
  ts: "devicon:typescript",
  python: "devicon:python",
  py: "devicon:python",
  bash: "devicon:bash",
  sh: "devicon:bash",
  shell: "devicon:bash",
  zsh: "devicon:bash",
  php: "devicon:php",
  ruby: "devicon:ruby",
  rb: "devicon:ruby",
  go: "devicon:go",
  rust: "devicon:rust",
  rs: "devicon:rust",
  java: "devicon:java",
  kotlin: "devicon:kotlin",
  kt: "devicon:kotlin",
  swift: "devicon:swift",
  c: "devicon:c",
  cpp: "devicon:cplusplus",
  csharp: "devicon:csharp",
  cs: "devicon:csharp",
  lua: "devicon:lua",
  perl: "devicon:perl",
  r: "devicon:r",
  dart: "devicon:dart",

  // Web Tech & Frameworks
  html: "devicon:html5",
  css: "devicon:css3",
  sass: "devicon:sass",
  scss: "devicon:sass",
  less: "devicon:less",
  astro: "simple-icons:astro",
  react: "devicon:react",
  jsx: "devicon:react",
  tsx: "devicon:react",
  vue: "devicon:vuejs",
  angular: "devicon:angular",
  svelte: "devicon:svelte",
  nextjs: "devicon:nextjs",
  nuxtjs: "devicon:nuxtjs",
  tailwind: "devicon:tailwindcss",

  // Data & Config
  json: "mdi:code-json",
  yaml: "mdi:file-settings-outline",
  yml: "mdi:file-settings-outline",
  xml: "mdi:xml",
  svg: "mdi:xml",
  toml: "mdi:file-cog-outline",
  sql: "mdi:database",
  mongodb: "devicon:mongodb",
  graphql: "devicon:graphql",
  ini: "mdi:file-cog-outline",
  env: "mdi:file-cog-outline",

  // Devops & Tools
  dockerfile: "devicon:docker",
  docker: "devicon:docker",
  terraform: "devicon:terraform",
  tf: "devicon:terraform",
  kubernetes: "devicon:kubernetes",
  k8s: "devicon:kubernetes",
  git: "devicon:git",
  github: "mdi:github",
  markdown: "mdi:language-markdown",
  md: "mdi:language-markdown",
  mdx: "mdi:language-markdown",
  diff: "mdi:file-diff-outline",
  powershell: "devicon:powershell",
  ps1: "devicon:powershell",
  makefile: "devicon:makefile",

  // Generic File Types
  txt: "mdi:file-document-outline",
  pdf: "mdi:file-pdf-box",
  image: "mdi:file-image",
  archive: "mdi:folder-zip-outline",
  zip: "mdi:folder-zip-outline",
  tar: "mdi:folder-zip-outline",
  gz: "mdi:folder-zip-outline",
};

/**
 * Get the icon name for a given programming language ID.
 */
export const getIconForLang = (language: string): string => {
  if (!language) return "mdi:code-tags";
  return iconMap[language.toLowerCase()] || "mdi:code-tags";
};

/**
 * Get the icon name for a given filename based on extension or partial match.
 */
export const getIconForFile = (filename: string): string => {
  if (!filename) return "mdi:file-outline";

  const lowerName = filename.toLowerCase();

  // 1. Specific file overrides (check before extension)
  if (lowerName === "dockerfile") return iconMap.docker;
  if (lowerName === "makefile") return iconMap.makefile;
  if (lowerName.includes("nginx")) return iconMap.nginx;
  if (lowerName.startsWith(".env")) return iconMap.env;

  // 2. Check for exact extension match in our map
  // Extract extension safely: only if there's a dot that's not at the start (avoiding dotfiles)
  const lastDotIndex = lowerName.lastIndexOf(".");
  const ext = lastDotIndex > 0 ? lowerName.slice(lastDotIndex + 1) : "";
  if (ext && iconMap[ext]) {
    return iconMap[ext];
  }

  // 3. Fallbacks based on partial matches or categories
  if (lowerName.endsWith(".conf") || lowerName.endsWith(".config"))
    return "mdi:file-cog-outline";
  // Match rc-style files: dotfiles ending with "rc" (e.g., .bashrc, .eslintrc)
  // or filenames with at least 3 chars before "rc" suffix (e.g., "npmrc")
  // Avoids false positives like "src", "source.js", "service.ts"
  if (/^\.[\w-]*rc$/.test(lowerName) || /^[\w-]{3,}rc$/.test(lowerName))
    return "mdi:file-cog-outline";

  // Default generic file icon
  return "mdi:file-outline";
};
