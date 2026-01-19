# CV Compilation (LaTeX)

This directory contains the source code for generating the Curriculum Vitae in both English and Spanish using LaTeX. **XeLaTeX is the recommended engine** due to better font handling. LuaLaTeX is also supported but may require additional font configuration.

## Prerequisites

To compile these documents, you need a standard TeX Live installation with specific packages.

### System Dependencies (Debian/Ubuntu)

```bash
# Core TeX Live packages
sudo apt-get install texlive-xetex texlive-luatex texlive-science texlive-latex-extra texlive-fonts-extra

# Bibliography management
sudo apt-get install biber

# Language packs for hyphenation and localization
# - texlive-lang-spanish: REQUIRED to avoid babel errors when compiling Spanish CVs
# - texlive-lang-english: Usually pre-installed in most TeX distributions, but included for completeness
sudo apt-get install texlive-lang-spanish texlive-lang-english
```

**Note**: Missing `texlive-lang-spanish` will cause `babel` errors during Spanish CV compilation. The English language pack is typically included by default but is listed here to ensure complete installation.

## How to Compile

A helper script is provided to compile both versions and move them to the public directory.

```bash
# Make sure the script is executable
chmod +x compile_cv.sh

# Run the compilation from the project root or this directory
./cv_latex/compile_cv.sh
```

### Manual Compilation

If you need to compile manually (useful for debugging):

```bash
cd cv_latex

# Using XeLaTeX (recommended):
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
biber CV_RequenaPlensJoseManuel_SPA
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex

# Alternative: Using LuaLaTeX (if preferred):
# lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
# biber CV_RequenaPlensJoseManuel_SPA
# lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
# lualatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
```

**Why multiple LaTeX runs?** LaTeX requires multiple passes to resolve cross-references, table of contents, and bibliography entries. The first run identifies references, Biber processes the bibliography, and subsequent runs incorporate the resolved data.

## Directory Structure

- `resources/`: Contains classes (`altacv.cls`), bibliography (`papers.bib`), fonts, and images.
- `CV_*.tex`: The main source files for English and Spanish versions.
