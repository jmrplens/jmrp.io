function setupMobileMenu() {
  const menuToggle = document.getElementById("menu-toggle");
  const navLinks = document.getElementById("nav-links");

  // Create backdrop if it doesn't exist
  let backdrop = document.querySelector(".menu-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.classList.add("menu-backdrop");
    document.body.appendChild(backdrop);
  }

  if (menuToggle && navLinks && backdrop) {
    const closeMenu = () => {
      menuToggle.setAttribute("aria-expanded", "false");
      navLinks.classList.remove("open");
      backdrop.classList.remove("open");
      document.body.classList.remove("menu-open");
    };

    const toggleMenu = () => {
      const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        closeMenu();
      } else {
        menuToggle.setAttribute("aria-expanded", "true");
        navLinks.classList.add("open");
        backdrop.classList.add("open");
        document.body.classList.add("menu-open");
      }
    };

    // Toggle menu
    menuToggle.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent immediate close from document click
      toggleMenu();
    });

    // Close when clicking the backdrop
    backdrop.addEventListener("click", closeMenu);

    // Close menu when a link is clicked
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    // Keydown (Escape) to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && navLinks.classList.contains("open")) {
        closeMenu();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", setupMobileMenu);
document.addEventListener("astro:after-swap", setupMobileMenu);
