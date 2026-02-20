/**
 * WebMCP Tools Catalog
 *
 * Defines all WebMCP tool definitions for the site, organized by context.
 * Tools are pure data definitions (name, description, inputSchema, annotations)
 * paired with execute callbacks that operate on the client-side DOM/APIs.
 *
 * Tool categories:
 * - **Site tools**: Available on every page (theme, navigation, page info)
 * - **Blog tools**: Available on /blog/* pages
 * - **CV tools**: Available on /cv page
 * - **Publications tools**: Available on /publications page
 * - **Tools-index tools**: Available on /tools/* pages
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

/**
 * Returns tools available on blog pages (/blog/*).
 * These allow agents to search and list blog posts from the rendered DOM.
 */
export function getBlogTools(): WebMCPTool[] {
  return [
    {
      name: "list-blog-posts",
      description:
        "List all blog posts visible on the current page with their title, URL, date, tags, and description.",
      execute: () => {
        const articles = [...document.querySelectorAll("article.post-card")];
        const posts = articles.map((article) => {
          const link = article.querySelector(
            "a.main-link, h2 a[href], h3 a[href]",
          );
          const time = article.querySelector("time");
          const tags = [...article.querySelectorAll(".tags a.tag")].map((t) =>
            (t.textContent?.trim() ?? "").replace(/^#/, ""),
          );
          const desc =
            article
              .querySelector(".description, .card-description, p")
              ?.textContent?.trim() ?? "";
          return {
            title:
              link?.textContent?.trim() ??
              article.querySelector("h2, h3")?.textContent?.trim() ??
              "",
            url: link?.getAttribute("href") ?? "",
            date:
              time?.getAttribute("datetime") ?? time?.textContent?.trim() ?? "",
            tags,
            description: desc,
          };
        });
        return {
          content: [{ type: "text", text: JSON.stringify(posts) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "search-blog-posts",
      description:
        "Search blog posts by keyword in title and description. Returns matching posts from the current page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search keyword to match against post titles and descriptions",
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
        const articles = [...document.querySelectorAll("article.post-card")];
        const matches = articles
          .filter((article) => {
            const text = article.textContent?.toLowerCase() ?? "";
            return text.includes(query);
          })
          .map((article) => {
            const link = article.querySelector(
              "a.main-link, h2 a[href], h3 a[href]",
            );
            return {
              title:
                link?.textContent?.trim() ??
                article.querySelector("h2, h3")?.textContent?.trim() ??
                "",
              url: link?.getAttribute("href") ?? "",
            };
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
        "Get all unique blog post tags available on the current page.",
      execute: () => {
        // Extract tag names from the tag cloud sidebar (.tag-cloud .tag-name)
        // or from post card tag links (article.post-card .tags a.tag)
        const tagNames: string[] = [];
        // Prefer tag cloud: has all tags with proper names
        const cloudTags = document.querySelectorAll(".tag-cloud .tag-name");
        if (cloudTags.length > 0) {
          cloudTags.forEach((el) => {
            const name = el.textContent?.trim().replace(/^#\s*/, "") ?? "";
            if (name) tagNames.push(name);
          });
        } else {
          // Fallback: extract from post card tags
          document
            .querySelectorAll("article.post-card .tags a.tag")
            .forEach((el) => {
              const name = el.textContent?.trim().replace(/^#/, "") ?? "";
              if (name) tagNames.push(name);
            });
        }
        const unique = [...new Set(tagNames)].filter(Boolean);
        return {
          content: [{ type: "text", text: JSON.stringify(unique) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// ─── CV Tools ────────────────────────────────────────────────────────

/**
 * Returns tools available on the CV page (/cv).
 * These extract structured CV data from the rendered DOM.
 */
export function getCVTools(): WebMCPTool[] {
  return [
    {
      name: "get-cv-summary",
      description:
        "Get a summary of the CV/resume including name, job title, and all section headings.",
      execute: () => {
        // The h1 is "Curriculum Vitae", the actual name is in General Information
        // CV uses .map-key / .map-value pairs inside .cv-map
        const generalSection = document.querySelector(
          ".cv-section#general-information",
        );
        const mapItems = generalSection?.querySelectorAll(".map-item") ?? [];
        let name = "";
        for (const item of mapItems) {
          const key = item.querySelector(".map-key")?.textContent?.trim() ?? "";
          if (key.startsWith("Full Name")) {
            name = item.querySelector(".map-value")?.textContent?.trim() ?? "";
            break;
          }
        }
        if (!name) {
          name = document.querySelector("h1")?.textContent?.trim() ?? "";
        }
        const sections = [...document.querySelectorAll(".cv-section")]
          .map((s) => s.querySelector("h2")?.textContent?.trim() ?? "")
          .filter(Boolean);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name, sections }),
            },
          ],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "get-cv-section",
      description:
        "Get the content of a specific CV section by its heading name (e.g. 'Experience', 'Education', 'Skills', 'Certifications').",
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
        // CV uses .cv-section containers with h2 inside .section-header
        const cvSections = [...document.querySelectorAll(".cv-section")];
        const section = cvSections.find((s) =>
          s
            .querySelector("h2")
            ?.textContent?.trim()
            .toLowerCase()
            .includes(sectionName),
        );
        if (!section) {
          const available = cvSections
            .map((s) => s.querySelector("h2")?.textContent?.trim())
            .filter(Boolean);
          return {
            content: [
              {
                type: "text",
                text: `Section "${inputStr(input.section)}" not found. Available sections: ${available.join(", ")}`,
              },
            ],
          };
        }
        // Extract content from everything after the section-header
        const contents: string[] = [];
        for (const child of section.children) {
          if (child.classList.contains("section-header")) continue;
          const text = child.textContent?.trim() ?? "";
          if (text) contents.push(text);
        }
        return {
          content: [{ type: "text", text: contents.join("\n") }],
        };
      },
      annotations: { readOnlyHint: true },
    },
  ];
}

// ─── Publications Tools ──────────────────────────────────────────────

/**
 * Returns tools available on the publications page (/publications).
 */
export function getPublicationsTools(): WebMCPTool[] {
  return [
    {
      name: "list-publications",
      description:
        "List all academic publications on the page with title, authors, year, and venue.",
      execute: () => {
        const items = [...document.querySelectorAll(".publication-item")].map(
          (el) => ({
            title:
              el.querySelector(".pub-title, h3, h4")?.textContent?.trim() ?? "",
            authors:
              el.querySelector(".pub-authors")?.textContent?.trim() ?? "",
            year: el.querySelector(".pub-year")?.textContent?.trim() ?? "",
            venue: el.querySelector(".pub-venue")?.textContent?.trim() ?? "",
          }),
        );
        return {
          content: [{ type: "text", text: JSON.stringify(items) }],
        };
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "search-publications",
      description:
        "Search publications by keyword in title, authors, or venue.",
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
        const items = [...document.querySelectorAll(".publication-item")]
          .filter((el) => (el.textContent?.toLowerCase() ?? "").includes(query))
          .map((el) => ({
            title:
              el.querySelector(".pub-title, h3, h4")?.textContent?.trim() ?? "",
            authors:
              el.querySelector(".pub-authors")?.textContent?.trim() ?? "",
          }));
        return {
          content: [
            {
              type: "text",
              text:
                items.length > 0
                  ? JSON.stringify(items)
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

/**
 * Returns tools available on the tools index page (/tools/).
 */
export function getToolsIndexTools(): WebMCPTool[] {
  return [
    {
      name: "list-available-tools",
      description:
        "List all interactive tools available on the site with their name, description, and URL. Fetches from the .well-known/webmcp.json manifest.",
      execute: async () => {
        try {
          const res = await fetch("/.well-known/webmcp.json");
          if (!res.ok) throw new Error("HTTP " + res.status);
          const manifest = await res.json();
          const tools = (manifest.tools || []).map(
            (t: Record<string, unknown>) => ({
              name: t.name ?? "",
              description: t.description ?? "",
              url: (t.annotations as Record<string, unknown>)?.url ?? "",
            }),
          );
          return {
            content: [{ type: "text", text: JSON.stringify(tools) }],
          };
        } catch {
          // Fallback: scrape tool cards from DOM (works on /tools/ index page)
          const toolCards = [
            ...document.querySelectorAll(
              "[data-tool-card], .tool-card, article a[href*='/tools/']",
            ),
          ];
          const tools = toolCards.map((card) => {
            const link =
              card.closest("a[href]") ?? card.querySelector("a[href]");
            return {
              name:
                card
                  .querySelector("h2, h3, .tool-title")
                  ?.textContent?.trim() ??
                card.textContent?.trim() ??
                "",
              url: link?.getAttribute("href") ?? "",
              description:
                card
                  .querySelector(".tool-description, p")
                  ?.textContent?.trim() ?? "",
            };
          });
          return {
            content: [{ type: "text", text: JSON.stringify(tools) }],
          };
        }
      },
      annotations: { readOnlyHint: true },
    },
  ];
}
