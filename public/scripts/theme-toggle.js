const initThemeToggle = () => {
  const toggle = document.getElementById("theme-toggle");

  const getTheme = () => {
    if (typeof localStorage !== "undefined" && localStorage.getItem("theme")) {
      return localStorage.getItem("theme");
    }
    if (globalThis.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark"; // Default
  };

  const setTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);

    // Also toggle global class for older css usage if any
    if (theme === "light") {
      document.documentElement.classList.add("light-mode");
      document.documentElement.classList.remove("dark-mode");
    } else {
      document.documentElement.classList.add("dark-mode");
      document.documentElement.classList.remove("light-mode");
    }

    // Update aria-label
    if (toggle) {
      const label =
        theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
      toggle.setAttribute("aria-label", label);
    }
  };

  // Initialize state based on current theme
  if (toggle) {
    const currentTheme = getTheme();
    const label =
      currentTheme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode";
    toggle.setAttribute("aria-label", label);

    // Remove old listeners to prevent duplicates if re-running (though this script runs once per page load usually, Astro view transitions might require care)
    // Actually, strictly speaking, we are adding new listeners on every swap.
    // Better to use a named function or cloning, but for this simple case, ensure we don't bind multiple times if the element is replaced.
    // Since Astro replaces the body/head, element references change.

    toggle.onclick = () => {
      const currentTheme = getTheme();
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      setTheme(newTheme);
    };
  }
};

document.addEventListener("DOMContentLoaded", initThemeToggle);
document.addEventListener("astro:after-swap", initThemeToggle);
