import eslintPluginAstro from "eslint-plugin-astro";
import jsdoc from "eslint-plugin-jsdoc";
import jsxA11y from "eslint-plugin-jsx-a11y";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

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

  // 2. Unicorn Configuration (Modern Best Practices)
  // Must be placed early to allow overrides
  {
    ...eslintPluginUnicorn.configs.recommended,
    rules: {
      ...eslintPluginUnicorn.configs.recommended.rules,
      "unicorn/prevent-abbreviations": "off", // Too strict (props, env, args, etc.)
      "unicorn/no-null": "off", // null is standard in many APIs
      "unicorn/filename-case": "off", // Avoid renaming existing files
      "unicorn/prefer-top-level-await": "off", // Can break in some CJS contexts or older envs
      "unicorn/no-array-reduce": "off", // Reduce is useful and standard
      "unicorn/no-array-for-each": "off", // forEach is fine
      "unicorn/no-await-expression-member": "off", // (await foo).bar is fine
      "unicorn/consistent-function-scoping": "off", // Optimization that hurts readability sometimes
      "unicorn/prefer-string-slice": "off", // substring is fine
      "unicorn/import-style": "off", // path imports are fine
      "unicorn/no-array-callback-reference": "off", // map(fn) is fine
      "unicorn/no-array-sort": "off", // sort() is standard
      "unicorn/no-process-exit": "off", // CLI scripts need process.exit (applied globally here for simplicity as we have many scripts)
    },
  },

  // 3. TypeScript Configuration
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

  // 4. JSX A11y Configuration
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

  // 5. JSDoc Configuration (Documentation Enforcement)
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mjs", "scripts/**/*.js"],
    plugins: {
      jsdoc,
    },
    rules: {
      "jsdoc/require-jsdoc": [
        "warn",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
        },
      ],
      "jsdoc/require-description": "warn",
      "jsdoc/require-param": "off", // TS already handles types, we want descriptions mostly
      "jsdoc/require-returns": "off", // TS handles return types
      "jsdoc/require-file-overview": [
        "warn",
        {
          tags: {
            file: {
              initialCommentsOnly: true,
              mustExist: false, // Optional if we use description
            },
          },
        },
      ],
    },
  },

  // 6. Node Scripts Configuration
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

  // 7. Import Sorting (Organization)
  {
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },

  // 7. Playwright (E2E Testing)
  {
    ...playwright.configs["flat/recommended"],
    files: ["tests/**"],
  },

  // 8. React Hooks (Stability for Preact)
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },

  // 9. Specific overrides
  {
    files: ["src/env.d.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  // 10. Content Config Override (virtual modules cause strict type errors)
  {
    files: [
      "src/content.config.ts",
      "src/pages/rss.xml.ts",
      "src/pages/site.webmanifest.ts",
      "src/utils/**/*.ts",
    ],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
];
