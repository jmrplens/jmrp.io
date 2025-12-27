import { getEntry, type CollectionEntry } from "astro:content";

export type CVData = CollectionEntry<"cv">["data"];
export type CVSection = CVData[number];

/**
 * Loads CV data from the content collection.
 *
 * @returns {Promise<CVData>} The parsed CV data.
 */
export async function getCVData(): Promise<CVData> {
  try {
    const entry = await getEntry("cv", "main");
    if (!entry) return [];
    return entry.data;
  } catch (error) {
    console.error("Error loading CV data:", error);
    return [];
  }
}
