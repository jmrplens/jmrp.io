/**
 * WebMCP Tools Catalog
 *
 * Defines all WebMCP tool definitions for the site, organized by context.
 * Tools are pure data definitions (name, description, inputSchema, annotations)
 * paired with execute callbacks that operate on the client-side DOM/APIs.
 *
 * Tool categories:
 * - **Site tools**: Available on every page (theme, navigation, page info)
 * - **Blog tools**: Available on every page (static data from build time)
 * - **CV tools**: Available on every page (static data from build time)
 * - **Publications tools**: Available on every page (static data from build time)
 * - **Tools-index tools**: Available on every page (static data from build time)
 * - **App tools**: Available on individual tool pages (hash, base64, etc.)
 *
 * @see https://webmachinelearning.github.io/webmcp/
 * @module
 */

import type { WebMCPClient, WebMCPTool } from "@src/types/webmcp";

// ─── Site-Wide Tools (available on every page) ───────────────────────

/**
 * Returns tools available on every page of the site.
 * These provide basic site interaction capabilities to agents.
 */
export function getSiteTools(): WebMCPTool[] {
  return [
    {
      name: "get-current-theme",
      description:
        "Get the current color theme of the site. Returns 'dark' or 'light'.",
      execute: () => ({
        content: [
          {
            type: "text",
            text: document.documentElement.dataset.theme ?? "dark",
          },
        ],
      }),
      annotations: { readOnlyHint: true },
    },
    {
      name: "toggle-theme",
      description:
        "Toggle the site color theme between dark and light mode. Returns the new theme after toggling.",
      execute: () => {
        const g = globalThis as unknown as Record<string, unknown>;
        if (typeof g.toggleTheme === "function") {
          (g.toggleTheme as () => void)();
        }
        const newTheme = document.documentElement.dataset.theme ?? "dark";
        return {
          content: [{ type: "text", text: `Theme switched to ${newTheme}.` }],
        };
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: "get-page-info",
      description:
        "Get metadata about the current page including title, description, URL, locale, and type.",
      execute: () => {
        const meta = (name: string): string =>
          document
            .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
            ?.getAttribute("content") ?? "";
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                title: document.title,
                description: meta("description") || meta("og:description"),
                url: globalThis.location.href,
                locale: document.documentElement.lang,
                type: meta("og:type") || "website",
                path: globalThis.location.pathname,
              }),
            },
          ],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "get-site-navigation",
      description:
        "Get the site navigation structure with all available pages and their URLs.",
      execute: () => {
        const navLinks = [
          ...document.querySelectorAll("header nav a[href]"),
        ].map((a) => ({
          text: a.textContent?.trim() ?? "",
          href: a.getAttribute("href") ?? "",
        }));
        return {
          content: [{ type: "text", text: JSON.stringify(navLinks) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "navigate-to",
      description:
        "Navigate to a page on this site by providing a relative path (e.g. '/blog/', '/tools/', '/cv'). Only same-origin navigation is allowed. Requests user confirmation before navigating.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative URL path to navigate to (e.g. '/blog/')",
          },
        },
        required: ["path"],
      },
      execute: async (
        input: Record<string, unknown>,
        client?: WebMCPClient,
      ) => {
        const inputStr = (v: unknown, f = ""): string => {
          if (v == null) return f;
          return typeof v === "string" ? v : JSON.stringify(v);
        };
        const path = inputStr(input.path, "/");
        // Security: only allow same-origin navigation
        try {
          const target = new URL(path, globalThis.location.origin);
          if (target.origin !== globalThis.location.origin) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Cross-origin navigation is not allowed.",
                },
              ],
            };
          }
          // Request user confirmation before navigation (spec §5.2.3)
          if (client && typeof client.requestUserInteraction === "function") {
            try {
              const confirmed = await client.requestUserInteraction(
                // eslint-disable-next-line @typescript-eslint/require-await
                async () => {
                  return confirm("Navigate to " + target.pathname + "?");
                },
              );
              if (!confirmed) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "Navigation cancelled by user.",
                    },
                  ],
                };
              }
            } catch {
              // If requestUserInteraction fails, proceed without confirmation
            }
          }
          globalThis.location.href = target.href;
          return {
            content: [
              { type: "text", text: `Navigating to ${target.pathname}` },
            ],
          };
        } catch {
          return {
            content: [{ type: "text", text: "Error: Invalid path provided." }],
          };
        }
      },
      annotations: { readOnlyHint: false },
    },
    {
      name: "switch-language",
      description:
        "Switch the page language between English ('en') and Spanish ('es'). The page will reload in the selected language. Requests user confirmation before switching.",
      inputSchema: {
        type: "object",
        properties: {
          locale: {
            type: "string",
            enum: ["en", "es"],
            description:
              "Target language code: 'en' for English, 'es' for Spanish",
          },
        },
        required: ["locale"],
      },
      execute: async (
        input: Record<string, unknown>,
        client?: WebMCPClient,
      ) => {
        const inputStr = (v: unknown, f = ""): string => {
          if (v == null) return f;
          return typeof v === "string" ? v : JSON.stringify(v);
        };
        const targetLocale = inputStr(input.locale, "en");
        const currentPath = globalThis.location.pathname;
        const currentLocale = document.documentElement.lang;

        if (targetLocale === currentLocale) {
          return {
            content: [
              { type: "text", text: `Already in ${targetLocale} locale.` },
            ],
          };
        }

        let newPath: string;
        if (targetLocale === "es") {
          newPath = currentPath.startsWith("/es/")
            ? currentPath
            : `/es${currentPath}`;
        } else {
          newPath = currentPath.startsWith("/es/")
            ? currentPath.replace(/^\/es/, "")
            : currentPath;
        }

        // Request user confirmation before language switch (spec §5.2.3)
        if (client && typeof client.requestUserInteraction === "function") {
          try {
            // eslint-disable-next-line @typescript-eslint/require-await
            const confirmed = await client.requestUserInteraction(async () => {
              return confirm(
                "Switch language to " +
                  (targetLocale === "es" ? "Spanish" : "English") +
                  "?",
              );
            });
            if (!confirmed) {
              return {
                content: [
                  {
                    type: "text",
                    text: "Language switch cancelled by user.",
                  },
                ],
              };
            }
          } catch {
            // If requestUserInteraction fails, proceed without confirmation
          }
        }

        globalThis.location.href = newPath || "/";
        return {
          content: [
            {
              type: "text",
              text: `Switching to ${targetLocale}. Navigating to ${newPath || "/"}.`,
            },
          ],
        };
      },
      annotations: { readOnlyHint: false },
    },
  ];
}

// ─── Blog Tools ──────────────────────────────────────────────────────

/** Static post data embedded at build time for cross-page availability. */
export interface StaticPostData {
  title: string;
  url: string;
  date: string;
  tags: string[];
  description: string;
}

/**
 * Returns blog tools that use static post data embedded at build time.
 * Available on every page — agents can list and search posts without navigating to /blog/.
 *
 * @param staticPosts - Pre-built post data from the content collection.
 */
export function getBlogTools(staticPosts: StaticPostData[]): WebMCPTool[] {
  return [
    {
      name: "list-blog-posts",
      description:
        "List all blog posts with their title, URL, date, tags, and description. Works from any page.",
      execute: () => {
        const posts = staticPosts;
        return {
          content: [{ type: "text", text: JSON.stringify(posts) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "search-blog-posts",
      description:
        "Search blog posts by keyword in title, description, and tags. Returns matching posts. Works from any page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search keyword to match against post titles, descriptions, and tags",
          },
        },
        required: ["query"],
      },
      execute: (input: Record<string, unknown>) => {
        const inputStr = (v: unknown, f = ""): string => {
          if (v == null) return f;
          return typeof v === "string" ? v : JSON.stringify(v);
        };
        const query = inputStr(input.query).toLowerCase();
        const matches = staticPosts.filter((post) => {
          const searchable =
            `${post.title} ${post.description} ${post.tags.join(" ")}`.toLowerCase();
          return searchable.includes(query);
        });
        return {
          content: [
            {
              type: "text",
              text:
                matches.length > 0
                  ? JSON.stringify(matches)
                  : `No posts found matching "${inputStr(input.query)}".`,
            },
          ],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "get-post-tags",
      description:
        "Get all unique blog post tags with their occurrence count. Works from any page.",
      execute: () => {
        const tagCounts: Record<string, number> = {};
        for (const post of staticPosts) {
          for (const tag of post.tags) {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          }
        }
        const sorted = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
        return {
          content: [{ type: "text", text: JSON.stringify(sorted) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// ─── CV Tools ────────────────────────────────────────────────────────

/** Static CV section data embedded at build time. */
export interface StaticCVSection {
  title: string;
  type: string;
  summary: string;
}

/**
 * Returns CV tools that use static section data embedded at build time.
 * Available on every page — agents can query CV info without navigating to /cv.
 *
 * @param staticSections - Pre-built CV section summaries.
 * @param personName - Name from CV data.
 */
export function getCVTools(
  staticSections: StaticCVSection[],
  personName: string,
): WebMCPTool[] {
  return [
    {
      name: "get-cv-summary",
      description:
        "Get a summary of the CV/resume including name and all section headings. Works from any page.",
      execute: () => {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: personName,
                sections: staticSections.map((s) => s.title),
              }),
            },
          ],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "get-cv-section",
      description:
        "Get the content summary of a specific CV section by its heading name (e.g. 'Experience', 'Education', 'Skills', 'Certifications'). For full detail, navigate to /cv. Works from any page.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description:
              "The heading name of the CV section to retrieve (case-insensitive)",
          },
        },
        required: ["section"],
      },
      execute: (input: Record<string, unknown>) => {
        const inputStr = (v: unknown, f = ""): string => {
          if (v == null) return f;
          return typeof v === "string" ? v : JSON.stringify(v);
        };
        const sectionName = inputStr(input.section).toLowerCase();
        const section = staticSections.find((s) =>
          s.title.toLowerCase().includes(sectionName),
        );
        if (!section) {
          return {
            content: [
              {
                type: "text",
                text: `Section "${inputStr(input.section)}" not found. Available sections: ${staticSections.map((s) => s.title).join(", ")}`,
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: section.summary }],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// ─── Publications Tools ──────────────────────────────────────────────

/** Static publication data embedded at build time. */
export interface StaticPublicationData {
  title: string;
  authors: string;
  year: string;
  venue: string;
  group: string;
}

/**
 * Returns publication tools that use static data embedded at build time.
 * Available on every page — agents can list and search publications without navigating to /publications.
 *
 * @param staticPubs - Pre-built publication data.
 */
export function getPublicationsTools(
  staticPubs: StaticPublicationData[],
): WebMCPTool[] {
  return [
    {
      name: "list-publications",
      description:
        "List all academic publications with title, authors, year, and venue. Works from any page.",
      execute: () => {
        return {
          content: [{ type: "text", text: JSON.stringify(staticPubs) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "search-publications",
      description:
        "Search publications by keyword in title, authors, or venue. Works from any page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword to match against publication data",
          },
        },
        required: ["query"],
      },
      execute: (input: Record<string, unknown>) => {
        const inputStr = (v: unknown, f = ""): string => {
          if (v == null) return f;
          return typeof v === "string" ? v : JSON.stringify(v);
        };
        const query = inputStr(input.query).toLowerCase();
        const matches = staticPubs.filter((pub) => {
          const searchable =
            `${pub.title} ${pub.authors} ${pub.venue}`.toLowerCase();
          return searchable.includes(query);
        });
        return {
          content: [
            {
              type: "text",
              text:
                matches.length > 0
                  ? JSON.stringify(matches)
                  : `No publications found matching "${inputStr(input.query)}".`,
            },
          ],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// ─── Tools Index Tools ───────────────────────────────────────────────

/** Static tool data embedded at build time. */
export interface StaticToolData {
  name: string;
  description: string;
  url: string;
  category: string;
}

/**
 * Returns tools-index tools that use static data embedded at build time.
 * Available on every page.
 *
 * @param staticTools - Pre-built tool listing data.
 */
export function getToolsIndexTools(
  staticTools: StaticToolData[],
): WebMCPTool[] {
  return [
    {
      name: "list-available-tools",
      description:
        "List all interactive tools available on the site with their name, description, category, and URL. Works from any page.",
      execute: () => {
        return {
          content: [{ type: "text", text: JSON.stringify(staticTools) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}
