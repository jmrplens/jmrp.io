# CV Compilation (LaTeX)

This directory contains the source code for generating the Curriculum Vitae in both English and Spanish using LaTeX (LuaLaTeX/XeLaTeX).

## Prerequisites

To compile these documents, you need a standard TeX Live installation with specific packages.

### System Dependencies (Debian/Ubuntu)

```bash
# Core TeX Live packages
sudo apt-get install texlive-xetex texlive-luatex texlive-science texlive-latex-extra texlive-fonts-extra

# Bibliography management
sudo apt-get install biber

# **CRITICAL**: Language packs for hyphenation and localization
sudo apt-get install texlive-lang-spanish texlive-lang-english
```

**Note**: The lack of `texlive-lang-spanish` will cause `babel` errors during the Spanish CV compilation.

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

# 1. First pass (generates auxiliary files)
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex

# 2. Process bibliography
biber CV_RequenaPlensJoseManuel_SPA

# 3. Second & Third pass (resolves references and layout)
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
xelatex -interaction=nonstopmode CV_RequenaPlensJoseManuel_SPA.tex
```

## Directory Structure

- `resources/`: Contains classes (`altacv.cls`), bibliography (`papers.bib`), fonts, and images.
- `CV_*.tex`: The main source files for English and Spanish versions.
