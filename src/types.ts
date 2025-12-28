import type { CollectionEntry } from "astro:content";

export type SiteConfig = Extract<
  CollectionEntry<"site_config">["data"],
  { title: string }
>;
export type SocialsConfig = Extract<
  CollectionEntry<"site_config">["data"],
  { github_username?: string }
>;

export type CVData = CollectionEntry<"cv">["data"];
export type CVSection = CVData[number];

export type CVSkillGroup = Extract<
  CVSection,
  { type: "list_groups" }
>["contents"][number];
export type CVCertificateGroup = Extract<
  CVSection,
  { type: "certificate_list" }
>["contents"][number];
// Helper to extract specific section types if needed, but union handling in templates is usually enough
