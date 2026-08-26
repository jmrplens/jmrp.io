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
# Directory for the auto-generated ATS sources (produced from the CV YAML).
GEN_DIR="${GEN_DIR:-"$SCRIPT_DIR/generated"}"
# Private build: the same six PDFs plus the phone number from CV_PHONE in .env.
# Git-ignored and OUTSIDE public/, because public/pdf/ is served by nginx and
# linked from the site — see the docblock in scripts/cv/generate-ats.mjs.
PRIVATE_DIR="${PRIVATE_DIR:-"$SCRIPT_DIR/../cv_private"}"
PRIVATE_TEX_DIR="$PRIVATE_DIR/tex"
# Design sources — GENERATED from the CV YAML + papers.bib by
# scripts/cv/generate-design.mjs (sidebar/paracol layout; replaced the
# hand-authored AltaCV documents in 2026-08), compiled with lualatex.
DESIGN_FILES=("CV_RequenaPlensJoseManuel_ENG" "CV_RequenaPlensJoseManuel_SPA")
# ATS sources — GENERATED from src/content/cv/{es,en}.yaml (do not edit by hand),
# compiled with lualatex (tagged PDF, no bibliography). Two profiles per locale:
# concise (…_ATS) and exhaustive (…_ATS_EXT).
ATS_FILES=(
    "CV_RequenaPlensJoseManuel_ENG_ATS"
    "CV_RequenaPlensJoseManuel_ENG_ATS_EXT"
    "CV_RequenaPlensJoseManuel_SPA_ATS"
    "CV_RequenaPlensJoseManuel_SPA_ATS_EXT"
)

# Reproducible builds: with a fixed timestamp (plus the RNG seed the templates
# set before \DocumentMetadata) two compilations of unchanged sources are
# byte-identical, so a rebuild without real changes produces no git diff on
# the tracked PDFs. Derived from the last commit; falls back to now when git
# is unavailable (then determinism is simply not guaranteed, which is fine).
SOURCE_DATE_EPOCH="$(git -C "$SCRIPT_DIR" log -1 --format=%ct 2>/dev/null || date +%s)"
export SOURCE_DATE_EPOCH

cd "$LATEX_DIR" || exit 1

# Ensure public/pdf exists
mkdir -p "$OUTPUT_DIR"

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

# Generate every .tex source from the CV YAML (single source of truth).
echo "Generating ATS sources from src/content/cv/{es,en}.yaml..."
node "$SCRIPT_DIR/../scripts/cv/generate-ats.mjs"
echo "Generating design sources from src/content/cv/{es,en}.yaml + papers.bib..."
node "$SCRIPT_DIR/../scripts/cv/generate-design.mjs"

# Compile everything with lualatex (in GEN_DIR)
cd "$GEN_DIR" || exit 1
for file in "${DESIGN_FILES[@]}" "${ATS_FILES[@]}"; do
    rm -f "${file}.aux" "${file}.log" "${file}.out" "${file}.pdf"
    compile_lualatex "$file"
done

# Final cleanup of temporary LaTeX files
echo "Cleaning up temporary files..."
for file in "${DESIGN_FILES[@]}" "${ATS_FILES[@]}"; do
    rm -f "$GEN_DIR/${file}.aux" "$GEN_DIR/${file}.log" "$GEN_DIR/${file}.out"
done

# ---------------------------------------------------------------------------
# Private pass: rebuild all six with the phone number, into cv_private/.
# Skipped entirely when CV_PHONE is unset, which is the state of any fresh
# clone and of CI — so the public build is unchanged and needs no secret.
# ---------------------------------------------------------------------------
CV_PHONE_VALUE="$(node -e 'try{process.loadEnvFile(process.argv[1])}catch{};process.stdout.write((process.env.CV_PHONE||"").trim())' "$SCRIPT_DIR/../.env")"
if [ -n "$CV_PHONE_VALUE" ]; then
    echo "Private pass (CV_PHONE set) → $PRIVATE_DIR"
    mkdir -p "$PRIVATE_DIR"
    # The private sources reach the vendored fonts by the same relative string
    # as the public ones. Handing them a deeper or absolute Path instead does
    # not work: luaotfload silently fails to load it, embeds no fonts at all,
    # and LuaTeX then dies at PDF finalisation with `cannot find file ''`.
    ln -sfn ../cv_latex/resources "$PRIVATE_DIR/resources"
    OUTPUT_DIR="$PRIVATE_DIR"

    # Both generators already wrote the phone-carrying sources into
    # cv_private/tex/ (they read CV_PHONE themselves); this pass only compiles.
    cd "$PRIVATE_TEX_DIR" || exit 1
    for file in "${DESIGN_FILES[@]}" "${ATS_FILES[@]}"; do
        rm -f "${file}.aux" "${file}.log" "${file}.out" "${file}.pdf"
        compile_lualatex "$file"
    done
    for file in "${DESIGN_FILES[@]}" "${ATS_FILES[@]}"; do
        rm -f "$PRIVATE_TEX_DIR/${file}.aux" "$PRIVATE_TEX_DIR/${file}.log" "$PRIVATE_TEX_DIR/${file}.out"
    done
fi

echo "CV compilation process completed."