/**
 * Site URL Utilities
 * Centralizes the logic for constructing absolute URLs based on the site configuration.
 */

/**
 * Returns the base site URL from the environment configuration.
 * Safe to use in both SSG and SSR contexts where `import.meta.env.SITE` is available.
 */
export const getSiteUrl = (): string => {
  const site = import.meta.env.SITE;
  if (!site) {
    throw new Error("SITE environment variable is not defined.");
  }
  return site;
};

/**
 * Constructs an absolute URL by appending a path to the base site URL.
 * Handles leading/trailing slashes to ensure a valid URL.
 * If the path is already an absolute URL, it is returned as-is (ignoring the site base).
 *
 * @param path - The path to append (e.g., "/blog", "assets/image.png")
 * @returns The full absolute URL string
 * @throws Error if the URL construction fails.
 */
export const getAbsoluteUrl = (path: string): string => {
  const base = getSiteUrl(); // Call outside try-catch so errors propagate unchanged
  try {
    return new URL(path, base).href;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to construct absolute URL for path "${path}": ${message}`,
    );
  }
};

/**
 * Builds the canonical, de-duplicated `sameAs` array for the Person JSON-LD entity.
 * Combines the visible footer social links with the extra academic/identity URLs
 * declared under `person.sameAs` (Google Scholar, ORCID, ResearchGate, MATLAB Central…),
 * which strengthen AI entity recognition without cluttering the footer.
 *
 * @param socialLinks - The `social_links` array from site config (footer + sameAs).
 * @param extras - The `person.sameAs` extras (schema-only entity URLs).
 * @returns A de-duplicated array of absolute profile URLs.
 */
export const buildSameAs = (
  socialLinks?: { url: string }[],
  extras?: string[],
): string[] => [
  ...new Set([...(socialLinks?.map((l) => l.url) ?? []), ...(extras ?? [])]),
];
