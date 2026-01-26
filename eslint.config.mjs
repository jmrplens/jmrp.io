import preact from "@gorazdo/eslint-plugin-preact";
import unocss from "@unocss/eslint-plugin";
import eslintPluginAstro from "eslint-plugin-astro";
import jsdoc from "eslint-plugin-jsdoc";
import noSecrets from "eslint-plugin-no-secrets";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import sonarjs from "eslint-plugin-sonarjs";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // Global Ignores
  {
    ignores: [
      "**/dist/**",
      "**/dist_new/**",
      "**/dist-reports/**",
      "**/node_modules/**",
      "**/.astro/**",
      "**/coverage/**",
      "**/public/scripts/**",
      "**/*.min.js",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/accessibility-report/**",
      "**/*.log",
      "**/temp_lh/**",
      "**/temp_workflow/**",
      "**/lh-deploy/**",
      "**/.scannerwork/**",
    ],
  },

  // 1. Astro Configuration
  // This automatically configures the parser for .astro files
  ...eslintPluginAstro.configs.recommended,
  ...eslintPluginAstro.configs["jsx-a11y-recommended"],

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
      // Disable: WHATWG/official standard uses 'utf-8' (with dash), not 'utf8'
      "unicorn/text-encoding-identifier-case": "off",
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

  // 4. JSDoc Configuration (Documentation Enforcement)
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
      "unicorn/no-process-exit": "off", // CLI scripts need process.exit
    },
  },

  // 6. Import Sorting (Organization)
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
    files: ["tests/**/*.{ts,tsx,js,jsx,mjs}"],
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

  // 9. SonarJS Configuration (Quality & Security)
  sonarjs.configs.recommended,
  {
    files: ["**/*.astro", "src/integrations/post-build/*.ts"],
    rules: {
      "sonarjs/slow-regex": "off", // Many false positives in Astro/HTML processing
    },
  },

  // 10. No Secrets Configuration (Security)
  {
    plugins: {
      "no-secrets": noSecrets,
    },
    rules: {
      "no-secrets/no-secrets": ["error", { tolerance: 5 }],
    },
  },
  {
    files: ["scripts/ci/update-ci-comment.mjs"],
    rules: {
      "no-secrets/no-secrets": "off", // False positives on GitHub badges
    },
  },

  // 11. Preact Configuration
  {
    files: ["**/*.tsx", "**/*.jsx"],
    plugins: {
      preact,
    },
    rules: {
      "preact/prefer-classname": "error",
      "preact/forbid-render-arguments": "error",
    },
  },

  // 12. UnoCSS Configuration (Icons & Utility class order)
  {
    plugins: {
      "@unocss": unocss,
    },
    rules: {
      "@unocss/order": "warn",
      "@unocss/order-attributify": "warn",
    },
  },

  // 13. Specific overrides
  {
    files: ["src/env.d.ts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },

  // 13. Content Config Override (virtual modules cause strict type errors)
  {
    files: [
      "src/content.config.ts",
      "src/pages/rss.xml.ts",
      "src/pages/site.webmanifest.ts",
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

  // 14. Accessibility Overrides for Code Blocks
  // Allow non-interactive elements to be keyboard focusable if they are scrollable code regions
  {
    files: [
      "src/components/ui/TerminalCommand.astro",
      "src/components/ui/TerminalOutput.astro",
      "src/components/ui/FileContent.astro",
    ],
    rules: {
      "jsx-a11y/no-noninteractive-tabindex": "off",
      "astro/jsx-a11y/no-noninteractive-tabindex": "off",
    },
  },

  // 15. SonarJS Overrides for specific files
  {
    files: [
      "src/integrations/post-build.ts",
      "scripts/**/*.mjs",
      "tests/**/*.ts",
    ],
    rules: {
      "sonarjs/no-os-command-from-path": "off",
      "sonarjs/no-nested-template-literals": "off",
      "sonarjs/slow-regex": "off",
      "sonarjs/os-command": "off", // CI scripts need to execute OS commands
    },
  },
  {
    files: ["scripts/audit-aria-labels.mjs"],
    rules: {
      "sonarjs/no-control-regex": "off",
    },
  },
  {
    files: ["src/components/ui/*.astro"],
    rules: {
      "sonarjs/no-nested-template-literals": "off",
    },
  },
];
