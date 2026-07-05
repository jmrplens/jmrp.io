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
      "**/dist_old/**",
      "**/builds/**",
      "**/dist-reports/**",
      "design-audit/**",
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
      "src/assets/nedry-assets.ts", // Base64-encoded assets (large file, no logic)
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
      // New in v66–v68; same spirit as prevent-abbreviations / readability — off.
      "unicorn/name-replacements": "off", // Too strict (btn, msg, i, e, el, fn, …)
      "unicorn/consistent-boolean-name": "off", // Opinionated is/has/can boolean naming
      "unicorn/max-nested-calls": "off", // Forces intermediate vars; hurts readability here
      "unicorn/no-for-each": "off", // for…of vs forEach is fine (cf. no-array-for-each)
      "unicorn/prefer-await": "off", // intentional .then/.catch (e.g. .catch(() => null))
      "unicorn/prefer-iterator-to-array": "off", // [...x] / Array.from is the portable form
      "unicorn/prefer-array-from-map": "off", // stylistic
      "unicorn/no-break-in-nested-loop": "off", // breaking out of nested loops is fine
      "unicorn/no-declarations-before-early-exit": "off", // declaring before guards reads fine
      "unicorn/no-top-level-assignment-in-function": "off", // stylistic
      "unicorn/no-computed-property-existence-check": "off", // obj[k] value-check ≠ Object.hasOwn
      "unicorn/prefer-number-coercion": "off", // Number()/parseInt are clear and intentional
      "unicorn/no-unreadable-for-of-expression": "off", // stylistic
      "unicorn/prefer-minimal-ternary": "off", // stylistic
      "unicorn/prefer-hoisting-branch-code": "off", // stylistic
      // Buffer.from(x, "base64") is standard Node and is the right type for the
      // crypto/fs (Buffer) flows in post-build; the Uint8Array.fromBase64 form
      // is adopted where it's a clean swap (scripts/preview-rss.mjs).
      "unicorn/prefer-uint8array-base64": "off",
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
    rules: {
      ...playwright.configs["flat/recommended"].rules,
      // `page.evaluate()` callbacks run in the browser context, where DOM
      // globals (document, window, getComputedStyle, HTMLScriptElement…) are
      // legitimately available. unicorn's new isolated-functions rule (v70)
      // can't see the Node config lacks those globals and false-flags them.
      // It still catches real closure bugs (referencing Node-side variables).
      "unicorn/isolated-functions": "off",
    },
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
    rules: {
      // Stricter sibling of slow-regex (already off below); the flagged regexes
      // run on author content / CI input, not untrusted user input.
      "sonarjs/super-linear-regex": "off",
      // Keep the guardrail but raise the bar — a couple of parsers sit just over
      // the default 15; refactoring them carries more risk than value.
      "sonarjs/cognitive-complexity": ["error", 30],
      // Forcing a click is a legitimate tool in our E2E (e.g. modal backdrops).
      "sonarjs/no-forced-browser-interaction": "off",
    },
  },
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
    files: [
      "scripts/ci/update-ci-comment.mjs", // False positives on GitHub badges
    ],
    rules: {
      "no-secrets/no-secrets": "off",
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
      "src/utils/*.ts", // Uses getEntry/import.meta.env which have dynamic types
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
  {
    files: ["src/pages/404.astro"],
    rules: {
      "astro/jsx-a11y/media-has-caption": "off", // SFX-only audio clip, no spoken content
    },
  },
];
