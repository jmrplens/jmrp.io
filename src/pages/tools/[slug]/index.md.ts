import { toolMarkdownRoute } from "@utils/llms/markdown-route";

/**
 * `/tools/<slug>/index.md` — the English markdown twin of every tool page.
 *
 * The spec asks for a clean markdown version "at the same URL as the original
 * page"; these pages have no file name, so `index.md` is the form that
 * applies. Publishing them is what lets `llms-full.txt` link to a tool's
 * documentation instead of carrying it: the 34 bodies were 82.5% of that file.
 */
export const { getStaticPaths, GET } = toolMarkdownRoute("en");
