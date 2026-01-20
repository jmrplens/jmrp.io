import routerosGrammar from "@languages/routeros.tmLanguage.json";
import type {
  BuiltinLanguage,
  LanguageRegistration,
  SpecialLanguage,
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
