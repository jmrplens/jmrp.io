/**
 * Resolves this repo's TypeScript path aliases for plain Node.
 *
 * The component modules use `@utils/…` like every other file in the repo;
 * Vite resolves that from tsconfig, Node does not. Rather than making sixty
 * modules use relative paths for the benefit of one offline script, the
 * script teaches Node the same aliases.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";

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
 *
 */
/**
 * Node ESM resolve hook: rewrites this repo's path aliases to real files.
 *
 * @param {string} specifier - The imported specifier.
 * @param {object} context - Node's resolution context.
 * @param {Function} next - The next hook in the chain.
 * @returns {object} The resolution result.
 */
export function resolve(specifier, context, next) {
  for (const [alias, target] of Object.entries(ALIASES)) {
    if (!specifier.startsWith(alias)) continue;
    const base = `${ROOT}/${target}${specifier.slice(alias.length)}`;
    for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return next(pathToFileURL(candidate).href, context);
      }
    }
  }
  if (specifier === "@i18n") {
    return next(pathToFileURL(`${ROOT}/src/i18n/index.ts`).href, context);
  }
  return next(specifier, context);
}
