import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

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
 * Located at: src/data/cv/cv.yml
 *
 * @returns {CVEntry[]} Array of CV sections and their contents.
 */
export function getCVData() {
  const filePath = path.join(process.cwd(), "src/data/cv/cv.yml");
  const fileContents = fs.readFileSync(filePath, "utf8");
  return yaml.load(fileContents) as CVEntry[];
}
