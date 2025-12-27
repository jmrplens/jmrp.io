import { getEntry } from "astro:content";

/**
 * Interface for a CV section.
 */
export interface CVSection {
  title: string;
  type: "map" | "time_table" | "list_groups" | "certificate_list";
  contents: any[];
}

/**
 * Loads CV data from the content collection.
 *
 * @returns {Promise<CVSection[]>} The parsed CV data.
 */
export async function getCVData(): Promise<CVSection[]> {
  try {
    const entry = await getEntry("cv", "main");
    if (!entry) return [];
    return entry.data as CVSection[];
  } catch (error) {
    console.error("Error loading CV data:", error);
    return [];
  }
}
