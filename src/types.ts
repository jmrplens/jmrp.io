/**
 * Global Type Definitions
 *
 * Defines the structure of the data collections and configuration objects
 * used throughout the application.
 */

import type { CollectionEntry } from "astro:content";

/**
 * Configuration structure for the main site properties (title, descriptions).
 */
export type SiteConfig = Extract<
  CollectionEntry<"site_config">["data"],
  { title: string }
>;

/**
 * Configuration structure for social media links and username handles.
 */
export type SocialsConfig = Extract<
  CollectionEntry<"site_config">["data"],
  { github_username?: string }
>;

/**
 * Full structure of the CV content collection data.
 */
export type CVData = CollectionEntry<"cv">["data"];

/**
 * A single section within the CV (e.g., Education, Experience).
 */
export type CVSection = CVData[number];

/**
 * A group of skills within a skill list section.
 */
export type CVSkillGroup = Extract<
  CVSection,
  { type: "list_groups" }
>["contents"][number];

/**
 * A group of certificates within a certificate list section.
 */
export type CVCertificateGroup = Extract<
  CVSection,
  { type: "certificate_list" }
>["contents"][number];
