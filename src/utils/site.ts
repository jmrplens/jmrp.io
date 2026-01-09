/**
 * Site URL Utilities
 * Centralizes the logic for constructing absolute URLs based on the site configuration.
 */

/**
 * Returns the base site URL from the environment configuration.
 * Safe to use in both SSG and SSR contexts where `import.meta.env.SITE` is available.
 */
export const getSiteUrl = (): string => {
  return import.meta.env.SITE;
};

/**
 * Constructs an absolute URL by appending a path to the base site URL.
 * Handles leading/trailing slashes to ensure a valid URL.
 *
 * @param path - The path to append (e.g., "/blog", "assets/image.png")
 * @returns The full absolute URL string
 * @throws Error if the URL construction fails.
 */
export const getAbsoluteUrl = (path: string): string => {
  try {
    return new URL(path, getSiteUrl()).toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to construct absolute URL for path "${path}": ${message}`,
    );
  }
};
