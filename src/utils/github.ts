export interface GitHubRepo {
  id: number;
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
}

export interface GitHubProfile {
  name: string;
  login: string;
  bio: string | null;
  html_url: string;
  avatar_url: string;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

const USERNAME = "jmrplens";
const GITHUB_TOKEN = import.meta.env.GITHUB_TOKEN; // Optional, for rate limits

export async function fetchGitHubProfile(): Promise<GitHubProfile> {
  const headers: HeadersInit = {};
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  const res = await fetch(`https://api.github.com/users/${USERNAME}`, {
    headers,
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

export async function fetchTopRepositories(limit = 12): Promise<GitHubRepo[]> {
  const headers: HeadersInit = {};
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  const res = await fetch(
    `https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=${limit}`,
    { headers },
  );

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status}`);
  }

  return res.json();
}

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
