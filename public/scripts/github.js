const USERNAME = "jmrplens";
const REPOS_URL = `https://api.github.com/users/${USERNAME}/repos?sort=updated&per_page=100`;
const USER_URL = `https://api.github.com/users/${USERNAME}`;

let allRepos = [];

// Language Colors
const langColors = {
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

async function fetchProfile() {
  const container = document.getElementById("profile-container");
  if (!container) return;

  try {
    const response = await fetch(USER_URL);
    if (!response.ok) throw new Error("Failed to fetch profile");
    const user = await response.json();

    container.innerHTML = `
            <div class="profile-avatar">
                <img src="${user.avatar_url}" alt="${user.name}" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid var(--color-primary);">
            </div>
            <div class="profile-info">
                <h2 style="margin: 0; font-size: 1.8rem;">${user.name}</h2>
                <a href="${user.html_url}" target="_blank" style="color: var(--color-text-muted); text-decoration: none; margin-bottom: 8px; display: block;">@${user.login}</a>
                <p style="margin-bottom: 16px; max-width: 600px;">${user.bio || "Open Source Enthusiast"}</p>
                
                <div class="profile-stats" style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">
                    <div class="stat">
                        <strong>${user.public_repos}</strong> <span style="color: var(--color-text-muted);">Repositories</span>
                    </div>
                    <div class="stat">
                        <strong>${user.followers}</strong> <span style="color: var(--color-text-muted);">Followers</span>
                    </div>
                    <div class="stat">
                        <strong>${user.following}</strong> <span style="color: var(--color-text-muted);">Following</span>
                    </div>
                </div>

                ${user.location ? `<p style="margin-top: 12px; font-size: 0.9rem; color: var(--color-text-muted);"><i class="fas fa-map-marker-alt"></i> ${user.location}</p>` : ""}
            </div>
        `;
  } catch (error) {
    console.error("Profile fetch error:", error);
    container.innerHTML = `<div class="error">Failed to load profile.</div>`;
  }
}

async function fetchRepos() {
  const container = document.getElementById("repos-container");
  if (!container) return;

  try {
    const response = await fetch(REPOS_URL);
    if (!response.ok) throw new Error("Failed to fetch repos");

    allRepos = await response.json(); // Store for searching
    renderRepos(allRepos);
  } catch (error) {
    console.error(error);
    container.innerHTML = `
            <div class="error">
                <p>Failed to load repositories.</p>
                <a href="https://github.com/${USERNAME}" target="_blank">Visit my GitHub Profile</a>
            </div>
        `;
  }
}

function renderRepos(repos) {
  const container = document.getElementById("repos-container");
  container.innerHTML = "";

  if (repos.length === 0) {
    container.innerHTML =
      '<div class="error">No repositories found matching your search.</div>';
    return;
  }

  // Filter out forks if needed, or keeping them. Let's keep them but maybe mark them?
  // Let's filter out non-public ones just in case? API only returns public usually.

  repos.forEach((repo) => {
    const card = document.createElement("div");
    card.className = "repo-card";

    // Header
    const header = document.createElement("div");
    header.className = "repo-header";

    const title = document.createElement("h3");
    const link = document.createElement("a");
    link.href = repo.html_url;
    link.target = "_blank";
    link.textContent = repo.name;
    title.appendChild(link);
    header.appendChild(title);

    // Description
    const desc = document.createElement("p");
    desc.className = "repo-desc";
    desc.textContent = repo.description || "No description provided.";

    // Meta (Language, Stars, Forks)
    const meta = document.createElement("div");
    meta.className = "repo-meta";

    // Language
    if (repo.language) {
      const langItem = document.createElement("div");
      langItem.className = "meta-item";
      const color = langColors[repo.language] || "#ccc";
      langItem.innerHTML = `<span class="lang-dot" style="background-color: ${color};"></span> ${repo.language}`;
      meta.appendChild(langItem);
    }

    // Stars
    if (repo.stargazers_count > 0) {
      const starItem = document.createElement("div");
      starItem.className = "meta-item";
      starItem.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-star"><path fill="currentColor" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"></path></svg> ${repo.stargazers_count}`;
      meta.appendChild(starItem);
    }

    // Forks
    if (repo.forks_count > 0) {
      const forkItem = document.createElement("div");
      forkItem.className = "meta-item";
      forkItem.innerHTML = `<svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo-forked"><path fill="currentColor" d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 01.75.75v1.628a2.25 2.25 0 11-1.5 0V7.75A2.25 2.25 0 017.25 5.5h-4.5A2.25 2.25 0 01.5 7.75v2.028a2.25 2.25 0 11-1.5 0V7.75A.75.75 0 011.25 7h4.5a.75.75 0 01.75.75v1.628a2.25 2.25 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0zm-3.75 5.75a.75.75 0 100-1.5.75.75 0 000 1.5zm10.5-1.5a.75.75 0 100 1.5.75.75 0 000-1.5z"></path></svg> ${repo.forks_count}`;
      meta.appendChild(forkItem);
    }

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(meta);
    container.appendChild(card);
  });
}

function initSearch() {
  const searchInput = document.getElementById("repo-search");
  if (!searchInput) return;

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allRepos.filter(
      (repo) =>
        repo.name.toLowerCase().includes(term) ||
        (repo.description && repo.description.toLowerCase().includes(term)),
    );
    renderRepos(filtered);
  });
}

// Init
document.addEventListener("astro:page-load", () => {
  fetchProfile();
  fetchRepos();
  initSearch();
});

// Initial load fallback for non-SPA
if (document.readyState === "complete" || document.readyState === "interactive") {
  fetchProfile();
  fetchRepos();
  initSearch();
} else {
  document.addEventListener("DOMContentLoaded", () => {
    fetchProfile();
    fetchRepos();
    initSearch();
  });
}
