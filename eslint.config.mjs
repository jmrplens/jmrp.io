import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global Ignores
  {
    ignores: [
      "dist/",
      "node_modules/",
      ".astro/",
      "coverage/",
      "public/scripts/",
      "**/*.min.js",
    ],
  },

  // 1. Astro Configuration
  // This automatically configures the parser for .astro files
  ...eslintPluginAstro.configs.recommended,

  // 2. TypeScript Configuration
  // We apply this to all TS/TSX files.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 3. JSX A11y Configuration
  {
    files: ["**/*.astro", "**/*.tsx", "**/*.jsx"],
    ...jsxA11y.flatConfigs.recommended,
    rules: {
      // Allow scrollable regions (like code blocks) to be focusable for keyboard accessibility
      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        {
          tags: [],
          roles: ["region"],
        },
      ],
    },
  },

  // 4. Node Scripts Configuration
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.js", "**/*.cjs", "*.mjs"],
    // Explicitly include the plugin so we can turn off its rules
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-undef": "off",
    },
  },

  // 5. Specific overrides
  {
    files: ["src/env.d.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
];
