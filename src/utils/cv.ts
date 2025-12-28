import { getEntry, type CollectionEntry } from "astro:content";

export type CVData = CollectionEntry<"cv">["data"];
export type CVSection = CVData[number];

/**
 * Reads and parses the CV data from the YAML file.
 * Located at: src/content/cv/main.yaml
 *
 * @returns {Promise<CVData>} Array of CV sections and their contents.
 */
export async function getCVData(): Promise<CVData> {
  const entry = await getEntry("cv", "main");
  if (!entry) {
    throw new Error("Could not find CV data");
  }
  return entry.data;
}
