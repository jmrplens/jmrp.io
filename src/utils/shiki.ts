import routerosGrammar from "@languages/routeros.tmLanguage.json";
import {
  type BuiltinLanguage,
  createHighlighter,
  type HighlighterGeneric,
  type LanguageRegistration,
  type SpecialLanguage,
} from "shiki";

// Map of custom language names to their grammar definitions
const customLanguages: Record<string, LanguageRegistration> = {
  routeros: routerosGrammar as unknown as LanguageRegistration,
  mikrotik: routerosGrammar as unknown as LanguageRegistration,
  rsc: routerosGrammar as unknown as LanguageRegistration,
};

/**
 * Resolves a language string to either a Shiki built-in language, a special language,
 * or a custom language registration object (e.g., for RouterOS).
 *
 * @param lang - The language identifier (e.g., 'js', 'routeros', 'nginx').
 * @returns The resolved language suitable for the AstroCode component.
 */
export function resolveShikiLanguage(
  lang: string,
): BuiltinLanguage | SpecialLanguage | LanguageRegistration {
  return customLanguages[lang] ?? (lang as BuiltinLanguage);
}

// ---------------------------------------------------------------------------
// Singleton Shiki Highlighter
// ---------------------------------------------------------------------------
// Astro's built-in <Code /> component calls createShikiHighlighter() on every
// render, and that wrapper caches the *result* instead of the *Promise*. When
// a page has N code blocks, all N calls race before the first resolves, causing
// N cache misses and N Shiki instances (each ~0.3 MB). With 40+ code-component
// renders across a build this triggers the "[Shiki] N instances" warning.
//
// By creating ONE highlighter here and caching the Promise we guarantee a true
// singleton regardless of concurrent renders.
// ---------------------------------------------------------------------------

/** Shared themes used by Code and FileContent components. */
export const SHIKI_THEMES = {
  light: "github-light",
  dark: "github-dark-high-contrast",
} as const;

/** Promise for the singleton highlighter (created on first use). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let highlighterPromise: Promise<HighlighterGeneric<any, any>> | undefined;

/**
 * Returns the singleton Shiki highlighter, creating it on first call.
 * Subsequent calls (even concurrent) await the same Promise, so only one
 * highlighter is ever created.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHighlighter(): Promise<HighlighterGeneric<any, any>> {
  highlighterPromise ??= createHighlighter({
    themes: [SHIKI_THEMES.light, SHIKI_THEMES.dark],
    langs: ["plaintext"],
  });
  return highlighterPromise;
}

/**
 * Highlights a code string and returns the generated HTML.
 *
 * Uses a singleton Shiki highlighter and lazy-loads languages on demand.
 * Safe to call concurrently — all calls share the same Promise.
 *
 * @param code  - Source code to highlight.
 * @param lang  - Language identifier (string or LanguageRegistration).
 * @returns Rendered HTML string (`<pre class="astro-code …">…</pre>`).
 */
export async function highlightCode(
  code: string,
  lang: BuiltinLanguage | SpecialLanguage | LanguageRegistration,
): Promise<string> {
  const highlighter = await getHighlighter();

  // Determine the name for codeToHtml and the registration if custom
  let langName: string;
  let langRegistration: LanguageRegistration | undefined;

  if (typeof lang === "object") {
    langRegistration = lang;
    langName = lang.name ?? "plaintext";
  } else {
    // Check custom language map first
    const custom = customLanguages[lang];
    if (custom) {
      langRegistration = custom;
      langName = custom.name ?? lang;
    } else {
      langName = lang;
    }
  }

  // Lazy-load the language if not yet registered
  const loaded = highlighter.getLoadedLanguages();
  if (!loaded.includes(langName)) {
    try {
      await (langRegistration
        ? highlighter.loadLanguage(langRegistration)
        : highlighter.loadLanguage(langName as BuiltinLanguage));
    } catch {
      console.warn(
        `[Shiki] Language "${langName}" not found, falling back to plaintext.`,
      );
      langName = "plaintext";
    }
  }

  // Strip trailing newline (Shiki convention)
  const trimmedCode = code.replace(/(?:\r\n|\r|\n)$/, "");

  return highlighter.codeToHtml(trimmedCode, {
    lang: langName,
    themes: SHIKI_THEMES,
    defaultColor: false,
    transformers: [
      {
        // Match Astro's built-in Code component output format:
        //  - Replace "shiki" class with "astro-code"
        //  - Add data-language attribute
        //  - Add overflow-x: auto inline style
        pre(node) {
          const classVal = String(node.properties.class ?? "");
          node.properties.class = classVal.replaceAll("shiki", "astro-code");

          const styleVal = String(node.properties.style ?? "");
          node.properties.style = styleVal + "; overflow-x: auto;";

          node.properties.dataLanguage = langName;
        },
      },
    ],
  });
}
