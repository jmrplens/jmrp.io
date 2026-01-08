#!/bin/bash

# Configuration
LATEX_DIR="/var/www/jmrp.io/cv_latex"
OUTPUT_DIR="/var/www/jmrp.io/public/pdf"
FILES=("CV_RequenaPlensJoseManuel_ENG" "CV_RequenaPlensJoseManuel_SPA")

cd "$LATEX_DIR" || exit 1

# Ensure public/pdf exists
mkdir -p "$OUTPUT_DIR"

compile_latex() {
    local filename=$1
    echo "Compiling $filename..."
    
    # Run xelatex (first pass)
    xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null
    
    # Run biber for bibliography
    biber "$filename" > /dev/null
    
    # Run xelatex (multiple passes for references/layout)
    xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null
    xelatex -interaction=nonstopmode "${filename}.tex" > /dev/null
    
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
rm -f *.aux *.log *.out *.toc *.bbl *.blg *.run.xml *.bcf *.pdf

# Compile all files
for file in "${FILES[@]}"; do
    compile_latex "$file"
done

# Final cleanup of temporary LaTeX files
echo "Cleaning up temporary files..."
rm -f *.aux *.log *.out *.toc *.bbl *.blg *.run.xml *.bcf

echo "CV compilation process completed."