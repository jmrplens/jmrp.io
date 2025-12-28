import { getEntry } from "astro:content";

/**
 * Interface representing a section in the CV (e.g., Education, Experience).
 */
export interface CVEntry {
  title: string; // Title of the section
  type: string; // layout type identifier
  contents: any[]; // List of items in this section
}

/**
 * Reads and parses the CV data from the YAML file.
 * Located at: src/content/cv/main.yaml
 *
 * @returns {Promise<CVEntry[]>} Array of CV sections and their contents.
 */
export async function getCVData(): Promise<CVEntry[]> {
  const entry = await getEntry("cv", "main");
  if (!entry) {
    throw new Error("Could not find CV data");
  }
  return entry.data as unknown as CVEntry[];
}
