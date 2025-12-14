async function fetchRepos() {
  const container = document.getElementById("repos-container");
  if (!container) return;

  try {
    const response = await fetch(
      "https://api.github.com/users/jmrplens/repos?sort=updated&per_page=12",
    );
    if (!response.ok) throw new Error("Failed to fetch");

    const repos = await response.json();

    // Clear loading state
    container.textContent = "";

    repos.forEach((repo) => {
      const card = document.createElement("div");
      card.className = "repo-card";

      const header = document.createElement("div");
      header.className = "repo-header";

      const title = document.createElement("h3");
      const link = document.createElement("a");
      link.href = repo.html_url;
      link.target = "_blank";
      link.textContent = repo.name;
      title.appendChild(link);
      header.appendChild(title);

      if (repo.stargazers_count > 0) {
        const stars = document.createElement("span");
        stars.className = "stars";
        // SVG creation
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", "1em");
        svg.setAttribute("height", "1em");
        svg.setAttribute("viewBox", "0 0 576 512");
        const path = document.createElementNS(svgNS, "path");
        path.setAttribute("fill", "currentColor");
        path.setAttribute(
          "d",
          "M316.9 18C311.6 7 300.4 0 288.1 0s-23.4 7-28.8 18L195 150.3 51.4 171.5c-12 1.8-22 10.2-25.7 21.7s-.7 24.2 7.9 32.7L137.8 329 113.2 474.7c-2 12 3 24.2 12.9 31.3s23 8 33.8 2.3l128.3-68.5 128.3 68.5c10.8 5.7 23.9 4.9 33.8-2.3s14.9-19.3 12.9-31.3L438.5 329 542.7 225.9c8.6-8.5 11.7-21.2 7.9-32.7s-13.7-19.9-25.7-21.7L381.2 150.3 316.9 18z",
        );
        svg.appendChild(path);
        stars.appendChild(svg);
        stars.append(` ${repo.stargazers_count}`);
        header.appendChild(stars);
      }

      const desc = document.createElement("p");
      desc.className = "repo-desc";
      desc.textContent = repo.description || "No description available.";

      const meta = document.createElement("div");
      meta.className = "repo-meta";

      if (repo.language) {
        const lang = document.createElement("span");
        lang.className = "lang-badge";
        lang.textContent = repo.language;
        meta.appendChild(lang);
      }

      const updated = document.createElement("span");
      updated.className = "updated";
      updated.textContent = `Updated: ${new Date(repo.updated_at).toLocaleDateString()}`;
      meta.appendChild(updated);

      card.appendChild(header);
      card.appendChild(desc);
      card.appendChild(meta);

      container.appendChild(card);
    });
  } catch (error) {
    if (container) {
      // Safe error fallback
      container.textContent = "";
      const errorMsg = document.createElement("p");
      errorMsg.className = "error";
      errorMsg.textContent = "Failed to load repositories. Please check my ";
      const link = document.createElement("a");
      link.href = "https://github.com/jmrplens";
      link.textContent = "GitHub profile";
      errorMsg.appendChild(link);
      errorMsg.append(" directly.");
      container.appendChild(errorMsg);
    }
    console.error(error);
  }
}

// Run on load
fetchRepos();
document.addEventListener("astro:page-load", fetchRepos);
