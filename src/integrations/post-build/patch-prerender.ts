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

    // Pattern to match the exact minified code:
    // n.type="speculationrules",n.textContent=JSON.stringify({prerender:[{source:"list",urls:[e],eagerness:t}],prefetch:[{source:"list",urls:[e],eagerness:t}]}),document.head.append(n)
    const originalPattern =
      /n\.type="speculationrules",n\.textContent=JSON\.stringify\(\{prerender:\[\{source:"list",urls:\[e\],eagerness:t\}\],prefetch:\[\{source:"list",urls:\[e\],eagerness:t\}\]\}\),document\.head\.append\(n\)/;

    if (!originalPattern.test(content)) {
      console.warn(
        `  ⚠ Speculation rules pattern not found in ${path.basename(file)}`,
      );
      continue;
    }

    // Patch: Add nonce attribute before appending to head
    // We extract the nonce from the first script with a nonce attribute in the document
    const patchedCode = content.replace(
      originalPattern,
      'n.type="speculationrules",n.textContent=JSON.stringify({prerender:[{source:"list",urls:[e],eagerness:t}],prefetch:[{source:"list",urls:[e],eagerness:t}]}),(() => { const nonce = document.querySelector("script[nonce]")?.nonce; if (nonce) n.nonce = nonce; })(),document.head.append(n)',
    );

    if (patchedCode === content) {
      console.warn(`  ⚠ Failed to patch ${path.basename(file)}`);
      continue;
    }

    fs.writeFileSync(file, patchedCode, "utf-8");
    console.log(`  ✓ Patched ${path.basename(file)} with nonce support`);
  }
}
