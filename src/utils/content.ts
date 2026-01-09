/**
 * Content Utility Functions
 * Helpers for content collections and data manipulation.
 */

/**
 * Strips the file extension from a filename or path.
 * Used for generating clean IDs from file entries in content collections.
 *
 * @param entry - The file path or name (e.g., "my-post.mdx", "data.yaml")
 * @returns The path without the extension (e.g., "my-post", "data")
 */
export const stripExtension = (entry: string): string => {
  // Only strip extension if there's content before the dot
  const match = entry.match(/^(.+)\.[^/.]+$/);
  return match ? match[1] : entry;
};
