# CV Compilation (LaTeX)

Every CV PDF is **generated from a single source of truth** —
`src/content/cv/{es,en}.yaml` plus `src/content/publications_data/papers.bib` —
and compiled with **LuaLaTeX**. There are no hand-authored `.tex` documents any
more: the two AltaCV files were replaced in 2026-08 by a generated sidebar
layout after they drifted from the YAML (a missing job, stale figures).

| Output (public/pdf/)           | Layout                                    | Generator                        |
| ------------------------------ | ----------------------------------------- | -------------------------------- |
| `CV_..._{ENG,SPA}.pdf`         | Design: sidebar/paracol, brand typography | `scripts/cv/generate-design.mjs` |
| `CV_..._{ENG,SPA}_ATS.pdf`     | ATS concise, single column                | `scripts/cv/generate-ats.mjs`    |
| `CV_..._{ENG,SPA}_ATS_EXT.pdf` | ATS exhaustive (all jobs + publications)  | `scripts/cv/generate-ats.mjs`    |

## Prerequisites

```bash
sudo apt-get install texlive-luatex texlive-latex-extra texlive-fonts-extra \
  texlive-lang-spanish texlive-lang-english
```

Fonts: IBM Plex Sans/Mono come from TeX Live (loaded **by filename** — the
family-name lookup silently drops bold runs); Space Grotesk and Inter are
vendored in `resources/fonts/` with their OFL licenses. Inter must stay the
**TrueType** build: the system OTF/CFF cut (2048 upem) breaks commercial resume
parsers — see `scripts/cv/verify-ats.mjs`, which pins this.

## How to Compile

```bash
pnpm build:cv           # content-hash cached; skips if nothing changed
pnpm build:cv --force   # full recompilation
# or directly:
bash cv_latex/compile_cv.sh
```

The script regenerates every `.tex` into `generated/` (git-ignored) and
compiles each with two lualatex passes. No biber: the design CV renders its
publications directly from `papers.bib` via citation-js at generation time.

### Private set (phone number)

With `CV_PHONE` set in `.env` (git-ignored), a second pass rebuilds all six
PDFs with the phone into `cv_private/` — same filenames, whole directory
git-ignored, for hand-uploads to job portals. Without the variable (fresh
clone, CI) that pass simply does not run and the public set needs no secret.

## Directory Structure

- `compile_cv.sh` — build script (generate → lualatex ×2 → move to public/pdf)
- `generated/` — generated `.tex` sources (git-ignored, never edit)
- `resources/fonts/` — vendored Inter + Space Grotesk (TTF) + licenses
- `resources/foto.jpeg` — photo used by the design layout

## Verification

`scripts/cv/verify-ats.mjs` (dist phase of `pnpm verify`) checks: text layer,
sections, contacts, keyword coverage, an ATS score floor, **font pinning**
(vendored glyf TrueType only) and the **design page budget** (both sidebar CVs
within 3 pages — page-count growth is the symptom of the half-empty-page
layout regression class).
