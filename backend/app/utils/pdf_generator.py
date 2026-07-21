"""
PDF Report Generator — ReportLab
Generates professional PDFs for:
  - RCA reports
  - Work Permit documents
  - Compliance gap reports
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from datetime import datetime, timedelta
from pathlib import Path
import re
import io

W, H = A4
MARGIN = 18 * mm

NAVY   = colors.HexColor("#0C447C")
BLUE   = colors.HexColor("#378ADD")
TEAL   = colors.HexColor("#1D9E75")
AMBER  = colors.HexColor("#BA7517")
RED    = colors.HexColor("#D85A30")
LIGHT  = colors.HexColor("#F1F5FB")
MUTED  = colors.HexColor("#6B7280")
BORDER = colors.HexColor("#D1D5DB")
WHITE  = colors.white
BLACK  = colors.HexColor("#1F2937")
GREEN  = colors.HexColor("#1D9E75")
ORANGE = colors.HexColor("#ED8936")


def _styles():
    s = getSampleStyleSheet()
    return {
        "title":   ParagraphStyle("title",   fontName="Helvetica-Bold",
                                  fontSize=20, textColor=NAVY, leading=26, spaceAfter=4),
        "subtitle":ParagraphStyle("subtitle", fontName="Helvetica",
                                  fontSize=10, textColor=MUTED, leading=14, spaceAfter=2),
        "h2":      ParagraphStyle("h2",       fontName="Helvetica-Bold",
                                  fontSize=13, textColor=NAVY, leading=18,
                                  spaceBefore=10, spaceAfter=4),
        "h3":      ParagraphStyle("h3",       fontName="Helvetica-Bold",
                                  fontSize=11, textColor=NAVY, leading=16,
                                  spaceBefore=6, spaceAfter=3),
        "body":    ParagraphStyle("body",     fontName="Helvetica",
                                  fontSize=9.5, textColor=BLACK, leading=15, spaceAfter=3),
        "bold":    ParagraphStyle("bold",     fontName="Helvetica-Bold",
                                  fontSize=9.5, textColor=BLACK, leading=15, spaceAfter=2),
        "small":   ParagraphStyle("small",    fontName="Helvetica",
                                  fontSize=8, textColor=MUTED, leading=12),
        "center":  ParagraphStyle("center",   fontName="Helvetica",
                                  fontSize=9, alignment=TA_CENTER, leading=13),
        "tbl_hdr": ParagraphStyle("tbl_hdr",  fontName="Helvetica-Bold",
                                  fontSize=8.5, textColor=WHITE, leading=12),
        "tbl":     ParagraphStyle("tbl",      fontName="Helvetica",
                                  fontSize=8.5, textColor=BLACK, leading=12),
        "danger":  ParagraphStyle("danger",   fontName="Helvetica-Bold",
                                  fontSize=9.5, textColor=colors.HexColor("#E53E3E"), leading=15),
        "warning": ParagraphStyle("warning",  fontName="Helvetica-Bold",
                                  fontSize=9.5, textColor=ORANGE, leading=15),
        "success": ParagraphStyle("success",  fontName="Helvetica-Bold",
                                  fontSize=9.5, textColor=GREEN, leading=15),
    }


def _hr(color=BORDER, thickness=0.5, space=4):
    return HRFlowable(width="100%", thickness=thickness,
                      color=color, spaceAfter=space, spaceBefore=space)


def _clean_line(line: str) -> str:
    """Strip box-drawing characters and leading bullets/checkboxes."""
    # Remove box-drawing divider lines entirely
    if re.match(r'^[═─■✔☐]{3,}', line.strip()):
        return ""
    # Strip leading box chars but keep content
    line = re.sub(r'^[═─■]{2,}\s*', '', line)
    # Escape XML special chars for ReportLab
    line = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return line


def _meta_table(rows: list[tuple], styles) -> Table:
    data = [[Paragraph(k, styles["bold"]), Paragraph(v or "—", styles["body"])]
            for k, v in rows]
    t = Table(data, colWidths=[(W - 2*MARGIN) * 0.28, (W - 2*MARGIN) * 0.72])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT),
        ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


def _source_table(sources: list[dict], styles) -> Table:
    if not sources:
        return Paragraph("No sources cited.", styles["small"])
    rows = [[
        Paragraph("Document", styles["tbl_hdr"]),
        Paragraph("Page",     styles["tbl_hdr"]),
        Paragraph("Relevance",styles["tbl_hdr"]),
    ]]
    for s in sources:
        score = s.get("score", 0) or s.get("rerank_score", 0)
        rows.append([
            Paragraph(str(s.get("filename", "—")), styles["tbl"]),
            Paragraph(str(s.get("page", 0)),       styles["tbl"]),
            Paragraph(f"{round(float(score) * 100)}%", styles["tbl"]),
        ])
    cw = [(W - 2*MARGIN) * x for x in [0.60, 0.15, 0.25]]
    t = Table(rows, colWidths=cw, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 6),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def _header_box(title: str, subtitle: str, doc_num: str, styles) -> list:
    header_data = [[
        Paragraph(f"<font color='white'><b>{title}</b></font>", styles["title"]),
        Paragraph(f"<font color='#c8dff5'>{doc_num}</font>", styles["center"]),
    ]]
    t = Table(header_data, colWidths=[(W - 2*MARGIN) * 0.75, (W - 2*MARGIN) * 0.25])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 4),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
    ]))
    sub = Table([[Paragraph(f"<font color='#c8dff5'>{subtitle}</font>", styles["small"])]],
                colWidths=[W - 2*MARGIN])
    sub.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, -1), NAVY),
        ("LEFTPADDING",  (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING",   (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 14),
    ]))
    return [t, sub]


def _section_header(text: str, styles, color=NAVY) -> list:
    """Styled section header with colored left border effect."""
    data = [[Paragraph(f"<b>{text}</b>", styles["h2"])]]
    t = Table(data, colWidths=[W - 2*MARGIN])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), LIGHT),
        ("LINEAFTER",     (0, 0), (-1, -1), 0, LIGHT),
        ("LINEBEFORE",    (0, 0), (-1, -1), 4, color),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID",          (0, 0), (-1, -1), 0.3, BORDER),
    ]))
    return [t, Spacer(1, 4)]


def _parse_content_to_story(text: str, styles) -> list:
    """Convert RCA/compliance text into ReportLab story elements.
    Strips box-drawing chars and renders sections cleanly."""
    story = []

    for raw_line in text.split("\n"):
        line = raw_line.rstrip()
        clean = _clean_line(line)

        # Skip empty/divider-only lines
        if not clean.strip():
            story.append(Spacer(1, 3))
            continue

        # Section headers (numbered like "1. Probable Failure Mode" or "## Header")
        if re.match(r'^\d+\.\s+[A-Z]', clean):
            story.append(Spacer(1, 6))
            story += _section_header(clean, styles, BLUE)
            continue

        if clean.startswith("## "):
            story.append(Spacer(1, 6))
            story += _section_header(clean[3:], styles, BLUE)
            continue

        if clean.startswith("### ") or clean.startswith("**") and clean.endswith("**"):
            text_content = clean[4:] if clean.startswith("### ") else clean[2:-2]
            story.append(Paragraph(f"<b>{text_content}</b>", styles["bold"]))
            continue

        # Severity labels
        if re.search(r'(critical|severity)', clean, re.I):
            story.append(Paragraph(clean, styles["danger"]))
            continue

        # Bullet points and checklist items
        if re.match(r'^[•\-✔✓☐]\s', clean):
            item = re.sub(r'^[•\-✔✓☐]\s*', '', clean)
            story.append(Paragraph(f"&bull; {item}", styles["body"]))
            continue

        # Numbered list items
        if re.match(r'^\d+\.\s', clean) and len(clean) < 200:
            story.append(Paragraph(clean, styles["body"]))
            continue

        # Key: Value pairs
        if re.match(r'^[A-Za-z ]+:', clean) and len(clean.split(':')[0]) < 30:
            parts = clean.split(':', 1)
            story.append(Paragraph(
                f"<b>{parts[0]}:</b>{parts[1] if len(parts) > 1 else ''}",
                styles["body"]
            ))
            continue

        # Skip markdown table separator rows
        if re.match(r'^[\|\s\-:]+$', clean):
            continue

        # Markdown table rows — convert to pipe-separated text
        if clean.startswith("|"):
            cells = [c.strip() for c in clean.split("|") if c.strip()]
            story.append(Paragraph(" · ".join(cells), styles["tbl"]))
            continue

        # Default body text
        story.append(Paragraph(clean, styles["body"]))

    return story


# ── PUBLIC API ─────────────────────────────────────────────────────────────────

def generate_rca_pdf(
    equipment_id: str,
    symptom: str,
    rca_content: str,
    sources: list[dict],
    plant_id: str = "plant_001",
) -> bytes:
    buf   = io.BytesIO()
    doc   = SimpleDocTemplate(buf, pagesize=A4,
                              leftMargin=MARGIN, rightMargin=MARGIN,
                              topMargin=MARGIN, bottomMargin=MARGIN)
    ST    = _styles()
    now   = datetime.now()
    doc_no = f"RCA-{now.strftime('%Y%m%d-%H%M')}"
    story = []

    story += _header_box(
        "Root Cause Analysis Report",
        "IndustrialMind · AI-Powered Industrial Knowledge Intelligence",
        doc_no, ST,
    )
    story.append(Spacer(1, 10))

    story.append(_meta_table([
        ("Equipment ID",        equipment_id),
        ("Plant",               plant_id),
        ("Failure Description", symptom[:200] + "…" if len(symptom) > 200 else symptom),
        ("Generated",           now.strftime("%d %b %Y, %H:%M")),
        ("Generated by",        "IndustrialMind RCA Agent (Groq llama-3.3-70b)"),
    ], ST))
    story.append(Spacer(1, 10))

    story += _parse_content_to_story(rca_content, ST)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Source Documents", ST["h2"]))
    story.append(_hr(BLUE, 0.8, 3))
    story.append(_source_table(sources, ST))
    story.append(Spacer(1, 10))

    story.append(_hr(MUTED, 0.4, 4))
    story.append(Paragraph(
        f"This report was auto-generated by IndustrialMind on {now.strftime('%d %b %Y')}. "
        "Verify all recommendations with qualified engineering personnel before implementation.",
        ST["small"]
    ))

    doc.build(story)
    return buf.getvalue()


def generate_permit_pdf(
    equipment_id: str,
    work_type: str,
    location: str,
    permit_content: str,
    sources: list[dict],
    plant_id: str = "plant_001",
    # ── NEW: accept real dates from supervisor ────────────────────────────────
    ptw_number: str = "",
    date_issued: str = "",
    valid_until: str = "",
) -> bytes:
    buf   = io.BytesIO()
    doc   = SimpleDocTemplate(buf, pagesize=A4,
                              leftMargin=MARGIN, rightMargin=MARGIN,
                              topMargin=MARGIN, bottomMargin=MARGIN)
    ST    = _styles()
    now   = datetime.now()

    # Use real values from supervisor if provided, otherwise generate
    _ptw_number  = ptw_number  or f"PTW-{equipment_id.upper()}-{now.strftime('%Y%m%d-%H%M')}"
    _date_issued = date_issued or now.strftime("%d %b %Y %H:%M")
    _valid_until = valid_until or (now + timedelta(hours=12)).strftime("%d %b %Y %H:%M")

    story = []

    story += _header_box(
        "Permit to Work",
        "IndustrialMind · Auto-generated from plant safety procedures",
        _ptw_number, ST,
    )
    story.append(Spacer(1, 10))

    story.append(_meta_table([
        ("Permit No",    _ptw_number),
        ("Equipment ID", equipment_id),
        ("Work Type",    work_type),
        ("Location",     location),
        ("Plant",        plant_id),
        ("Issue Date",   _date_issued),
        ("Valid Until",  _valid_until),
        ("Status",       "DRAFT — Requires authorised sign-off before work commences"),
    ], ST))
    story.append(Spacer(1, 10))

    story += _parse_content_to_story(permit_content, ST)
    story.append(Spacer(1, 10))

    # Sources
    story.append(Paragraph("Source Procedures Referenced", ST["h2"]))
    story.append(_hr(BLUE, 0.8, 3))
    story.append(_source_table(sources, ST))
    story.append(Spacer(1, 10))

    # Sign-off box
    story.append(Paragraph("Authorisation", ST["h2"]))
    story.append(_hr(BLUE, 0.8, 3))
    sign_data = [
        [Paragraph("<b>Issuing Authority</b>", ST["tbl_hdr"]),
         Paragraph("<b>Safety Officer</b>",    ST["tbl_hdr"]),
         Paragraph("<b>Area Engineer</b>",     ST["tbl_hdr"]),
         Paragraph("<b>Performing Team Lead</b>", ST["tbl_hdr"])],
        [Paragraph("Name: _______________", ST["tbl"]),
         Paragraph("Name: _______________", ST["tbl"]),
         Paragraph("Name: _______________", ST["tbl"]),
         Paragraph("Name: _______________", ST["tbl"])],
        [Paragraph("Sign: _______________", ST["tbl"]),
         Paragraph("Sign: _______________", ST["tbl"]),
         Paragraph("Sign: _______________", ST["tbl"]),
         Paragraph("Sign: _______________", ST["tbl"])],
        [Paragraph("Date: _______________", ST["tbl"]),
         Paragraph("Date: _______________", ST["tbl"]),
         Paragraph("Date: _______________", ST["tbl"]),
         Paragraph("Date: _______________", ST["tbl"])],
    ]
    st_sign = Table(sign_data, colWidths=[(W - 2*MARGIN) / 4] * 4)
    st_sign.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(st_sign)
    story.append(Spacer(1, 8))

    # Permit closure box
    story.append(Paragraph("Permit Closure", ST["h2"]))
    story.append(_hr(BLUE, 0.8, 3))
    closure_data = [
        [Paragraph("<b>Item</b>", ST["tbl_hdr"]),
         Paragraph("<b>Status</b>", ST["tbl_hdr"]),
         Paragraph("<b>Notes</b>", ST["tbl_hdr"])],
        [Paragraph("Work completed", ST["tbl"]),
         Paragraph("☐ Yes   ☐ No", ST["tbl"]),
         Paragraph("", ST["tbl"])],
        [Paragraph("Area restored to safe condition", ST["tbl"]),
         Paragraph("☐ Yes   ☐ No", ST["tbl"]),
         Paragraph("", ST["tbl"])],
        [Paragraph("Isolation removed", ST["tbl"]),
         Paragraph("☐ Yes   ☐ No", ST["tbl"]),
         Paragraph("", ST["tbl"])],
        [Paragraph("Closed by", ST["tbl"]),
         Paragraph("Name: _______________", ST["tbl"]),
         Paragraph("Sign: _______  Date: _______", ST["tbl"])],
    ]
    cw_closure = [(W - 2*MARGIN) * x for x in [0.4, 0.25, 0.35]]
    t_closure = Table(closure_data, colWidths=cw_closure)
    t_closure.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0), NAVY),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",          (0, 0), (-1, -1), 0.4, BORDER),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(t_closure)
    story.append(Spacer(1, 10))

    story.append(_hr(MUTED, 0.4, 4))
    story.append(Paragraph(
        f"DRAFT permit generated by IndustrialMind on {_date_issued}. "
        "This document must be reviewed and signed by authorised personnel before work commences. "
        "Not valid without signatures.",
        ST["small"]
    ))

    doc.build(story)
    return buf.getvalue()


def generate_compliance_pdf(
    standard: str,
    content: str,
    sources: list[dict],
    plant_id: str = "plant_001",
) -> bytes:
    buf   = io.BytesIO()
    doc   = SimpleDocTemplate(buf, pagesize=A4,
                              leftMargin=MARGIN, rightMargin=MARGIN,
                              topMargin=MARGIN, bottomMargin=MARGIN)
    ST    = _styles()
    now   = datetime.now()
    doc_no = f"COMP-{now.strftime('%Y%m%d-%H%M')}"
    story = []

    story += _header_box(
        "Compliance Gap Analysis Report",
        f"Standard: {standard} · IndustrialMind",
        doc_no, ST,
    )
    story.append(Spacer(1, 10))

    story.append(_meta_table([
        ("Standard",     standard),
        ("Plant",        plant_id),
        ("Generated",    now.strftime("%d %b %Y, %H:%M")),
        ("Generated by", "IndustrialMind Compliance Engine (DeepSeek R1)"),
    ], ST))
    story.append(Spacer(1, 10))

    story += _parse_content_to_story(content, ST)
    story.append(Spacer(1, 10))

    story.append(Paragraph("Source Documents Reviewed", ST["h2"]))
    story.append(_hr(BLUE, 0.8, 3))
    story.append(_source_table(sources, ST))
    story.append(Spacer(1, 10))

    story.append(_hr(MUTED, 0.4, 4))
    story.append(Paragraph(
        f"Report generated by IndustrialMind on {now.strftime('%d %b %Y')}. "
        "All gap findings should be reviewed by qualified safety engineers. "
        "Rectify critical and major gaps before next audit.",
        ST["small"]
    ))

    doc.build(story)
    return buf.getvalue()


if __name__ == "__main__":
    rca_bytes = generate_rca_pdf(
        equipment_id="P-101A",
        symptom="Excessive vibration and bearing temperature alarm at 85°C before trip.",
        rca_content="## Immediate Cause\nBearing failure due to inadequate lubrication.\n\n## 5-Why Analysis\n- Why 1: Excessive vibration detected\n- Why 2: Bearing wear from insufficient lubrication\n- Why 5 (Root Cause): Lubrication schedule not followed\n\n## Corrective Actions\n✔ IMMEDIATE: Inspect bearing and replace\n✔ SHORT-TERM: Restore lubrication interval to 500h\n✔ LONG-TERM: Install continuous vibration monitoring",
        sources=[{"filename": "pump_manual.pdf", "page": 14, "score": 0.91}],
    )
    Path("/tmp/test_rca.pdf").write_bytes(rca_bytes)
    print(f"RCA PDF: {len(rca_bytes)} bytes")

    permit_bytes = generate_permit_pdf(
        equipment_id="P-101A",
        work_type="Mechanical maintenance",
        location="Unit 3 North",
        permit_content="## Hazard Identification\n• Rotating equipment — mechanical injury risk\n• Hot surfaces above 60°C\n• Potential fluid leak\n\n## PPE Requirements\n• Safety helmet EN397\n• Cut-resistant gloves\n• Safety glasses\n\n## Isolation Requirements (LOTO)\n✔ Step 1: De-energise electrical supply\n✔ Step 2: Lockout inlet/outlet valves\n✔ Step 3: Tagout with permit number\n✔ Step 4: Bleed residual pressure\n✔ Step 5: Verify zero energy state\n\n## Pre-Work Sign-Off Checklist\n☐ 1. Area inspected\n☐ 2. Isolation confirmed\n☐ 3. Gas test performed",
        sources=[{"filename": "safety_procedure.pdf", "page": 5, "score": 0.88}],
        ptw_number="PTW-P-101A-20260721-1430",
        date_issued="21 Jul 2026 14:30",
        valid_until="22 Jul 2026 02:30",
    )
    Path("/tmp/test_permit.pdf").write_bytes(permit_bytes)
    print(f"Permit PDF: {len(permit_bytes)} bytes")

    compliance_bytes = generate_compliance_pdf(
        standard="OISD-105",
        content="## Executive Summary\nOverall Score: 7/10\nStatus: Partially Compliant\n\n## Compliant Items\n• Pressure vessel inspection records maintained\n• Safety relief valves tested annually\n\n## Compliance Gaps\nGAP 1 — Severity: Major\nClause: OISD-105 Section 4.2\nFinding: Inspection intervals not documented\nEvidence: No records found\nImpact: Regulatory violation risk",
        sources=[{"filename": "OISD-STD-105.pdf", "page": 14, "score": 0.91}],
    )
    Path("/tmp/test_compliance.pdf").write_bytes(compliance_bytes)
    print(f"Compliance PDF: {len(compliance_bytes)} bytes")

    print("All PDF tests passed ✅")