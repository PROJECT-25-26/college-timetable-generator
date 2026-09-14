"""
exporter.py — PDF and Excel exporter for College Timetable.

Supports three scopes:
  - 'class': Per-class timetable(s)
  - 'teacher': Per-teacher timetable(s)
  - 'master': Master timetable (matrix + section/teacher breakdown + slot list)
"""

import io
from datetime import datetime
import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def format_subject_label(subj: dict) -> str:
    if not subj:
        return "Subject"
    name = str(subj.get("name") or "").strip()
    code = str(subj.get("code") or "").strip()
    if name and code:
        if name.lower() == code.lower():
            return name
        return f"{name} ({code})"
    return name or code or "Subject"


# ── Numbered Canvas for PDF page numbers ──────────────────────────────────────
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(self._pagesize[0] - 36, 20, page_text)
        self.drawString(36, 20, "College Timetable Generator • Confidential Schedule")
        self.setStrokeColor(colors.HexColor("#e2e8f0"))
        self.setLineWidth(0.5)
        self.line(36, 32, self._pagesize[0] - 36, 32)
        self.restoreState()


# ── PDF EXPORT GENERATOR ──────────────────────────────────────────────────────
def generate_pdf_export(
    timetable_label: str,
    slots: list,
    scope: str,
    entity_id: str | None,
    section_map: dict,
    teacher_map: dict,
    subject_map: dict,
    room_map: dict,
    working_days: list[int] | None = None,
    periods_per_day: int = 8,
) -> bytes:
    buffer = io.BytesIO()

    # Determine pagesize
    is_landscape = scope == "master"
    pagesize = landscape(letter) if is_landscape else letter
    margin = 36  # 0.5 inch

    doc = SimpleDocTemplate(
        buffer,
        pagesize=pagesize,
        leftMargin=margin,
        rightMargin=margin,
        topMargin=margin,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
    )
    subtitle_style = ParagraphStyle(
        "DocSubTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#2563eb"),
    )
    meta_style = ParagraphStyle(
        "MetaInfo",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
    )
    cell_head_style = ParagraphStyle(
        "CellHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=1,  # Center
        textColor=colors.white,
    )
    cell_subj_style = ParagraphStyle(
        "CellSubj",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=1,
        textColor=colors.HexColor("#1e1b4b"),
    )
    cell_info_style = ParagraphStyle(
        "CellInfo",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=9.5,
        alignment=1,
        textColor=colors.HexColor("#334155"),
    )
    cell_time_style = ParagraphStyle(
        "CellTime",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        alignment=1,
        textColor=colors.HexColor("#475569"),
    )

    days = working_days if working_days else [0, 1, 2, 3, 4]
    days = [d for d in days if 0 <= d <= 6]
    if not days:
        days = [0, 1, 2, 3, 4]

    elements = []
    generated_at = datetime.now().strftime("%B %d, %Y at %I:%M %p")

    def make_header(subtitle_text):
        hdr = [
            Paragraph("COLLEGE TIMETABLE SCHEDULE", title_style),
            Spacer(1, 2),
            Paragraph(subtitle_text, subtitle_style),
            Spacer(1, 4),
            Paragraph(f"Run Label: <b>{timetable_label or 'Default Run'}</b> &nbsp;•&nbsp; Exported: <b>{generated_at}</b>", meta_style),
            Spacer(1, 8),
            HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#2563eb"), spaceAfter=12),
        ]
        return hdr

    # Filter targets
    if scope == "class":
        sections_to_export = []
        if entity_id:
            if entity_id in section_map:
                sections_to_export = [entity_id]
        else:
            seen = {s.get("section_id") for s in slots if s.get("section_id")}
            sections_to_export = sorted(list(seen), key=lambda x: section_map.get(x, {}).get("name", x))

        if not sections_to_export:
            sections_to_export = list(section_map.keys())

        for idx, sec_id in enumerate(sections_to_export):
            if idx > 0:
                elements.append(PageBreak())

            sec_info = section_map.get(sec_id, {})
            sec_name = sec_info.get("name") or sec_info.get("code") or f"Class {sec_id}"
            homeroom_id = sec_info.get("homeroom_id")
            homeroom_code = room_map.get(homeroom_id, {}).get("code") if homeroom_id else None
            sub_title = f"Class Section Timetable — {sec_name}"
            if homeroom_code:
                sub_title += f" (Homeroom: {homeroom_code})"

            elements.extend(make_header(sub_title))

            # Build slots lookup: (day, period) -> slot
            sec_slots = [s for s in slots if s.get("section_id") == sec_id]
            by_cell = {(s["day_of_week"], s["period_index"]): s for s in sec_slots}

            # Build grid table
            headers = [Paragraph("Period", cell_head_style)] + [
                Paragraph(DAY_NAMES[d], cell_head_style) for d in days
            ]
            table_data = [headers]

            # Width calculation
            avail_w = (pagesize[0] - 2 * margin)
            num_cols = len(days) + 1
            col_widths = [0.8 * inch] + [(avail_w - 0.8 * inch) / len(days)] * len(days)

            for p in range(periods_per_day):
                row = [Paragraph(f"Period {p+1}", cell_time_style)]
                for d in days:
                    sl = by_cell.get((d, p))
                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        teach = teacher_map.get(sl.get("teacher_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_name = format_subject_label(subj)
                        teach_name = teach.get("name") or "—"
                        room_code = room.get("code") or "—"

                        cell_p = [
                            Paragraph(subj_name, cell_subj_style),
                            Spacer(1, 2),
                            Paragraph(f"{teach_name}<br/>Room: {room_code}", cell_info_style),
                        ]
                        row.append(cell_p)
                    else:
                        row.append(Paragraph("—", cell_info_style))
                table_data.append(row)

            t = Table(table_data, colWidths=col_widths, repeatRows=1)
            ts = [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f1f5f9")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]

            # Alternating background for occupied rows
            for r_idx in range(1, len(table_data)):
                bg = colors.white if r_idx % 2 != 0 else colors.HexColor("#f8fafc")
                ts.append(("BACKGROUND", (1, r_idx), (-1, r_idx), bg))

            t.setStyle(TableStyle(ts))
            elements.append(t)

    elif scope == "teacher":
        teachers_to_export = []
        if entity_id:
            if entity_id in teacher_map:
                teachers_to_export = [entity_id]
        else:
            seen = {s.get("teacher_id") for s in slots if s.get("teacher_id")}
            teachers_to_export = sorted(list(seen), key=lambda x: teacher_map.get(x, {}).get("name", x))

        if not teachers_to_export:
            teachers_to_export = list(teacher_map.keys())

        for idx, t_id in enumerate(teachers_to_export):
            if idx > 0:
                elements.append(PageBreak())

            t_info = teacher_map.get(t_id, {})
            t_name = t_info.get("name") or f"Teacher {t_id}"
            dept_name = t_info.get("department_name") or "Faculty"
            sub_title = f"Teacher Schedule — {t_name} ({dept_name})"

            elements.extend(make_header(sub_title))

            t_slots = [s for s in slots if s.get("teacher_id") == t_id]
            by_cell = {(s["day_of_week"], s["period_index"]): s for s in t_slots}

            headers = [Paragraph("Period", cell_head_style)] + [
                Paragraph(DAY_NAMES[d], cell_head_style) for d in days
            ]
            table_data = [headers]

            avail_w = (pagesize[0] - 2 * margin)
            col_widths = [0.8 * inch] + [(avail_w - 0.8 * inch) / len(days)] * len(days)

            for p in range(periods_per_day):
                row = [Paragraph(f"Period {p+1}", cell_time_style)]
                for d in days:
                    sl = by_cell.get((d, p))
                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        sec = section_map.get(sl.get("section_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_name = format_subject_label(subj)
                        sec_name = sec.get("name") or sec.get("code") or "—"
                        room_code = room.get("code") or "—"

                        cell_p = [
                            Paragraph(subj_name, cell_subj_style),
                            Spacer(1, 2),
                            Paragraph(f"Class: {sec_name}<br/>Room: {room_code}", cell_info_style),
                        ]
                        row.append(cell_p)
                    else:
                        row.append(Paragraph("Free", cell_info_style))
                table_data.append(row)

            t = Table(table_data, colWidths=col_widths, repeatRows=1)
            ts = [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f766e")),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f1f5f9")),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
            for r_idx in range(1, len(table_data)):
                bg = colors.white if r_idx % 2 != 0 else colors.HexColor("#f0fdf4")
                ts.append(("BACKGROUND", (1, r_idx), (-1, r_idx), bg))

            t.setStyle(TableStyle(ts))
            elements.append(t)

    else:
        # Master scope — landscape overview matrix + per-section summary
        elements.extend(make_header("Master College Timetable — Comprehensive Overview"))

        sec_ids = sorted(list(section_map.keys()), key=lambda x: section_map.get(x, {}).get("name", x))
        if not sec_ids:
            seen_secs = {s.get("section_id") for s in slots if s.get("section_id")}
            sec_ids = sorted(list(seen_secs))

        # Master matrix: Rows = (Day, Period), Cols = Section 1, Section 2...
        headers = [Paragraph("Day & Period", cell_head_style)] + [
            Paragraph(section_map.get(s_id, {}).get("code") or section_map.get(s_id, {}).get("name") or s_id[:6], cell_head_style)
            for s_id in sec_ids
        ]
        table_data = [headers]

        avail_w = (pagesize[0] - 2 * margin)
        col_w_first = 1.1 * inch
        rem_w = avail_w - col_w_first
        col_w_rest = rem_w / max(1, len(sec_ids))
        col_widths = [col_w_first] + [col_w_rest] * len(sec_ids)

        slot_lookup = {(s["section_id"], s["day_of_week"], s["period_index"]): s for s in slots if s.get("section_id")}

        for d in days:
            for p in range(periods_per_day):
                row = [Paragraph(f"{DAY_SHORT[d]} • P{p+1}", cell_time_style)]
                for s_id in sec_ids:
                    sl = slot_lookup.get((s_id, d, p))
                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        teach = teacher_map.get(sl.get("teacher_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_str = format_subject_label(subj)
                        teach_str = teach.get("name") or ""
                        room_str = room.get("code") or ""

                        cell_text = f"<b>{subj_str}</b><br/>{teach_str}<br/>{room_str}"
                        row.append(Paragraph(cell_text, cell_info_style))
                    else:
                        row.append(Paragraph("—", cell_info_style))
                table_data.append(row)

        t = Table(table_data, colWidths=col_widths, repeatRows=1)
        ts = [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e1b4b")),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("BACKGROUND", (0, 1), (0, -1), colors.HexColor("#f1f5f9")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        t.setStyle(TableStyle(ts))
        elements.append(t)

    doc.build(elements, canvasmaker=NumberedCanvas)
    return buffer.getvalue()


# ── EXCEL EXPORT GENERATOR ────────────────────────────────────────────────────
def generate_excel_export(
    timetable_label: str,
    slots: list,
    scope: str,
    entity_id: str | None,
    section_map: dict,
    teacher_map: dict,
    subject_map: dict,
    room_map: dict,
    working_days: list[int] | None = None,
    periods_per_day: int = 8,
) -> bytes:
    wb = openpyxl.Workbook()
    # Remove default sheet
    wb.remove(wb.active)

    days = working_days if working_days else [0, 1, 2, 3, 4]
    days = [d for d in days if 0 <= d <= 6]
    if not days:
        days = [0, 1, 2, 3, 4]

    # Style definitions
    font_title = Font(name="Calibri", size=14, bold=True, color="FFFFFF")
    font_sub = Font(name="Calibri", size=10, italic=True, color="E2E8F0")
    font_header = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
    font_period = Font(name="Calibri", size=10, bold=True, color="334155")
    font_body = Font(name="Calibri", size=10, color="0F172A")
    font_empty = Font(name="Calibri", size=10, color="94A3B8")

    fill_title = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    fill_header_class = PatternFill(start_color="2563EB", end_color="2563EB", fill_type="solid")
    fill_header_teacher = PatternFill(start_color="0F766E", end_color="0F766E", fill_type="solid")
    fill_header_master = PatternFill(start_color="4338CA", end_color="4338CA", fill_type="solid")

    fill_alt = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    fill_period = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")

    thin_border = Border(
        left=Side(style="thin", color="CBD5E1"),
        right=Side(style="thin", color="CBD5E1"),
        top=Side(style="thin", color="CBD5E1"),
        bottom=Side(style="thin", color="CBD5E1"),
    )

    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    align_left = Alignment(horizontal="left", vertical="center")

    def setup_sheet_header(ws, title_text, fill_hdr):
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(days) + 1)
        c1 = ws.cell(row=1, column=1, value=f"COLLEGE TIMETABLE — {title_text.upper()}")
        c1.font = font_title
        c1.fill = fill_title
        c1.alignment = align_center

        ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(days) + 1)
        sub_str = f"Timetable Run: {timetable_label or 'Default'} | Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        c2 = ws.cell(row=2, column=1, value=sub_str)
        c2.font = font_sub
        c2.fill = fill_title
        c2.alignment = align_center

        ws.row_dimensions[1].height = 25
        ws.row_dimensions[2].height = 18

        # Day Headers row 4
        ws.cell(row=4, column=1, value="Period").font = font_header
        ws.cell(row=4, column=1).fill = fill_hdr
        ws.cell(row=4, column=1).alignment = align_center
        ws.cell(row=4, column=1).border = thin_border

        for d_idx, d in enumerate(days):
            col = d_idx + 2
            cell = ws.cell(row=4, column=col, value=DAY_NAMES[d])
            cell.font = font_header
            cell.fill = fill_hdr
            cell.alignment = align_center
            cell.border = thin_border

        ws.row_dimensions[4].height = 22

    # ── EXPORT SCOPES ────────────────────────────────────────────────────────
    if scope == "class":
        sections = [entity_id] if entity_id and entity_id in section_map else list(section_map.keys())
        if not sections:
            sections = sorted(list({s.get("section_id") for s in slots if s.get("section_id")}))

        for sec_id in sections:
            sec_info = section_map.get(sec_id, {})
            sec_name = sec_info.get("code") or sec_info.get("name") or f"Class_{sec_id[:4]}"
            sheet_title = str(sec_name)[:31].replace("/", "-")

            ws = wb.create_sheet(title=sheet_title)
            setup_sheet_header(ws, f"Class {sec_name}", fill_header_class)

            sec_slots = [s for s in slots if s.get("section_id") == sec_id]
            by_cell = {(s["day_of_week"], s["period_index"]): s for s in sec_slots}

            for p in range(periods_per_day):
                r = p + 5
                ws.row_dimensions[r].height = 42
                p_cell = ws.cell(row=r, column=1, value=f"Period {p+1}")
                p_cell.font = font_period
                p_cell.fill = fill_period
                p_cell.alignment = align_center
                p_cell.border = thin_border

                for d_idx, d in enumerate(days):
                    col = d_idx + 2
                    sl = by_cell.get((d, p))
                    cell = ws.cell(row=r, column=col)
                    cell.border = thin_border
                    cell.alignment = align_center

                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        teach = teacher_map.get(sl.get("teacher_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_str = format_subject_label(subj)
                        teach_str = teach.get("name") or "—"
                        room_str = room.get("code") or "—"

                        cell.value = f"{subj_str}\n{teach_str}\nRoom: {room_str}"
                        cell.font = font_body
                        if r % 2 == 0:
                            cell.fill = fill_alt
                    else:
                        cell.value = "—"
                        cell.font = font_empty

            ws.column_dimensions["A"].width = 14
            for d_idx in range(len(days)):
                col_letter = get_column_letter(d_idx + 2)
                ws.column_dimensions[col_letter].width = 24

    elif scope == "teacher":
        teachers = [entity_id] if entity_id and entity_id in teacher_map else list(teacher_map.keys())
        if not teachers:
            teachers = sorted(list({s.get("teacher_id") for s in slots if s.get("teacher_id")}))

        for t_id in teachers:
            t_info = teacher_map.get(t_id, {})
            t_name = t_info.get("name") or f"Teacher_{t_id[:4]}"
            sheet_title = str(t_name)[:31].replace("/", "-")

            ws = wb.create_sheet(title=sheet_title)
            setup_sheet_header(ws, f"Teacher Schedule — {t_name}", fill_header_teacher)

            t_slots = [s for s in slots if s.get("teacher_id") == t_id]
            by_cell = {(s["day_of_week"], s["period_index"]): s for s in t_slots}

            for p in range(periods_per_day):
                r = p + 5
                ws.row_dimensions[r].height = 42
                p_cell = ws.cell(row=r, column=1, value=f"Period {p+1}")
                p_cell.font = font_period
                p_cell.fill = fill_period
                p_cell.alignment = align_center
                p_cell.border = thin_border

                for d_idx, d in enumerate(days):
                    col = d_idx + 2
                    sl = by_cell.get((d, p))
                    cell = ws.cell(row=r, column=col)
                    cell.border = thin_border
                    cell.alignment = align_center

                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        sec = section_map.get(sl.get("section_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_str = format_subject_label(subj)
                        sec_str = sec.get("name") or sec.get("code") or "—"
                        room_str = room.get("code") or "—"

                        cell.value = f"{subj_str}\nClass: {sec_str}\nRoom: {room_str}"
                        cell.font = font_body
                        if r % 2 == 0:
                            cell.fill = fill_alt
                    else:
                        cell.value = "Free"
                        cell.font = font_empty

            ws.column_dimensions["A"].width = 14
            for d_idx in range(len(days)):
                col_letter = get_column_letter(d_idx + 2)
                ws.column_dimensions[col_letter].width = 24

    else:
        # Master scope
        ws_matrix = wb.create_sheet(title="Master Matrix")
        sec_ids = sorted(list(section_map.keys()), key=lambda x: section_map.get(x, {}).get("name", x))

        ws_matrix.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(sec_ids) + 2)
        c1 = ws_matrix.cell(row=1, column=1, value="COLLEGE MASTER TIMETABLE MATRIX")
        c1.font = font_title
        c1.fill = fill_title
        c1.alignment = align_center

        ws_matrix.cell(row=3, column=1, value="Day").font = font_header
        ws_matrix.cell(row=3, column=1).fill = fill_header_master
        ws_matrix.cell(row=3, column=1).alignment = align_center

        ws_matrix.cell(row=3, column=2, value="Period").font = font_header
        ws_matrix.cell(row=3, column=2).fill = fill_header_master
        ws_matrix.cell(row=3, column=2).alignment = align_center

        for s_idx, s_id in enumerate(sec_ids):
            c_col = s_idx + 3
            sec_name = section_map.get(s_id, {}).get("code") or section_map.get(s_id, {}).get("name") or s_id[:6]
            cell = ws_matrix.cell(row=3, column=c_col, value=sec_name)
            cell.font = font_header
            cell.fill = fill_header_master
            cell.alignment = align_center
            cell.border = thin_border

        slot_lookup = {(s["section_id"], s["day_of_week"], s["period_index"]): s for s in slots if s.get("section_id")}

        curr_r = 4
        for d in days:
            for p in range(periods_per_day):
                ws_matrix.row_dimensions[curr_r].height = 36
                ws_matrix.cell(row=curr_r, column=1, value=DAY_SHORT[d]).font = font_period
                ws_matrix.cell(row=curr_r, column=2, value=f"P{p+1}").font = font_period

                ws_matrix.cell(row=curr_r, column=1).alignment = align_center
                ws_matrix.cell(row=curr_r, column=2).alignment = align_center
                ws_matrix.cell(row=curr_r, column=1).border = thin_border
                ws_matrix.cell(row=curr_r, column=2).border = thin_border

                for s_idx, s_id in enumerate(sec_ids):
                    c_col = s_idx + 3
                    sl = slot_lookup.get((s_id, d, p))
                    cell = ws_matrix.cell(row=curr_r, column=c_col)
                    cell.border = thin_border
                    cell.alignment = align_center

                    if sl:
                        subj = subject_map.get(sl.get("subject_id"), {})
                        teach = teacher_map.get(sl.get("teacher_id"), {})
                        room = room_map.get(sl.get("room_id"), {})

                        subj_str = format_subject_label(subj)
                        teach_str = teach.get("name") or ""
                        room_str = room.get("code") or ""

                        cell.value = f"{subj_str}\n{teach_str}\n{room_str}"
                        cell.font = font_body
                    else:
                        cell.value = "—"
                        cell.font = font_empty

                curr_r += 1

        ws_matrix.column_dimensions["A"].width = 10
        ws_matrix.column_dimensions["B"].width = 10
        for s_idx in range(len(sec_ids)):
            col_letter = get_column_letter(s_idx + 3)
            ws_matrix.column_dimensions[col_letter].width = 20

        # Sheet 2: Flat Slot List
        ws_list = wb.create_sheet(title="Slot Data List")
        list_headers = ["Day", "Period", "Class Section", "Subject Name", "Subject Code", "Teacher", "Room Code", "Room Name", "Locked"]
        ws_list.append(list_headers)

        for col_idx in range(1, len(list_headers) + 1):
            cell = ws_list.cell(row=1, column=col_idx)
            cell.font = font_header
            cell.fill = fill_header_master
            cell.alignment = align_center

        for sl in slots:
            d_name = DAY_NAMES[sl["day_of_week"]] if 0 <= sl["day_of_week"] <= 6 else str(sl["day_of_week"])
            sec = section_map.get(sl.get("section_id"), {})
            subj = subject_map.get(sl.get("subject_id"), {})
            teach = teacher_map.get(sl.get("teacher_id"), {})
            room = room_map.get(sl.get("room_id"), {})

            ws_list.append([
                d_name,
                f"P{sl['period_index'] + 1}",
                sec.get("name") or sec.get("code") or "",
                subj.get("name") or "",
                subj.get("code") or "",
                teach.get("name") or "",
                room.get("code") or "",
                room.get("name") or "",
                "Yes" if sl.get("is_locked") else "No",
            ])

        for col in ws_list.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_list.column_dimensions[col_letter].width = max(max_len + 3, 12)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
