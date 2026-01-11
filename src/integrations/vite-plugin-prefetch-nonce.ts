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
  return {
    name: "vite-prefetch-nonce",
    enforce: "post",

    transform(code, id) {
      // Only process Astro's prefetch module
      if (!id.includes("astro") || !id.includes("prefetch")) {
        return null;
      }

      // Check if this is the prefetch module with appendSpeculationRules
      if (!code.includes("appendSpeculationRules")) {
        return null;
      }

      // Match the appendSpeculationRules function and add nonce extraction
      // Pattern matches: document.head.append(script) or document.head.append(variableName)
      const appendPattern = /document\.head\.append\((\w+)\)/g;

      if (!appendPattern.test(code)) {
        return null;
      }

      // Reset lastIndex after test()
      appendPattern.lastIndex = 0;

      // Inject nonce extraction before appending to head
      // This extracts the nonce from any existing script with a nonce attribute
      const patchedCode = code.replace(
        appendPattern,
        `(() => {
          const existingScript = document.querySelector("head > script[nonce], body > script[nonce]");
          if (existingScript?.nonce) $1.nonce = existingScript.nonce;
        })(), document.head.append($1)`,
      );

      if (patchedCode === code) {
        return null;
      }

      return {
        code: patchedCode,
        map: null,
      };
    },
  };
}
