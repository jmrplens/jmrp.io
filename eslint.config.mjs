import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
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
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // 3. Accessibility Configuration
  {
    files: ["**/*.astro", "**/*.tsx", "**/*.jsx"],
    ...jsxA11y.flatConfigs.recommended,
  },

  // 4. Astro Overrides
  {
    files: ["**/*.astro"],
    // We need to make sure the TS plugin is available here if we want to use its rules
    // extending tseslint.configs.base or similar usually helps, but Astro plugin might already do it.
    // Let's just rely on what Astro plugin provides + override specific Astro rules if needed.
    rules: {
      // "astro/no-set-html-directive": "off"
    },
  },

  // 5. Node Scripts Configuration
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

  // 6. Specific overrides
  {
    files: ["src/env.d.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
);
