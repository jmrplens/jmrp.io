import type { Plugin } from "vite";

/**
 * Vite plugin to patch Astro's prefetch module with CSP nonce support.
 *
 * This plugin intercepts the Astro prefetch module during transform and modifies
 * the `appendSpeculationRules` function to extract and apply a nonce from existing
 * scripts in the document. This ensures that dynamically created speculation rules
 * comply with strict Content Security Policy (CSP) directives.
 *
 * Works in both development and production modes, replacing the need for a
 * post-build patching step.
 */
export function vitePrefetchNoncePlugin(): Plugin {
  // Stricter pattern to match Astro's prefetch module
  const prefetchModulePattern = /[\\/]@?astro[\\/].*prefetch/;

  return {
    name: "vite-prefetch-nonce",
    enforce: "post",

    transform(code, id) {
      // Only process Astro's prefetch module using stricter pattern
      if (!prefetchModulePattern.test(id)) {
        return null;
      }

      // Secondary guard: Check if this is the prefetch module with appendSpeculationRules
      if (!code.includes("appendSpeculationRules")) {
        return null;
      }

      // Match document.head.append(anyExpression) - use non-greedy capture for any expression
      const appendPattern = /document\.head\.append\(([^)]+?)\)/g;

      if (!appendPattern.test(code)) {
        return null;
      }

      // Reset lastIndex after test()
      appendPattern.lastIndex = 0;

      // Generate replacement that evaluates the expression only once
      // Using an IIFE with a temp variable to avoid duplicating the expression
      const patchedCode = code.replace(
        appendPattern,
        `;(() => {
          const __vitePrefetchEl = $1;
          const existingScript = document.querySelector("head > script[nonce], body > script[nonce]");
          if (existingScript?.nonce) __vitePrefetchEl.nonce = existingScript.nonce;
          document.head.append(__vitePrefetchEl);
        })();`,
      );

      if (patchedCode === code) {
        return null;
      }

      // Return the patched code
      // Note: source maps are not generated here since string replacement is simple
      // and the module is third-party. For debugging, use original Astro sources.
      return {
        code: patchedCode,
        map: null,
      };
    },
  };
}
