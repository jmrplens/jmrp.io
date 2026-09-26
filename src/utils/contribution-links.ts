/**
 * Links and references for contribution items that may live on GitHub or on
 * GitLab.com: one place builds every repository, pull request, merge request
 * and issue URL that `/projects/`, `/projects/contributions/` and their
 * markdown twins print, so the two platforms can never drift apart.
 *
 * @module
 */

/** Where a contribution lives. */
export type Platform = "github" | "gitlab";

const ORIGIN: Record<Platform, string> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

/**
 * Narrows an optional platform field (older fixtures carry none) to a
 * {@link Platform}; anything but `"gitlab"` is GitHub.
 *
 * @param platform - The raw field.
 * @returns The platform.
 */
export function platformOf(platform: string | null | undefined): Platform {
  return platform === "gitlab" ? "gitlab" : "github";
}

/**
 * A repository's (GitHub `owner/repo`) or project's (GitLab full path) URL.
 *
 * @param fullName - `owner/repo` or GitLab full path.
 * @param platform - Where it lives.
 * @returns The URL.
 */
export function repoUrl(
  fullName: string,
  platform: string | null | undefined = "github",
): string {
  return `${ORIGIN[platformOf(platform)]}/${fullName}`;
}

/** The fields every contribution item carries that its URL depends on. */
export interface ContributionRef {
  readonly fullName: string;
  readonly number: number;
  readonly kind: "pull_request" | "issue";
  readonly platform?: string | null;
}

/**
 * A pull request, merge request or issue URL: `/pull/N` and `/issues/N` on
 * GitHub, `/-/merge_requests/N` and `/-/issues/N` on GitLab.
 *
 * @param item - The item.
 * @returns The URL.
 */
export function itemUrl(item: ContributionRef): string {
  const base = repoUrl(item.fullName, item.platform);
  if (platformOf(item.platform) === "gitlab") {
    return `${base}/-/${item.kind === "issue" ? "issues" : "merge_requests"}/${item.number}`;
  }
  return `${base}/${item.kind === "issue" ? "issues" : "pull"}/${item.number}`;
}

/**
 * The platform's own reference for an item: `!N` for a GitLab merge
 * request, `#N` for everything else.
 *
 * @param item - The item.
 * @returns The reference.
 */
export function itemRef(item: Omit<ContributionRef, "fullName">): string {
  const sigil =
    platformOf(item.platform) === "gitlab" && item.kind === "pull_request"
      ? "!"
      : "#";
  return `${sigil}${item.number}`;
}
