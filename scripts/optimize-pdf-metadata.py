#!/usr/bin/env python3
"""
Optimize PDF metadata for SEO.

Sets proper Title, Author, Subject, and Keywords on all PDFs in public/pdf/.
Uses pikepdf to update both XMP and DocInfo metadata.

Usage:
    python3 scripts/optimize-pdf-metadata.py
"""

import pikepdf
import os
import sys
from datetime import datetime

AUTHOR = "José Manuel Requena Plens"
BASE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "pdf")

# Metadata map: relative path from public/pdf/ → {title, subject, keywords}
# Author defaults to AUTHOR unless overridden
PDF_METADATA = {
    # === CV (already good — update to ensure consistency) ===
    "CV_RequenaPlensJoseManuel_ENG.pdf": {
        "title": "CV of José Manuel Requena Plens",
        "subject": "Curriculum Vitae — Software Engineer & Acoustics Researcher",
        "keywords": "CV, Curriculum Vitae, José Manuel Requena Plens, Software Engineer, Acoustics, Resume",
    },
    "CV_RequenaPlensJoseManuel_SPA.pdf": {
        "title": "CV de José Manuel Requena Plens",
        "subject": "Currículum Vitae — Ingeniero de Software e Investigador en Acústica",
        "keywords": "CV, Currículum Vitae, José Manuel Requena Plens, Ingeniero de Software, Acústica",
    },

    # === Degree documents ===
    # English academic records
    "degree/PhDExpEng.pdf": {
        "title": "PhD Academic Record — José Manuel Requena Plens",
        "subject": "Official academic transcript for the PhD program at Universitat Politècnica de València",
        "keywords": "PhD, Academic Record, Universitat Politècnica de València, UPV, Acoustics, Doctorado, Expediente Académico, Acústica",
    },
    "degree/AcousticExpEng.pdf": {
        "title": "Master's Academic Record in Acoustical Engineering — José Manuel Requena Plens",
        "subject": "Official academic transcript for the Master's in Acoustical Engineering at UPV",
        "keywords": "Master, Acoustical Engineering, Academic Record, UPV, Máster, Ingeniería Acústica, Expediente Académico",
    },
    "degree/TelecomExpEng.pdf": {
        "title": "Bachelor's Academic Record in Telecommunications Engineering — José Manuel Requena Plens",
        "subject": "Official academic transcript for the Bachelor's in Telecommunications Engineering at Universidad de Alicante",
        "keywords": "Bachelor, Telecommunications, Academic Record, Universidad de Alicante, Grado, Telecomunicación, Expediente Académico",
    },
    # Spanish academic records
    "degree/PhDExpCas.pdf": {
        "title": "Expediente Académico de Doctorado — José Manuel Requena Plens",
        "subject": "Expediente académico oficial del programa de doctorado en la Universitat Politècnica de València",
        "keywords": "Doctorado, Expediente Académico, Universitat Politècnica de València, UPV, Acústica, PhD, Academic Record, Acoustics",
    },
    "degree/AcousticExpCas.pdf": {
        "title": "Expediente Académico del Máster en Ingeniería Acústica — José Manuel Requena Plens",
        "subject": "Expediente académico oficial del Máster en Ingeniería Acústica en la Universitat Politècnica de València",
        "keywords": "Máster, Ingeniería Acústica, Expediente Académico, UPV, Master, Acoustical Engineering, Academic Record",
    },
    "degree/TelecomExpCas.pdf": {
        "title": "Expediente Académico del Grado en Ingeniería en Sonido e Imagen en Telecomunicación — José Manuel Requena Plens",
        "subject": "Expediente académico oficial del Grado en Telecomunicación en la Universidad de Alicante",
        "keywords": "Grado, Telecomunicación, Expediente Académico, Universidad de Alicante, Bachelor, Telecommunications, Academic Record",
    },
    # Spanish diplomas (documents are in Spanish)
    "degree/Acoustic.pdf": {
        "title": "Título de Máster en Ingeniería Acústica — José Manuel Requena Plens",
        "subject": "Diploma oficial del Máster en Ingeniería Acústica de la Universitat Politècnica de València",
        "keywords": "Máster, Ingeniería Acústica, Diploma, UPV, Universitat Politècnica de València, Master, Acoustical Engineering",
    },
    "degree/Telecom.pdf": {
        "title": "Título de Grado en Ingeniería en Sonido e Imagen en Telecomunicación — José Manuel Requena Plens",
        "subject": "Diploma oficial del Grado en Telecomunicación de la Universidad de Alicante",
        "keywords": "Grado, Telecomunicación, Diploma, Universidad de Alicante, Bachelor, Telecommunications Engineering",
    },
    "degree/CFGM_Electronica.pdf": {
        "title": "Diploma — Ciclo Formativo de Grado Medio en Equipos Electrónicos de Consumo — José Manuel Requena Plens",
        "subject": "Diploma oficial del Ciclo Formativo de Grado Medio en Equipos Electrónicos de Consumo",
        "keywords": "CFGM, Electrónica, Formación Profesional, Diploma, Electronics, Vocational Training",
    },
    "degree/CFGS_Sonido.pdf": {
        "title": "Diploma — Ciclo Formativo de Grado Superior en Sonido para Audiovisuales y Espectáculos — José Manuel Requena Plens",
        "subject": "Diploma oficial del Ciclo Formativo de Grado Superior en Sonido para Audiovisuales y Espectáculos",
        "keywords": "CFGS, Sonido, Audiovisuales, Formación Profesional, Diploma, Sound, Vocational Training",
    },
    # Spanish theses
    "degree/TFG_Grado.pdf": {
        "title": "Trabajo Fin de Grado — Estudio de la relación campo directo/reverberado; útil/perjudicial",
        "subject": "Trabajo Fin de Grado sobre el análisis de campos acústicos directo y reverberante, Universidad de Alicante",
        "keywords": "TFG, Trabajo Fin de Grado, Acústica, Campo Directo, Campo Reverberante, CATT-Acoustic, EASE, Universidad de Alicante, BSc Thesis, Acoustics",
    },
    "degree/TFM_Master.pdf": {
        "title": "Trabajo Fin de Máster — Difusores acústicos basados en resonadores de membrana y placa",
        "subject": "Trabajo Fin de Máster sobre difusores acústicos basados en metamateriales con resonadores de membrana y placa, UPV",
        "keywords": "TFM, Trabajo Fin de Máster, Difusores Acústicos, Metamateriales, Metasuperficie, Resonador de Membrana, UPV, MSc Thesis, Acoustic Diffusers",
    },

    # === Research papers — Euronoise 2021 ===
    "paper-resources/Conferences/Euronoise/plensEuro2021.pdf": {
        "title": "Perfect broadband sound absorber metamaterial for noise reduction in a rocket launch — Euronoise 2021",
        "author": "José M. Requena-Plens, Noé Jiménez, Jean-Philippe Groby, Vicente Romero-García",
        "subject": "Design of a metamaterial panel for noise mitigation during rocket launches using Helmholtz resonators",
        "keywords": "Metamaterial, Sound Absorption, Rocket Launch, Helmholtz Resonator, Noise Mitigation, Euronoise 2021",
    },
    "paper-resources/Conferences/Euronoise/plensEuro2021_2.pdf": {
        "title": "Sound diffusing metasurfaces based on elastic plates and membranes — Euronoise 2021",
        "author": "José M. Requena-Plens, Noé Jiménez, Jean-Philippe Groby, Vicente Romero-García",
        "subject": "Ultrathin metasurfaces using plate and membrane resonators for sound diffusion",
        "keywords": "Metasurface, Sound Diffusion, Membrane Resonator, Plate Resonator, Metamaterial, Euronoise 2021",
    },
    "paper-resources/Conferences/Euronoise/EscartiEuro2021.pdf": {
        "title": "Application of metamaterials to control noise scattering during space vehicle lift-off — Euronoise 2021",
        "author": "A. Escartí-Guillem, José M. Requena-Plens, Noé Jiménez, Vicente Romero-García, Rubén Picó",
        "subject": "Metamaterials for noise control during space vehicle launches",
        "keywords": "Metamaterial, Noise Control, Space Vehicle, Lift-off, Vibro-acoustic, Euronoise 2021",
    },

    # === Research papers — Tecniacústica (papers written in Spanish) ===
    "paper-resources/Conferences/Tecniacustica/plensTEC2020.pdf": {
        "title": "Predicción del campo acústico durante el lanzamiento de cohetes — Tecniacústica 2020",
        "author": "José M. Requena-Plens, Noé Jiménez, Vicente Romero-García, Luis M. García-Raffi",
        "subject": "Modelo semiempírico de predicción de ruido generado durante el lanzamiento de cohetes espaciales",
        "keywords": "Lanzamiento de Cohetes, Campo Acústico, Predicción de Ruido, Cohete VEGA, Tecniacústica 2020, Rocket Launch, Noise Prediction",
    },
    "paper-resources/Conferences/Tecniacustica/JimenezTEC2020a.pdf": {
        "title": "Más allá de los difusores de Schroeder usando metasuperficies acústicas — Tecniacústica 2020",
        "author": "Noé Jiménez, José M. Requena-Plens, Jean-Philippe Groby, Vicente Romero-García",
        "subject": "Metadifusores de espesor sub-longitud de onda como alternativa a los difusores clásicos de Schroeder",
        "keywords": "Metadifusor, Difusor de Schroeder, Metasuperficie Acústica, Metamaterial, Tecniacústica 2020, Metadiffuser, Acoustic Metasurface",
    },
    "paper-resources/Conferences/Tecniacustica/plens2018.pdf": {
        "title": "Cálculo corregido basado en la teoría moderna de los campos acústicos (directo, temprano y tardío) — Tecniacústica 2018",
        "author": "José M. Requena-Plens, Nicolás Guarinos",
        "subject": "Cálculo teórico corregido de los campos directo, temprano y reverberante basado en las teorías de Barron y Lee",
        "keywords": "Campos Acústicos, Barron y Lee, Acústica de Salas, Campo Directo, Campo Reverberante, Tecniacústica 2018, Room Acoustics",
    },
    "paper-resources/Conferences/Tecniacustica/plens2018-2.pdf": {
        "title": "Campo directo (útil)/reverberado (perjudicial): resultados experimentales frente a simulación en EASE — Tecniacústica 2018",
        "author": "José M. Requena-Plens, Nicolás Guarinos",
        "subject": "Comparación experimental vs simulación de campos acústicos útil y perjudicial usando el software EASE",
        "keywords": "Campo Directo, Campo Reverberante, EASE, Simulación Acústica, Tecniacústica 2018, Acoustic Simulation",
    },
    "paper-resources/Conferences/Tecniacustica/saura2018.pdf": {
        "title": "Comportamiento vibroacústico de contenedores cilíndricos en aire — Tecniacústica 2018",
        "author": "Ángel Hernández-Saura, José M. Requena-Plens",
        "subject": "Estudio del comportamiento vibroacústico de contenedores cilíndricos mediante holografía acústica de campo cercano (NAH)",
        "keywords": "Vibroacústica, NAH, Holografía Acústica, Contenedores Cilíndricos, Tecniacústica 2018, Vibro-acoustics, Near-field Acoustic Holography",
    },
    "paper-resources/Conferences/Tecniacustica/plens2017.pdf": {
        "title": "Campo directo (útil)/reverberado (perjudicial): resultados experimentales frente a simulación en CATT-Acoustic — Tecniacústica 2017",
        "author": "José M. Requena-Plens, Nicolás Guarinos",
        "subject": "Resultados experimentales vs simulación 3D de campos acústicos útil y perjudicial usando CATT-Acoustic",
        "keywords": "Campo Directo, Campo Reverberante, CATT-Acoustic, Simulación 3D, Tecniacústica 2017, Acoustic Simulation",
    },

    # === Research papers — Articles ===
    "paper-resources/Articles/castells2019.pdf": {
        "title": "Loudspeakers for Vented Enclosures: a Backwards Approach for Speaker Selection — VoiceCoil Magazine 2019",
        "author": "José Castells-Sala, José M. Requena-Plens",
        "subject": "Novel backwards design methodology for vented loudspeaker enclosures",
        "keywords": "Loudspeaker, Vented Enclosure, Speaker Selection, Audio Engineering, VoiceCoil",
    },

    # === Poster (Spanish thesis poster) ===
    "paper-resources/TFG-poster.pdf": {
        "title": "Póster — Estudio de la relación campo directo/reverberado; útil/perjudicial",
        "subject": "Póster académico del Trabajo Fin de Grado sobre el análisis de campos acústicos directo y reverberante",
        "keywords": "Póster, TFG, Trabajo Fin de Grado, Acústica, Campo Directo, Campo Reverberante, Universidad de Alicante, BSc Thesis Poster",
    },

    # === Programs ===
    "programs/COST2019.pdf": {
        "title": "COST Action CA15125 — DENORMS Training School Programme 2019",
        "author": "COST Action CA15125",
        "subject": "Training school programme on design of noise reducing materials and structures",
        "keywords": "COST Action, DENORMS, Noise Reduction, Metamaterials, Training School, 2019",
    },

    # === Certificados PRL — Prevención de Riesgos Laborales (documentos en español) ===
    "certificates/PRL/PRL_Generico.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Genérico (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Genérico, INVASSAT (50 horas)",
        "keywords": "PRL, Prevención de Riesgos Laborales, INVASSAT, Certificado, Occupational Health Safety",
    },
    "certificates/PRL/PRL_Nanomateriales.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Nanomateriales (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Nanomateriales, INVASSAT (50 horas)",
        "keywords": "PRL, Nanomateriales, Prevención de Riesgos Laborales, INVASSAT, Certificado, Nanomaterials",
    },
    "certificates/PRL/PRL_Quimico.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Sector Químico (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Químico, INVASSAT (50 horas)",
        "keywords": "PRL, Químico, Prevención de Riesgos Laborales, INVASSAT, Certificado, Chemical Sector",
    },
    "certificates/PRL/PRL_Emergencias.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Emergencias (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, Emergencias, INVASSAT (70 horas)",
        "keywords": "PRL, Emergencias, Prevención de Riesgos Laborales, INVASSAT, Certificado, Emergencies",
    },
    "certificates/PRL/PRL_Alimentario.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Sector Alimentario (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Alimentario, INVASSAT (50 horas)",
        "keywords": "PRL, Alimentario, Prevención de Riesgos Laborales, INVASSAT, Certificado, Food Sector",
    },
    "certificates/PRL/PRL_Educativo.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Sector Educativo (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Educativo, INVASSAT (50 horas)",
        "keywords": "PRL, Educativo, Prevención de Riesgos Laborales, INVASSAT, Certificado, Educational Sector",
    },
    "certificates/PRL/PRL_Servicios.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales: Sector Servicios (INVASSAT) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales, sector Servicios, INVASSAT (50 horas)",
        "keywords": "PRL, Servicios, Prevención de Riesgos Laborales, INVASSAT, Certificado, Services Sector",
    },
    "certificates/PRL/CertificadoPRLUPV.pdf": {
        "title": "Certificado — Prevención de Riesgos Laborales para Investigadores (UPV) — José Manuel Requena Plens",
        "subject": "Certificado de Prevención de Riesgos Laborales para investigadores, UPV (15 horas)",
        "keywords": "PRL, Investigador, Prevención de Riesgos Laborales, UPV, Certificado, Researcher, Occupational Safety",
    },

    # === Certificados de competencias profesionales (documentos en español) ===
    "certificates/PerspectivaDeGenero.pdf": {
        "title": "Certificado — Perspectiva de Género (EVES) — José Manuel Requena Plens",
        "subject": "Certificado de formación en perspectiva de género emitido por EVES (20 horas)",
        "keywords": "Perspectiva de Género, EVES, Certificado, Formación Profesional, Gender Perspective",
    },
    "certificates/TrabajoEnEquipo.pdf": {
        "title": "Certificado — Trabajo en Equipo (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de competencias profesionales en trabajo en equipo, Labora (25 horas)",
        "keywords": "Trabajo en Equipo, Labora, Competencias Profesionales, Certificado, Teamwork",
    },
    "certificates/DesignThinking.pdf": {
        "title": "Certificado — Design Thinking (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de competencias profesionales en Design Thinking, Labora (25 horas)",
        "keywords": "Design Thinking, Labora, Innovación, Competencias Profesionales, Certificado, Innovation",
    },
    "certificates/PensamientoCritico.pdf": {
        "title": "Certificado — Pensamiento Crítico (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de competencias profesionales en pensamiento crítico, Labora (25 horas)",
        "keywords": "Pensamiento Crítico, Labora, Competencias Profesionales, Certificado, Critical Thinking",
    },
    "certificates/AdaptacionFlexibilidadAgilidad.pdf": {
        "title": "Certificado — Adaptación, Flexibilidad y Agilidad (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de competencias profesionales en adaptación y agilidad, Labora (25 horas)",
        "keywords": "Adaptación, Flexibilidad, Agilidad, Labora, Competencias Profesionales, Certificado, Adaptability",
    },
    "certificates/AutonomiaInnovacion.pdf": {
        "title": "Certificado — Autonomía e Innovación (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de competencias profesionales en autonomía e innovación, Labora (25 horas)",
        "keywords": "Autonomía, Innovación, Labora, Competencias Profesionales, Certificado, Autonomy, Innovation",
    },
    "certificates/MejoraEficiencia.pdf": {
        "title": "Certificado — Mejora de la Eficiencia Profesional (Labora) — José Manuel Requena Plens",
        "subject": "Certificado de mejora de la eficiencia profesional, Labora (25 horas)",
        "keywords": "Eficiencia Profesional, Labora, Competencias Profesionales, Certificado, Professional Efficiency",
    },
    "certificates/EmprendimientoPerspectivaGenero.pdf": {
        "title": "Certificado — Emprendimiento con Perspectiva de Género (UPV) — José Manuel Requena Plens",
        "subject": "Certificado de formación en emprendimiento con perspectiva de género, UPV",
        "keywords": "Emprendimiento, Perspectiva de Género, UPV, Certificado, Entrepreneurship, Gender Perspective",
    },

    # === Certificados laborales/industriales (documentos en español) ===
    "certificates/Certificado_Carretilla.pdf": {
        "title": "Certificado — Operador de Carretilla Elevadora — José Manuel Requena Plens",
        "subject": "Certificado de operador de carretilla elevadora",
        "keywords": "Carretilla Elevadora, Operador, Certificado, Industrial, Forklift Operator",
    },
    "certificates/ManipuladorDeAlimentos.pdf": {
        "title": "Certificado — Manipulador de Alimentos (ASONAMAN) — José Manuel Requena Plens",
        "subject": "Certificado de manipulador de alimentos emitido por ASONAMAN",
        "keywords": "Manipulador de Alimentos, Higiene Alimentaria, ASONAMAN, Certificado, Food Hygiene",
    },
    "certificates/PlanesAutoproteccion.pdf": {
        "title": "Certificado — Planes de Autoprotección — José Manuel Requena Plens",
        "subject": "Certificado de formación en planes de autoprotección",
        "keywords": "Planes de Autoprotección, Emergencias, Seguridad, Certificado, Self-Protection Plans",
    },
    "certificates/ElectricidadEstatica.pdf": {
        "title": "Certificado — Electricidad Estática — José Manuel Requena Plens",
        "subject": "Certificado de formación en seguridad y prevención de electricidad estática",
        "keywords": "Electricidad Estática, Seguridad, Prevención, Certificado, Static Electricity",
    },
    "certificates/ProteccionDeDatos.pdf": {
        "title": "Certificado — Protección de Datos / RGPD — José Manuel Requena Plens",
        "subject": "Certificado de formación en protección de datos y privacidad (RGPD)",
        "keywords": "Protección de Datos, RGPD, GDPR, Privacidad, Certificado, Data Privacy",
    },

    # === Certificates — IT (local backup copies) ===
    "certificates/UsingPython.pdf": {
        "title": "Certificate — Using Python for Research (HarvardX) — José Manuel Requena Plens",
        "subject": "HarvardX certification for Using Python for Research (50 hours)",
        "keywords": "Python, Research, HarvardX, edX, Certificate, Programming",
    },
    "certificates/AnalizandoPython.pdf": {
        "title": "Certificate — Analyzing Data With Python (IBM) — José Manuel Requena Plens",
        "subject": "IBM certification for Analyzing Data With Python via edX (20 hours)",
        "keywords": "Python, Data Analysis, IBM, edX, Certificate",
    },
    "certificates/VisualizandoPython.pdf": {
        "title": "Certificate — Visualizing Data with Python (IBM) — José Manuel Requena Plens",
        "subject": "IBM certification for Visualizing Data with Python via edX (20 hours)",
        "keywords": "Python, Data Visualization, IBM, edX, Certificate",
    },

    # === Certificados de formación profesional (documentos en español) ===
    "certificates/CFGMElectronica.pdf": {
        "title": "Certificado — CFGM Equipos Electrónicos de Consumo — José Manuel Requena Plens",
        "subject": "Certificado del Ciclo Formativo de Grado Medio en Equipos Electrónicos de Consumo",
        "keywords": "CFGM, Electrónica, Formación Profesional, Certificado, Electronics, Vocational Training",
    },
    "certificates/CFGSSonido.pdf": {
        "title": "Certificado — CFGS Sonido para Audiovisuales y Espectáculos — José Manuel Requena Plens",
        "subject": "Certificado del Ciclo Formativo de Grado Superior en Sonido para Audiovisuales y Espectáculos",
        "keywords": "CFGS, Sonido, Audiovisuales, Formación Profesional, Certificado, Sound, Vocational Training",
    },
}


def update_pdf_metadata(filepath: str, metadata: dict) -> bool:
    """Update PDF DocInfo metadata using pikepdf."""
    try:
        pdf = pikepdf.open(filepath, allow_overwriting_input=True)

        title = metadata.get("title", "")
        author = metadata.get("author", AUTHOR)
        subject = metadata.get("subject", "")
        keywords = metadata.get("keywords", "")

        with pdf.open_metadata(set_pikepdf_as_editor=False) as meta:
            meta["dc:title"] = title
            meta["dc:creator"] = [author]
            meta["dc:description"] = subject
            meta["dc:subject"] = [k.strip() for k in keywords.split(",")]
            meta["pdf:Producer"] = "pikepdf — jmrp.io PDF metadata optimizer"
            meta["pdf:Keywords"] = keywords

        pdf.docinfo[pikepdf.Name.Title] = title
        pdf.docinfo[pikepdf.Name.Author] = author
        pdf.docinfo[pikepdf.Name.Subject] = subject
        pdf.docinfo[pikepdf.Name.Keywords] = keywords

        pdf.save(filepath)
        pdf.close()
        return True
    except Exception as e:
        print(f"  ERROR: {e}", file=sys.stderr)
        return False


def main():
    success = 0
    errors = 0
    skipped = 0

    print(f"Optimizing PDF metadata in {BASE_DIR}")
    print(f"Total PDFs in metadata map: {len(PDF_METADATA)}")
    print("-" * 60)

    for rel_path, metadata in sorted(PDF_METADATA.items()):
        filepath = os.path.join(BASE_DIR, rel_path)
        if not os.path.exists(filepath):
            print(f"  SKIP (not found): {rel_path}")
            skipped += 1
            continue

        if update_pdf_metadata(filepath, metadata):
            print(f"  ✓ {rel_path}")
            success += 1
        else:
            errors += 1

    print("-" * 60)
    print(f"Done: {success} updated, {errors} errors, {skipped} skipped")

    # Check for PDFs not in the metadata map
    all_pdfs = set()
    for root, dirs, files in os.walk(BASE_DIR):
        for f in files:
            if f.endswith(".pdf"):
                rel = os.path.relpath(os.path.join(root, f), BASE_DIR)
                all_pdfs.add(rel)

    unmapped = all_pdfs - set(PDF_METADATA.keys())
    if unmapped:
        print(f"\nWARNING: {len(unmapped)} PDFs not in metadata map:")
        for p in sorted(unmapped):
            print(f"  - {p}")

    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
