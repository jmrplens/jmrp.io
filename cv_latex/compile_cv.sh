#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Determine script directory for relative paths
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

# Configuration (env vars can override these defaults)
# Default: LaTeX sources in the same directory as this script
LATEX_DIR="${LATEX_DIR:-$SCRIPT_DIR}"
# Default: output PDF directory as ../public/pdf relative to this script
OUTPUT_DIR="${OUTPUT_DIR:-"$SCRIPT_DIR/../public/pdf"}"
FILES=("CV_RequenaPlensJoseManuel_ENG" "CV_RequenaPlensJoseManuel_SPA")

cd "$LATEX_DIR" || exit 1

# Ensure public/pdf exists
mkdir -p "$OUTPUT_DIR"

compile_latex() {
    local filename=$1
    echo "Compiling $filename..."
    
    # Run xelatex (first pass)
    if ! xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null 2>&1; then
        echo "  ✗ Error: xelatex first pass failed for ${filename}"
        return 1
    fi
    
    # Run biber for bibliography
    if ! biber "$filename" > /dev/null 2>&1; then
        echo "  ✗ Error: biber failed for ${filename}"
        return 1
    fi
    
    # Run xelatex (multiple passes for references/layout)
    xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null 2>&1
    xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null 2>&1
    
    # Move to public directory
    if [ -f "${filename}.pdf" ]; then
        mv "${filename}.pdf" "$OUTPUT_DIR/"
        echo "  ✓ Generated and moved ${filename}.pdf to $OUTPUT_DIR"
    else
        echo "  ✗ Error: ${filename}.pdf was not generated."
        return 1
    fi
}

# Clean previous temp files
# Note: This removes temporary LaTeX files and specific target PDFs before compilation
rm -f *.aux *.log *.out *.toc *.bbl *.blg *.run.xml *.bcf
rm -f CV_RequenaPlensJoseManuel_ENG.pdf CV_RequenaPlensJoseManuel_SPA.pdf

# Compile all files
for file in "${FILES[@]}"; do
    compile_latex "$file"
done

# Final cleanup of temporary LaTeX files
echo "Cleaning up temporary files..."
rm -f *.aux *.log *.out *.toc *.bbl *.blg *.run.xml *.bcf

echo "CV compilation process completed."