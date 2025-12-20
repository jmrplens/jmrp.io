function initPublications() {
  const handleAbstracts = (selector, idPrefix) => {
    document.querySelectorAll(selector).forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = e.currentTarget.dataset.id;
        const element = document.getElementById(`${idPrefix}-${id}`);
        if (element) {
          const isHidden = element.classList.toggle("hidden");
          e.currentTarget.setAttribute("aria-expanded", !isHidden);
        }
      };
    });
  };

  handleAbstracts(".btn-abstract", "abstract");
  handleAbstracts(".btn-bibtex-toggle", "bibtex");
}

document.addEventListener("astro:page-load", initPublications);
document.addEventListener("DOMContentLoaded", initPublications);
