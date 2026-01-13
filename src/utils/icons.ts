/**
 * Centralized icon mapping for code blocks and file types.
 * Used by Code.astro and FileContent.astro components.
 */

// Comprehensive map of languages/extensions to Iconify icon names
const iconMap: Record<string, string> = {
  // Languages
  nginx: "devicon:nginx",
  conf: "devicon:nginx",
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

  // 1. Check for exact extension match in our map
  // Extract extension (e.g., 'config.json' -> 'json')
  const ext = lowerName.split(".").pop();
  if (ext && iconMap[ext]) {
    return iconMap[ext];
  }

  // 2. Specific file overrides
  if (lowerName === "dockerfile") return iconMap.docker;
  if (lowerName === "makefile") return iconMap.makefile;
  if (lowerName.includes("nginx")) return iconMap.nginx;
  if (lowerName.startsWith(".env")) return iconMap.env;

  // 3. Fallbacks based on partial matches or categories
  if (lowerName.endsWith(".conf") || lowerName.endsWith(".config"))
    return "mdi:file-cog-outline";
  if (lowerName.includes("rc")) return "mdi:file-cog-outline"; // .bashrc, .eslintrc

  // Default generic file icon
  return "mdi:file-outline";
};
