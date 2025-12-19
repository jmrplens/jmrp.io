function initPublications() {
    const handleAbstracts = (selector, idPrefix) => {
        document.querySelectorAll(selector).forEach((btn) => {
            btn.onclick = (e) => {
                e.preventDefault();
                const id = e.currentTarget.dataset.id;
                const element = document.getElementById(`${idPrefix}-${id}`);
                if (element) {
                    element.classList.toggle("hidden");
                }
            };
        });
    };

    handleAbstracts(".btn-abstract", "abstract");
    handleAbstracts(".btn-bibtex-toggle", "bibtex");

    const feedback = document.getElementById("bibtex-feedback");
    document.querySelectorAll(".btn-copy-bibtex").forEach((btn) => {
        btn.onclick = async (e) => {
            e.preventDefault();
            const bibtex = e.currentTarget.dataset.bibtex;
            if (bibtex) {
                try {
                    await navigator.clipboard.writeText(bibtex);
                    if (feedback) {
                        feedback.classList.remove("hidden");
                        feedback.classList.add("show");
                        setTimeout(() => {
                            feedback.classList.remove("show");
                            feedback.classList.add("hidden");
                        }, 2000);
                    }
                } catch (err) {
                    console.error("Failed to copy bibtex", err);
                }
            }
        };
    });
}

document.addEventListener("astro:page-load", initPublications);
document.addEventListener("DOMContentLoaded", initPublications);
