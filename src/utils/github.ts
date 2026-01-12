/**
 * Represents a simplified GitHub repository object.
 */
export interface GitHubRepo {
  /** Unique identifier for the repository. */
  id: number;
  /** Name of the repository. */
  name: string;
  /** Repository description, if any. */
  description: string | null;
  /** URL to the repository on GitHub. */
  html_url: string;
  /** Primary programming language used. */
  language: string | null;
  /** Number of stars (stargazers). */
  stargazers_count: number;
  /** Number of forks. */
  forks_count: number;
  /** ISO 8601 timestamp of the last update. */
  updated_at: string;
}

/**
 * Represents a simplified GitHub user profile.
 */
export interface GitHubProfile {
  /** User's full name. */
  name: string;
  /** User's username (handle). */
  login: string;
  /** User's biography, if any. */
  bio: string | null;
  /** URL to the user's profile on GitHub. */
  html_url: string;
  /** URL to the user's avatar image. */
  avatar_url: string;
  /** User's geographic location. */
  location: string | null;
  /** Number of public repositories. */
  public_repos: number;
  /** Number of followers. */
  followers: number;
  /** Number of users following. */
  following: number;
}

const USERNAME = "jmrplens";
const GITHUB_TOKEN: string | undefined = import.meta.env.GITHUB_TOKEN as
  | string
  | undefined; // Optional, for rate limits

/**
 * Fetches the public GitHub profile data for the configured user.
 * Implements a fallback to local data if the API is unreachable or rate-limited.
 */
export async function fetchGitHubProfile(): Promise<GitHubProfile> {
  const headers: HeadersInit = {};
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(`https://api.github.com/users/${USERNAME}`, {
      headers,
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    return (await res.json()) as GitHubProfile;
  } catch (error) {
    console.warn("Failed to fetch GitHub profile, using fallback data:", error);
    return {
      name: "José Manuel Requena Plens",
      login: USERNAME,
      bio: "R&D Engineer | Embedded Systems & Acoustics | Software Engineer",
      html_url: `https://github.com/${USERNAME}`,
      avatar_url: "/github-avatar.png", // Fallback to local asset
      location: "Valencia, Spain",
      public_repos: 0,
      followers: 0,
      following: 0,
    };
  }
}

/**
 * Fetches the top repositories for the configured user, sorted by last update.
 */
export async function fetchTopRepositories(limit = 12): Promise<GitHubRepo[]> {
  const headers: HeadersInit = {};
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=${limit}`,
      { headers },
    );

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    return (await res.json()) as GitHubRepo[];
  } catch (error) {
    console.warn("Failed to fetch GitHub repos, using empty list:", error);
    return [];
  }
}

/**
 * Map of programming languages to their representative Hex colors.
 */
export const langColors: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#2b7489",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Python: "#3572A5",
  "C++": "#f34b7d",
  C: "#555555",
  Java: "#b07219",
  Shell: "#89e051",
  Astro: "#ff5a03",
  Vue: "#41b883",
  React: "#61dafb",
  Dart: "#00B4AB",
  Go: "#00ADD8",
  Rust: "#dea584",
  PHP: "#4F5D95",
};
