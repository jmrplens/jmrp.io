/**
 * Global Type Definitions
 *
 * Defines the structure of the data collections and configuration objects
 * used throughout the application.
 */

import type { CollectionEntry } from "astro:content";

/**
 * Configuration structure for the main site properties (title).
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
 * Full structure of the CV content collection data
 * (`{ basics, downloads, sections }`).
 */
export type CVData = CollectionEntry<"cv">["data"];

/** Header / identity block of the CV. */
export type CVBasics = CVData["basics"];

/** A CV download format group (ATS concise / ATS full / Design). */
export type CVDownload = CVData["downloads"][number];

/**
 * A single CV body section, discriminated by `kind`.
 */
export type CVSection = CVData["sections"][number];

/** An experience (job/role) entry. */
export type CVExperienceItem = Extract<
  CVSection,
  { kind: "experience" }
>["items"][number];

/** An education entry. */
export type CVEducationItem = Extract<
  CVSection,
  { kind: "education" }
>["items"][number];

/**
 * A group of skills within a skills section.
 */
export type CVSkillGroup = Extract<
  CVSection,
  { kind: "skills" }
>["groups"][number];

/**
 * A group of certificates within a certificates section.
 */
export type CVCertificateGroup = Extract<
  CVSection,
  { kind: "certificates" }
>["groups"][number];

/**
 * A single featured project within a projects section.
 */
export type CVProjectItem = Extract<
  CVSection,
  { kind: "projects" }
>["items"][number];
