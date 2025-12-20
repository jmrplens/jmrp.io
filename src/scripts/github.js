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

    container.innerHTML = ""; // Clear loading

    // Avatar Wrapper
    const avatarDiv = document.createElement("div");
    avatarDiv.className = "profile-avatar";
    const img = document.createElement("img");
    img.src = container.dataset.avatarUrl || "/img/github-avatar.png"; // Use passed URL or fallback
    img.alt = user.name;
    // Classes handle styling now
    avatarDiv.appendChild(img);
    container.appendChild(avatarDiv);

    // Profile Info Wrapper
    const infoDiv = document.createElement("div");
    infoDiv.className = "profile-info";

    // Name
    const name = document.createElement("h2");
    name.textContent = user.name;
    infoDiv.appendChild(name);

    // Username
    const usernameLink = document.createElement("a");
    usernameLink.href = user.html_url;
    usernameLink.target = "_blank";
    usernameLink.className = "username";
    usernameLink.textContent = `@${user.login}`;
    infoDiv.appendChild(usernameLink);

    // Bio
    const bio = document.createElement("p");
    bio.className = "bio";
    bio.textContent = user.bio || "Open Source Enthusiast";
    infoDiv.appendChild(bio);

    // Stats
    const statsDiv = document.createElement("div");
    statsDiv.className = "profile-stats";

    const stats = [
      { label: "Repositories", value: user.public_repos },
      { label: "Followers", value: user.followers },
      { label: "Following", value: user.following },
    ];

    stats.forEach((stat) => {
      const statDiv = document.createElement("div");
      statDiv.className = "stat";
      const strong = document.createElement("strong");
      strong.textContent = stat.value;
      const span = document.createElement("span");
      span.textContent = ` ${stat.label}`;
      statDiv.appendChild(strong);
      statDiv.appendChild(span);
      statsDiv.appendChild(statDiv);
    });
    infoDiv.appendChild(statsDiv);

    // Location
    if (user.location) {
      const locP = document.createElement("p");
      locP.className = "location";
      // SVG icon for location
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("height", "16");
      svg.setAttribute("width", "16");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("fill", "currentColor");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute(
        "d",
        "M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z",
      );
      svg.appendChild(path);

      locP.appendChild(svg);
      locP.appendChild(document.createTextNode(` ${user.location}`));
      infoDiv.appendChild(locP);
    }

    container.appendChild(infoDiv);
  } catch (error) {
    console.error("Failed to fetch GitHub profile:", error);
    container.innerHTML = "";
    const errDiv = document.createElement("div");
    errDiv.className = "error";
    errDiv.textContent = "Failed to load profile.";
    container.appendChild(errDiv);
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
    console.error("Failed to fetch GitHub repositories:", error);
    container.innerHTML = "";
    const errDiv = document.createElement("div");
    errDiv.className = "error";
    const p = document.createElement("p");
    p.textContent = "Failed to load repositories.";
    errDiv.appendChild(p);

    const a = document.createElement("a");
    a.href = `https://github.com/${USERNAME}`;
    a.target = "_blank";
    a.textContent = "Visit my GitHub Profile";
    errDiv.appendChild(a);
    container.appendChild(errDiv);
  }
}

function renderRepos(repos) {
  const container = document.getElementById("repos-container");
  container.innerHTML = "";

  if (repos.length === 0) {
    const errDiv = document.createElement("div");
    errDiv.className = "error";
    errDiv.textContent = "No repositories found matching your search.";
    container.appendChild(errDiv);
    return;
  }

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

      const dot = document.createElement("span");
      dot.className = "lang-dot";
      const color = langColors[repo.language] || "#ccc";
      // This is the only "inline style", but setting property via JS is usually allowed.
      // If stricter CSP is needed, we'd need a whitelist class system, but this is a standard pattern.
      dot.style.backgroundColor = color;

      langItem.appendChild(dot);
      langItem.appendChild(document.createTextNode(` ${repo.language}`));
      meta.appendChild(langItem);
    }

    // Stars
    if (repo.stargazers_count > 0) {
      const starItem = document.createElement("div");
      starItem.className = "meta-item";
      // SVG creation
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "16");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("fill", "currentColor");
      path.setAttribute(
        "d",
        "M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z",
      );
      svg.appendChild(path);

      starItem.appendChild(svg);
      starItem.appendChild(
        document.createTextNode(` ${repo.stargazers_count}`),
      );
      meta.appendChild(starItem);
    }

    // Forks
    if (repo.forks_count > 0) {
      const forkItem = document.createElement("div");
      forkItem.className = "meta-item";
      // SVG creation
      const svgNS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("width", "16");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("fill", "currentColor");
      path.setAttribute(
        "d",
        "M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 01.75.75v1.628a2.25 2.25 0 11-1.5 0V7.75A2.25 2.25 0 017.25 5.5h-4.5A2.25 2.25 0 01.5 7.75v2.028a2.25 2.25 0 11-1.5 0V7.75A.75.75 0 011.25 7h4.5a.75.75 0 01.75.75v1.628a2.25 2.25 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0zm-3.75 5.75a.75.75 0 100-1.5.75.75 0 000 1.5zm10.5-1.5a.75.75 0 100 1.5.75.75 0 000-1.5z",
      );
      svg.appendChild(path);

      forkItem.appendChild(svg);
      forkItem.appendChild(document.createTextNode(` ${repo.forks_count}`));
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
        repo.description?.toLowerCase().includes(term),
    );
    renderRepos(filtered);
  });
}

// Init
async function init() {
  await fetchProfile();
  await fetchRepos();
  initSearch();
}

// 1. Run immediately (Top-Level Await in module)
await init();

// 2. Future-proofing for View Transitions (if added later)
document.addEventListener("astro:page-load", () => {
  // If standard load already ran, this might conflict if ViewTransitions are mistakenly thought to be active
  // But strictly speaking, astro:page-load only fires if the router is integrated.
  // We can leave it as a safe fallback or remove it.
  // The user code existing had it.
  // We'll trust TLA for the main load.
});
