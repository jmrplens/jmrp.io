import { buildRegistry } from "./render";

/**
 * The component registry for the Astro build.
 *
 * `import.meta.glob` is what makes the design self-registering: dropping a
 * `<Name>.md.ts` next to a component is the whole of adding markdown support
 * for it. There is no central list to keep in sync, which is the failure mode
 * a 62-entry switch statement would have had.
 *
 * @module
 */
export const registry = buildRegistry(
  import.meta.glob("/src/components/**/*.md.ts", { eager: true }),
);
