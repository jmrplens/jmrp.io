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
# AltaCV (design) sources — compiled with xelatex (+ biber for bibliography)
FILES=("CV_RequenaPlensJoseManuel_ENG" "CV_RequenaPlensJoseManuel_SPA")
# ATS-friendly sources — compiled with lualatex (tagged PDF, no bibliography)
ATS_FILES=("CV_RequenaPlensJoseManuel_ENG_ATS" "CV_RequenaPlensJoseManuel_SPA_ATS")

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
    
    # Run biber for bibliography (skip if biblatex is not in use, i.e. no .bcf was generated)
    if [ -f "${filename}.bcf" ]; then
        if ! biber "$filename" > /dev/null 2>&1; then
            echo "  ✗ Error: biber failed for ${filename}"
            return 1
        fi
    fi
    
    # Run xelatex (multiple passes for references/layout)
    if ! xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null 2>&1; then
        echo "  ✗ Error: xelatex second pass failed for ${filename}"
        return 1
    fi
    if ! xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null 2>&1; then
        echo "  ✗ Error: xelatex third pass failed for ${filename}"
        return 1
    fi
    
    # Move to public directory
    if [ -f "${filename}.pdf" ]; then
        mv "${filename}.pdf" "$OUTPUT_DIR/"
        echo "  ✓ Generated and moved ${filename}.pdf to $OUTPUT_DIR"
    else
        echo "  ✗ Error: ${filename}.pdf was not generated."
        return 1
    fi
}

# Compile an ATS source with lualatex (two passes for stable links/tagging).
compile_lualatex() {
    local filename=$1
    echo "Compiling $filename (lualatex)..."

    if ! lualatex -interaction=nonstopmode "${filename}.tex" > "${filename}.lualog" 2>&1; then
        echo "  ✗ Error: lualatex first pass failed for ${filename}"
        cat "${filename}.lualog"; rm -f "${filename}.lualog"
        return 1
    fi
    if ! lualatex -interaction=nonstopmode "${filename}.tex" > "${filename}.lualog" 2>&1; then
        echo "  ✗ Error: lualatex second pass failed for ${filename}"
        cat "${filename}.lualog"; rm -f "${filename}.lualog"
        return 1
    fi
    rm -f "${filename}.lualog"

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
for file in "${FILES[@]}" "${ATS_FILES[@]}"; do
    rm -f "${file}.aux" "${file}.log" "${file}.out" "${file}.toc" "${file}.bbl" "${file}.blg" "${file}.run.xml" "${file}.bcf" "${file}.pdf"
done

# Compile AltaCV (design) files with xelatex
for file in "${FILES[@]}"; do
    compile_latex "$file"
done

# Compile ATS files with lualatex
for file in "${ATS_FILES[@]}"; do
    compile_lualatex "$file"
done

# Final cleanup of temporary LaTeX files
echo "Cleaning up temporary files..."
for file in "${FILES[@]}" "${ATS_FILES[@]}"; do
    rm -f "${file}.aux" "${file}.log" "${file}.out" "${file}.toc" "${file}.bbl" "${file}.blg" "${file}.run.xml" "${file}.bcf"
done

echo "CV compilation process completed."