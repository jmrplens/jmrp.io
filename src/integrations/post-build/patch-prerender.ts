import fs from "node:fs";
import path from "node:path";

import { glob } from "glob";

/**
 * Patches Astro's client-prerender code to add nonce support for speculation rules.
 *
 * The client-prerender feature creates `<script type="speculationrules">` elements
 * dynamically, which violates CSP unless they have the appropriate nonce.
 *
 * This function finds the generated JavaScript file and patches the code that creates
 * the speculation rules script to:
 * 1. Get the nonce from an existing nonce-enabled script in the document
 * 2. Apply that nonce to the dynamically created speculation rules script
 *
 * @param {string} distDir - The absolute path to the production build output.
 */
export async function patchClientPrerenderNonce(distDir: string) {
  console.log("[PostBuild] Patching client-prerender for CSP nonce support...");

  // Find the Astro page JS file that contains the speculation rules code
  const jsFiles = await glob("_astro/page.*.js", {
    cwd: distDir,
    absolute: true,
  });

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, "utf-8");

    // Check if this file contains the speculation rules code
    if (!content.includes('type="speculationrules"')) {
      continue;
    }

    // Pattern to match the structure of the code, not exact minified variable names.
    // Group 1: variable name for script element (e.g., 'n', 'a', etc.)
    // Group 2: urls variable name (e.g., 'e')
    // Group 3: eagerness variable name (e.g., 't')
    // Uses backreference \1 to ensure same variable is used throughout
    // This is more robust against minifier changes in future Astro versions.
    const originalPattern =
      /(\w+)\.type="speculationrules",\1\.textContent=JSON\.stringify\(\{prerender:\[\{source:"list",urls:\[(\w+)\],eagerness:(\w+)\}\],prefetch:\[\{source:"list",urls:\[\2\],eagerness:\3\}\]\}\),document\.head\.append\(\1\)/g; // NOSONAR

    if (!originalPattern.test(content)) {
      throw new Error(
        `Speculation rules found in ${path.basename(file)} but patch pattern mismatch. ` +
          "Astro/Vite minification likely changed. Update the patch pattern to maintain CSP compliance.",
      );
    }

    // Reset lastIndex because of /g flag used in .test()
    originalPattern.lastIndex = 0;

    // Patch: Add nonce attribute before appending to head
    // We extract the nonce from the first script with a nonce attribute in the document
    // Uses backreferences: $1=script var, $2=urls var, $3=eagerness var
    const patchedCode = content.replace(
      originalPattern,
      '$1.type="speculationrules",$1.textContent=JSON.stringify({prerender:[{source:"list",urls:[$2],eagerness:$3}],prefetch:[{source:"list",urls:[$2],eagerness:$3}]}),(() => { const nonce = document.querySelector("script[nonce]")?.nonce; if (nonce) $1.nonce = nonce; })(),document.head.append($1)',
    );

    if (patchedCode === content) {
      throw new Error(`Failed to apply patch in ${path.basename(file)}`);
    }

    fs.writeFileSync(file, patchedCode, "utf-8");
    console.log(`  ✓ Patched ${path.basename(file)} with nonce support`);
  }
}
