/**
 * Resolves this repo's TypeScript path aliases for plain Node.
 *
 * The component modules use `@utils/…` like every other file in the repo;
 * Vite resolves that from tsconfig, Node does not. Rather than making sixty
 * modules use relative paths for the benefit of one offline script, the
 * script teaches Node the same aliases.
 */
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = new URL("../../", import.meta.url).pathname.replace(/\/$/, "");

const ALIASES = {
  "@components/": "src/components/",
  "@layouts/": "src/layouts/",
  "@styles/": "src/styles/",
  "@languages/": "src/languages/",
  "@assets/": "src/assets/",
  "@utils/": "src/utils/",
  "@data/": "src/data/",
  "@i18n/": "src/i18n/",
  "@src/": "src/",
};

/**
 * The file a module path names, trying the extensionless forms Vite accepts
 * (`x`, `x.ts`, `x/index.ts`) in that order.
 *
 * @param {string} base - Absolute path as written, without extension.
 * @returns {string | undefined} The existing file, or undefined.
 */
function firstFile(base) {
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Node ESM resolve hook: rewrites this repo's path aliases to real files.
 *
 * It also completes RELATIVE imports written without an extension
 * (`../absolute-links` in `src/utils/llms/mdx/render.ts`): Vite resolves them
 * and Node does not, so without this the script stopped with
 * ERR_MODULE_NOT_FOUND on the first such import (found 2026-10-10). Only
 * imports from the repository's own `src/` and `scripts/` are touched, never
 * from a dependency; a specifier that already names a file goes to Node
 * unchanged.
 *
 * @param {string} specifier - The imported specifier.
 * @param {object} context - Node's resolution context.
 * @param {Function} next - The next hook in the chain.
 * @returns {object} The resolution result.
 */
export function resolve(specifier, context, next) {
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (!specifier.startsWith(alias)) continue;
    const file = firstFile(`${ROOT}/${target}${specifier.slice(alias.length)}`);
    if (file) return next(pathToFileURL(file).href, context);
  }
  if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    context.parentURL?.startsWith("file:")
  ) {
    const parent = fileURLToPath(context.parentURL);
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const ours =
      (parent.startsWith(`${ROOT}/src/`) ||
        parent.startsWith(`${ROOT}/scripts/`)) &&
      !parent.includes("/node_modules/");
    // A specifier that already names a file is left to Node, and so is
    // anything imported from a dependency: rewriting a package's own
    // `require("./x")` into a URL breaks the CommonJS loader.
    const file = ours ? firstFile(base) : undefined;
    if (file && file !== base) {
      return next(pathToFileURL(file).href, context);
    }
  }
  if (specifier === "@i18n") {
    return next(pathToFileURL(`${ROOT}/src/i18n/index.ts`).href, context);
  }
  return next(specifier, context);
}
