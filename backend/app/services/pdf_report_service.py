"""
DRISHTI-X — PDF Report Generation Service (Phase 28)
Generates professional AI-assisted screening reports as PDF.

Every report clearly states:
    AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS

Report sections:
  1. Header + disclaimer
  2. Patient / case info
  3. Image quality
  4. DR grade + probability distribution
  5. Lesion evidence
  6. Grad-CAM thumbnail
  7. Assurance decision + referral priority
  8. Doctor review (if completed)
  9. Model provenance
  10. Footer + audit info
"""
import os
import io
from datetime import datetime, timezone
from typing import Optional, Dict, Any

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.lib.colors import (
        HexColor, white, black, red, green, orange
    )
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, Image as RLImage, KeepTogether
    )
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


# ── Colour palette ────────────────────────────────────────────
C_DARK    = HexColor("#040d1a") if REPORTLAB_AVAILABLE else None
C_NAVY    = HexColor("#0a1628") if REPORTLAB_AVAILABLE else None
C_CYAN    = HexColor("#38bdf8") if REPORTLAB_AVAILABLE else None
C_GREEN   = HexColor("#10b981") if REPORTLAB_AVAILABLE else None
C_YELLOW  = HexColor("#f59e0b") if REPORTLAB_AVAILABLE else None
C_RED     = HexColor("#ef4444") if REPORTLAB_AVAILABLE else None
C_PURPLE  = HexColor("#8b5cf6") if REPORTLAB_AVAILABLE else None
C_GREY    = HexColor("#94a3b8") if REPORTLAB_AVAILABLE else None
C_LGREY   = HexColor("#1e3a5f") if REPORTLAB_AVAILABLE else None

DR_GRADE_LABELS = {
    0: "No DR",
    1: "Mild NPDR",
    2: "Moderate NPDR",
    3: "Severe NPDR",
    4: "Proliferative DR (PDR)",
}

MANDATORY_CLINICAL_DISCLAIMER = (
    "DRISHTI-X provides AI-assisted diabetic retinopathy screening support only. "
    "This result is not a definitive diagnosis and must be reviewed by a qualified eye-care professional. "
    "Model predictions and heatmaps may be incorrect. Unsuitable images may require recapture. "
    "Clinical decisions must not be based solely on this AI output."
)
DISCLAIMER = MANDATORY_CLINICAL_DISCLAIMER


def _grade_color(grade: Optional[int]):
    if grade is None: return C_GREY
    return {0: C_GREEN, 1: C_YELLOW, 2: C_YELLOW, 3: C_RED, 4: C_RED}.get(grade, C_GREY)


def _priority_color(priority: Optional[str]):
    return {"LOW": C_GREEN, "MEDIUM": C_YELLOW,
            "HIGH": C_RED, "CRITICAL": C_RED}.get(priority or "", C_GREY)


def generate_pdf_report(
    report_data: Dict[str, Any],
    output_path: str,
    api_base_url: str = "http://localhost:8000",
) -> str:
    """
    Generate a PDF screening report from report_data dict.
    Returns the output_path on success.

    If reportlab unavailable, writes a plain-text fallback.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    if not REPORTLAB_AVAILABLE:
        return _generate_text_fallback(report_data, output_path.replace(".pdf", ".txt"))

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
    )

    styles   = getSampleStyleSheet()
    elements = []

    # ── Shared styles ─────────────────────────────────────────
    def S(name, **kw):
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    title_style    = S("T",  fontSize=20, textColor=C_CYAN,  spaceAfter=2, leading=24)
    subtitle_style = S("ST", fontSize=11, textColor=C_GREY,  spaceAfter=4)
    h2_style       = S("H2", fontSize=12, textColor=C_CYAN,  spaceBefore=10, spaceAfter=4,
                       fontName="Helvetica-Bold")
    body_style     = S("B",  fontSize=9,  textColor=black,   spaceAfter=2)
    small_style    = S("SM", fontSize=7,  textColor=C_GREY,  spaceAfter=1)
    warn_style     = S("W",  fontSize=9,  textColor=C_YELLOW, spaceAfter=2,
                       fontName="Helvetica-Bold")
    disc_style     = S("D",  fontSize=7.5, textColor=C_RED,  spaceAfter=4,
                       borderColor=C_RED, borderWidth=0.5, borderPadding=4)

    def HR(): return HRFlowable(width="100%", thickness=0.5, color=C_LGREY,
                                spaceAfter=6, spaceBefore=6)

    def table(data, col_widths=None, **kw):
        t = Table(data, colWidths=col_widths)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), C_LGREY),
            ("TEXTCOLOR",  (0,0), (-1,0), C_CYAN),
            ("FONTNAME",   (0,0), (-1,0), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (-1,-1), 8),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [white, HexColor("#f0f4f8")]),
            ("GRID",       (0,0), (-1,-1), 0.3, C_LGREY),
            ("LEFTPADDING",(0,0), (-1,-1), 6),
            ("RIGHTPADDING",(0,0),(-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 3),
            ("BOTTOMPADDING",(0,0),(-1,-1), 3),
            *kw.get("extra_style", []),
        ]))
        return t

    # ── 1. HEADER ─────────────────────────────────────────────
    elements += [
        Paragraph("DRISHTI-X", title_style),
        Paragraph("AI-Assisted Diabetic Retinopathy Screening Report", subtitle_style),
        Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
                  small_style),
        HR(),
    ]

    # ── 2. DISCLAIMER (always prominent) ─────────────────────
    elements += [
        Paragraph(DISCLAIMER, disc_style),
        Spacer(1, 4),
    ]

    # ── 3. CASE INFORMATION ───────────────────────────────────
    scr   = report_data.get("screening", {})
    pat   = report_data.get("patient",   {})
    elements.append(Paragraph("Patient & Screening Clinical Information", h2_style))

    symptoms_val = pat.get("visual_symptoms")
    if isinstance(symptoms_val, list):
        symptoms_str = ", ".join(symptoms_val) if symptoms_val else "None reported"
    else:
        symptoms_str = str(symptoms_val or "None reported")

    hba1c_val = pat.get("hba1c_value")
    hba1c_str = f"{hba1c_val} {pat.get('hba1c_unit', '%')}" if hba1c_val is not None else "Not recorded"

    glucose_val = pat.get("blood_glucose_value")
    glucose_str = f"{glucose_val} {pat.get('blood_glucose_unit', 'mg/dL')} ({pat.get('blood_glucose_type', 'Random')})" if glucose_val is not None else "Not recorded"

    case_data = [
        ["Field", "Value"],
        ["Report ID",          report_data.get("report_id", "—")],
        ["Patient Identifier", f"{pat.get('patient_code', '—')} — {pat.get('name', 'Anonymous')}"],
        ["Age / Gender",       f"{pat.get('age', '—')} years / {pat.get('gender', '—')}"],
        ["Diabetes History",   f"{pat.get('diabetes_type', 'Not specified')} (Duration: {pat.get('diabetes_duration_years', '—')} yrs)"],
        ["Diabetes Treatment", pat.get("diabetes_treatment") or "Not documented"],
        ["HbA1c / Glucose",    f"HbA1c: {hba1c_str} | Glucose: {glucose_str}"],
        ["Visual Symptoms",    symptoms_str],
        ["Eye Examined",       scr.get("eye_side", "—") or "—"],
        ["Facility / Location",f"{scr.get('facility_name') or pat.get('district') or 'Rural Screening Centre'} ({pat.get('district','—')}, {pat.get('state','—')})"],
        ["Screening Operator", scr.get("operator_name") or report_data.get("generated_by", "Clinician")],
        ["Screening Date",     scr.get("created_at", "—")[:10] if scr.get("created_at") else "—"],
        ["Analysis Time",      scr.get("analyzed_at", "—")[:16].replace("T"," ") if scr.get("analyzed_at") else "—"],
    ]
    elements.append(table(case_data, col_widths=[5*cm, 11*cm]))
    elements.append(Spacer(1, 6))

    # ── 4. IMAGE QUALITY ──────────────────────────────────────
    quality = report_data.get("image_quality") or {}
    if quality:
        elements.append(Paragraph("Image Quality Assessment", h2_style))
        qs = quality.get("quality_score", 0) or 0
        qcolor = C_GREEN if qs >= 70 else C_YELLOW if qs >= 50 else C_RED
        q_status = quality.get("quality_status") or ("GRADABLE" if quality.get("is_gradable") else "UNGRADABLE")
        q_data = [
            ["Metric", "Score", "Status"],
            ["Overall Quality", f"{qs:.1f}/100", q_status],
            ["Focus Score",        f"{quality.get('focus_score',0):.1f}/100", ""],
            ["Illumination Score", f"{quality.get('illumination_score',0):.1f}/100", ""],
            ["Field of View",      f"{quality.get('fov_score',0):.1f}/100", ""],
        ]
        t2 = table(q_data, col_widths=[6*cm, 4*cm, 6*cm])
        t2.setStyle(TableStyle([
            ("TEXTCOLOR", (2,1), (2,1), qcolor),
            ("FONTNAME",  (2,1), (2,1), "Helvetica-Bold"),
        ]))
        elements.append(t2)
        if quality.get("feedback"):
            elements.append(Paragraph(f"Quality Summary: {quality['feedback']}", small_style))
        guidance = quality.get("recapture_guidance") or quality.get("quality_warnings") or []
        if guidance and not quality.get("is_gradable"):
            elements.append(Spacer(1, 2))
            elements.append(Paragraph("Recapture Guidance:", S("RGH", fontSize=8, textColor=C_RED, fontName="Helvetica-Bold", spaceAfter=2)))
            for g_item in guidance:
                elements.append(Paragraph(f"• {g_item}", small_style))
        elements.append(Spacer(1, 6))

    # ── 5. DR PREDICTION ──────────────────────────────────────
    ai = report_data.get("ai_prediction") or {}
    elements.append(Paragraph("AI DR Classification", h2_style))

    if ai.get("is_demo"):
        elements.append(Paragraph(
            f"⚠ MODEL STATUS: {ai.get('model_status','NOT_TRAINED')} — "
            "Results below are NOT from a clinically trained model.",
            warn_style
        ))

    grade    = ai.get("predicted_grade")
    gc       = _grade_color(grade)
    ref_text = "REFERABLE DR" if ai.get("is_referable") else "NON-REFERABLE DR"
    ref_col  = C_RED if ai.get("is_referable") else C_GREEN
    conf_type = ai.get("confidence_type", "Model probability — not calibrated")

    pred_data = [
        ["Field", "Value"],
        ["Predicted Grade",
         f"Grade {grade} — {DR_GRADE_LABELS.get(grade,'N/A')}" if grade is not None
         else "NOT AVAILABLE"],
        ["Referral Class",   ref_text],
        ["Model Confidence", f"{ai.get('confidence',0)*100:.1f}% ({conf_type})" if ai.get('confidence') is not None else "Confidence unavailable"],
        ["Model Name",       ai.get("model_name", "EfficientNet-B0")],
        ["Model Version",    ai.get("model_version", "1.0.0")],
        ["Target Layer",     ai.get("gradcam_target_layer", "backbone.features.8.0")],
        ["Training Dataset", ai.get("training_dataset", "—") or "—"],
        ["Is Demo",          "YES ⚠" if ai.get("is_demo") else "NO — Real inference"],
        ["Calibrated",       f"Yes (T={ai.get('temperature','—')})" if ai.get("calibrated") else "No (Model probability — not calibrated)"],
    ]
    t3 = table(pred_data, col_widths=[6*cm, 10*cm])
    if grade is not None:
        t3.setStyle(TableStyle([
            ("TEXTCOLOR", (1,1),(1,1), gc),
            ("FONTNAME",  (1,1),(1,1), "Helvetica-Bold"),
            ("TEXTCOLOR", (1,2),(1,2), ref_col),
            ("FONTNAME",  (1,2),(1,2), "Helvetica-Bold"),
        ]))
    elements.append(t3)

    # Probability bars
    probs = ai.get("probabilities") or {}
    if probs:
        elements.append(Spacer(1, 4))
        elements.append(Paragraph("Grade Probabilities:", S("PH", fontSize=8,
                         textColor=C_CYAN, spaceAfter=2)))
        prob_rows = [["Grade", "Label", "Probability"]]
        for g in range(5):
            p = float(probs.get(str(g), 0))
            bar = "█" * int(p * 20) + "░" * (20 - int(p * 20))
            prob_rows.append([
                f"Grade {g}",
                DR_GRADE_LABELS.get(g, ""),
                f"{bar}  {p*100:.1f}%"
            ])
        elements.append(table(prob_rows, col_widths=[2.5*cm, 5.5*cm, 8*cm]))
    elements.append(Spacer(1, 6))

    # ── 6. VISUAL EXPLANATION (Side-by-Side Fundus & Grad-CAM) ──
    gradcam_path = ai.get("gradcam_path")
    original_path = quality.get("original_path")
    has_cam = gradcam_path and os.path.exists(gradcam_path)
    has_orig = original_path and os.path.exists(original_path)

    if has_cam or has_orig:
        elements.append(Paragraph("Explainable AI Visual Analysis", h2_style))
        elements.append(Paragraph(
            "Side-by-side comparison of original fundus photograph and model Grad-CAM heatmap overlay. "
            "Highlighted regions reflect relative feature attribution for the predicted class.",
            small_style
        ))

        img_cells = []
        cap_cells = []

        if has_orig and has_cam:
            try:
                orig_img = RLImage(original_path, width=7.5*cm, height=7.5*cm)
                cam_img = RLImage(gradcam_path, width=7.5*cm, height=7.5*cm)
                img_cells = [[orig_img, cam_img]]
                cap_cells = [[
                    Paragraph("<b>Original Retinal Fundus</b>", S("CAP1", fontSize=8, alignment=TA_CENTER, textColor=black)),
                    Paragraph("<b>Grad-CAM Heatmap Overlay</b><br/><font size=6.5 color='#64748b'>Target: Grade " + str(grade) + " (" + DR_GRADE_LABELS.get(grade, '') + ")</font>", S("CAP2", fontSize=8, alignment=TA_CENTER, textColor=black))
                ]]
                img_table = Table(img_cells + cap_cells, colWidths=[8*cm, 8*cm])
                img_table.setStyle(TableStyle([
                    ("ALIGN", (0,0), (-1,-1), "CENTER"),
                    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
                    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
                    ("TOPPADDING", (0,0), (-1,-1), 4),
                ]))
                elements.append(img_table)
            except Exception as e:
                elements.append(Paragraph(f"Visual explanation could not be embedded: {e}", small_style))
        elif has_cam:
            try:
                cam_img = RLImage(gradcam_path, width=8*cm, height=8*cm)
                elements.append(cam_img)
                elements.append(Paragraph("Grad-CAM Heatmap Overlay", small_style))
            except Exception:
                elements.append(Paragraph("Grad-CAM image could not be embedded.", small_style))
        elif has_orig:
            try:
                orig_img = RLImage(original_path, width=8*cm, height=8*cm)
                elements.append(orig_img)
                elements.append(Paragraph("Original Fundus Image", small_style))
            except Exception:
                elements.append(Paragraph("Original fundus image could not be embedded.", small_style))

        elements.append(Paragraph(
            "<b>Legend:</b> Blue (Minimal Activation) → Cyan → Yellow → Red (Maximum Activation). "
            "<i>Note: Grad-CAM highlights image regions influencing model classification. It does not represent a confirmed lesion segmentation mask.</i>",
            small_style
        ))
        elements.append(Spacer(1, 6))

    # ── 7. LESION EVIDENCE ────────────────────────────────────
    ls = (ai.get("lesion_summary") or {}) if ai else {}
    if ls and not ls.get("error"):
        elements.append(Paragraph("Lesion Evidence (CV/U-Net Analysis)", h2_style))
        elements.append(Paragraph(
            f"Provenance: {ls.get('provenance','—')} | "
            "All detections are model-indicated candidates — not clinically confirmed.",
            small_style
        ))

        ma  = ls.get("microaneurysms", {})
        hem = ls.get("hemorrhages",    {})
        ex  = ls.get("hard_exudates",  {})
        les_data = [
            ["Lesion Type",           "Candidate Count", "Total Area (px)"],
            ["Microaneurysm candidates",    str(ma.get("count",0)),  f"{ma.get('total_area_px',0):.0f}"],
            ["Hemorrhage candidates",       str(hem.get("count",0)), f"{hem.get('total_area_px',0):.0f}"],
            ["Hard Exudate candidates",     str(ex.get("count",0)),  f"{ex.get('total_area_px',0):.0f}"],
        ]
        elements.append(table(les_data, col_widths=[8*cm, 4.5*cm, 3.5*cm]))
        ev_score = ls.get("lesion_evidence_score", 0) or 0
        elements.append(Paragraph(
            f"Evidence Score: {ev_score*100:.0f}% | "
            f"Concordance: {ai.get('concordance_level','—')} | "
            f"Mismatch: {'YES ⚠' if ai.get('mismatch_detected') else 'No'}",
            small_style
        ))
        elements.append(Spacer(1, 6))

    # ── 8. ASSURANCE + REFERRAL ───────────────────────────────
    ass = report_data.get("assurance") or {}
    elements.append(Paragraph("Assurance Decision & Referral Priority", h2_style))

    decision = ass.get("decision", "—")
    dec_color = {"VALIDATED": C_GREEN,
                 "HUMAN_REVIEW_REQUIRED": C_YELLOW,
                 "RECAPTURE_REQUIRED": C_RED}.get(decision, C_GREY)
    priority  = ass.get("referral_priority", "—")

    ass_data = [
        ["Field", "Value"],
        ["Assurance Decision", decision],
        ["Referral Priority",  priority],
        ["Referral Score",     f"{ass.get('referral_score',0):.0f}/100" if ass.get('referral_score') is not None else "—"],
        ["Is Referable",       "YES" if ass.get("is_referable") else "NO"],
    ]
    t4 = table(ass_data, col_widths=[6*cm, 10*cm])
    t4.setStyle(TableStyle([
        ("TEXTCOLOR", (1,1),(1,1), dec_color),
        ("FONTNAME",  (1,1),(1,1), "Helvetica-Bold"),
        ("TEXTCOLOR", (1,2),(1,2), _priority_color(priority)),
        ("FONTNAME",  (1,2),(1,2), "Helvetica-Bold"),
    ]))
    elements.append(t4)

    reasons = ass.get("reasons") or []
    if reasons:
        elements.append(Spacer(1, 3))
        elements.append(Paragraph("Assurance Reasons:", S("RH", fontSize=8,
                         textColor=C_CYAN, spaceAfter=2)))
        for r in reasons:
            elements.append(Paragraph(f"• {r}", small_style))
    elements.append(Spacer(1, 6))

    # ── 9. RECOMMENDATION ─────────────────────────────────────
    rec = report_data.get("recommendation") or {}
    if rec:
        elements.append(Paragraph("Clinical Pathway Recommendation", h2_style))
        elements.append(Paragraph(
            f"<b>Pathway:</b> {rec.get('clinical_pathway','—').replace('_',' ')}",
            body_style
        ))
        elements.append(Paragraph(
            f"<b>Action:</b> {rec.get('action','—')}", body_style
        ))
        elements.append(Paragraph(
            "⚠ This recommendation is a prototype screening-support suggestion, "
            "not a medical diagnosis or clinical order.",
            warn_style
        ))
        elements.append(Spacer(1, 6))

    # ── 10. DOCTOR REVIEW ─────────────────────────────────────
    dr = report_data.get("doctor_review") or {}
    if dr and dr.get("doctor_grade") is not None:
        elements.append(Paragraph("Ophthalmologist Review", h2_style))
        dr_data = [
            ["Field", "Value"],
            ["Doctor Grade",
             f"Grade {dr['doctor_grade']} — {DR_GRADE_LABELS.get(dr['doctor_grade'],'—')}"],
            ["AI Grade Accepted", "Yes" if dr.get("ai_grade_accepted") else "No"],
            ["AI Grade Modified", "Yes ⚠" if dr.get("ai_grade_modified") else "No"],
            ["Reviewed At",       (dr.get("reviewed_at") or "—")[:16].replace("T"," ")],
            ["Clinical Notes",    dr.get("doctor_notes") or "—"],
        ]
        elements.append(table(dr_data, col_widths=[5*cm, 11*cm]))
        elements.append(Spacer(1, 6))

    # ── 11. MODEL PROVENANCE ──────────────────────────────────
    elements.append(HR())
    elements.append(Paragraph("Model & Audit Provenance", h2_style))
    prov_data = [
        ["Field", "Value"],
        ["Model",         ai.get("model_name","EfficientNet-B0")],
        ["Version",       ai.get("model_version","—")],
        ["Training Data", ai.get("training_dataset","—") or "—"],
        ["Weights Hash",  (ai.get("weights_hash") or "—")[:16] + "..."],
        ["Report ID",     report_data.get("report_id","—")],
        ["Generated By",  report_data.get("generated_by","SYSTEM")],
        ["Generated At",  report_data.get("generated_at","—")[:16].replace("T"," ")],
    ]
    elements.append(table(prov_data, col_widths=[5*cm, 11*cm]))
    elements.append(Spacer(1, 6))

    # ── 12. FOOTER ────────────────────────────────────────────
    elements += [
        HR(),
        Paragraph(DISCLAIMER, disc_style),
        Spacer(1, 4),
        Paragraph(
            "DRISHTI-X v0.1.0 — Explainable AI for Diabetic Retinopathy Screening in Rural India",
            S("FT", fontSize=7, textColor=C_GREY, alignment=TA_CENTER)
        ),
    ]

    doc.build(elements)
    return output_path


def _generate_text_fallback(report_data: Dict, output_path: str) -> str:
    """Plain-text fallback when reportlab is unavailable."""
    lines = [
        "DRISHTI-X — AI-Assisted DR Screening Report",
        "="*60,
        "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
        "="*60,
        "",
        f"Report ID:     {report_data.get('report_id','—')}",
        f"Generated:     {report_data.get('generated_at','—')}",
    ]
    pat = report_data.get("patient", {})
    lines += [
        f"Patient Code:  {pat.get('patient_code','—')}",
        f"Age:           {pat.get('age','—')}",
        "",
    ]
    ai = report_data.get("ai_prediction", {})
    grade = ai.get("predicted_grade")
    lines += [
        "AI PREDICTION:",
        f"  Grade:       {grade} — {DR_GRADE_LABELS.get(grade,'N/A') if grade is not None else 'N/A'}",
        f"  Confidence:  {ai.get('confidence',0)*100:.1f}%",
        f"  Referable:   {'YES' if ai.get('is_referable') else 'NO'}",
        f"  Model:       {ai.get('model_name','—')} {ai.get('model_status','—')}",
        "",
    ]
    ass = report_data.get("assurance", {})
    lines += [
        "ASSURANCE:",
        f"  Decision:    {ass.get('decision','—')}",
        f"  Priority:    {ass.get('referral_priority','—')}",
        "",
        "="*60,
        "AI-ASSISTED SCREENING — NOT A FINAL MEDICAL DIAGNOSIS",
    ]
    with open(output_path, "w") as f:
        f.write("\n".join(lines))
    return output_path
