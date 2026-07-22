"""
Quotation PDF generator — professional A4 customer-facing document.
Uses ReportLab (already in requirements.txt).
Brand color: #1A5C28 (Kopernik Harvest green).
"""
from io import BytesIO
from datetime import datetime, timedelta
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
import os
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable, KeepTogether, Image as RLImage,
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT

_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'logo.png')

BRAND_GREEN = colors.HexColor("#1A5C28")
BRAND_LIGHT = colors.HexColor("#E8F5E9")
BRAND_MID = colors.HexColor("#A5D6A7")
PAGE_W, PAGE_H = A4


def _fmt(n: float, decimals: int = 2) -> str:
    return f"{n:,.{decimals}f}"


def generate_quotation_pdf(quotation_data: dict, settings_data: dict) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
    )

    styles = getSampleStyleSheet()
    normal = ParagraphStyle("N", parent=styles["Normal"], fontSize=9, leading=13)
    bold = ParagraphStyle("B", parent=styles["Normal"], fontSize=9, fontName="Helvetica-Bold", leading=13)
    small = ParagraphStyle("S", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#555555"), leading=11)
    heading = ParagraphStyle("H", parent=styles["Normal"], fontSize=11, fontName="Helvetica-Bold", textColor=BRAND_GREEN, leading=15)
    right = ParagraphStyle("R", parent=styles["Normal"], fontSize=9, alignment=TA_RIGHT, leading=13)
    center = ParagraphStyle("C", parent=styles["Normal"], fontSize=9, alignment=TA_CENTER, leading=13)

    company_name = settings_data.get("company_name", "Kopernik Harvest")
    company_address = settings_data.get("company_address", "")
    currency = quotation_data.get("currency_code", "IDR")
    exchange_rate = float(quotation_data.get("exchange_rate") or 1.0)
    tax_pct = float(quotation_data.get("tax_percentage") or 10.0)
    ex_ts = quotation_data.get("exchange_rate_timestamp", "")

    elems = []

    # ── HEADER ────────────────────────────────────────────────────────────────
    logo_style = ParagraphStyle(
        "Logo", parent=styles["Normal"],
        fontSize=20, fontName="Helvetica-Bold",
        textColor=BRAND_GREEN, leading=24,
    )
    try:
        _logo_cell = RLImage(_LOGO_PATH, height=24 * mm)
        _logo_cell.hAlign = 'LEFT'
    except Exception:
        _logo_cell = Paragraph(company_name, logo_style)
    header_data = [
        [
            _logo_cell,
            Paragraph("QUOTATION", ParagraphStyle(
                "QT", parent=styles["Normal"],
                fontSize=28, fontName="Helvetica-Bold",
                textColor=BRAND_GREEN, alignment=TA_RIGHT, leading=32,
            )),
        ]
    ]
    header_table = Table(header_data, colWidths=[95 * mm, 79 * mm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elems.append(header_table)

    if company_address:
        elems.append(Paragraph(company_address, small))
    elems.append(Spacer(1, 3 * mm))
    elems.append(HRFlowable(width="100%", thickness=2, color=BRAND_GREEN))
    elems.append(Spacer(1, 4 * mm))

    # ── QUOTATION META + CUSTOMER ─────────────────────────────────────────────
    qt_id = quotation_data.get("quotation_id", "")
    qt_date = quotation_data.get("created_at", "")
    if hasattr(qt_date, "strftime"):
        qt_date_str = qt_date.strftime("%d %b %Y")
        valid_until = (qt_date + timedelta(days=30)).strftime("%d %b %Y")
    else:
        qt_date_str = str(qt_date)[:10] if qt_date else ""
        valid_until = ""

    # Currency / exchange rate line
    if currency != "IDR":
        rate_line = f"1 {currency} = IDR {_fmt(exchange_rate, 0)}"
        if ex_ts:
            if hasattr(ex_ts, "strftime"):
                rate_line += f"  ·  Updated: {ex_ts.strftime('%d-%b-%Y %H:%M')} UTC"
            else:
                rate_line += f"  ·  Updated: {str(ex_ts)[:16]}"
    else:
        rate_line = "Base Currency"

    meta_left = [
        [Paragraph("Quotation No:", bold), Paragraph(qt_id, normal)],
        [Paragraph("Date:", bold), Paragraph(qt_date_str, normal)],
        [Paragraph("Valid Until:", bold), Paragraph(valid_until, normal)],
        [Paragraph("Currency:", bold), Paragraph(currency, normal)],
        [Paragraph("Exchange Rate:", bold), Paragraph(rate_line, small)],
    ]
    cust_left = [
        [Paragraph("<b>Bill To:</b>", heading)],
        [Paragraph(quotation_data.get("customer_name") or "—", normal)],
        [Paragraph(quotation_data.get("customer_email") or "", small)],
    ]

    meta_table = Table(meta_left, colWidths=[30 * mm, 64 * mm])
    meta_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    cust_table = Table(cust_left, colWidths=[94 * mm])
    cust_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))

    two_col = Table([[meta_table, cust_table]], colWidths=[98 * mm, 76 * mm])
    two_col.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elems.append(two_col)
    elems.append(Spacer(1, 5 * mm))

    # ── PRODUCT LINE ITEMS ────────────────────────────────────────────────────
    elems.append(Paragraph("Product Details", heading))
    elems.append(Spacer(1, 2 * mm))

    available_qty = float(quotation_data.get("available_qty") or 0)
    purchase_price = float(quotation_data.get("purchase_price") or 0)
    delivery_cost = float(quotation_data.get("delivery_cost") or 0)
    quote_price = float(quotation_data.get("quote_price") or 0)

    # Convert to display currency
    def to_display(idr_val: float) -> float:
        return idr_val / exchange_rate if currency != "IDR" and exchange_rate else idr_val

    subtotal_idr = quote_price * available_qty
    tax_amount = subtotal_idr * (tax_pct / 100.0)
    grand_total_idr = subtotal_idr + tax_amount

    col_hdr = ["#", "Commodity", "Batch ID", "Qty", f"Unit Price ({currency})", f"Amount ({currency})"]
    items_data = [col_hdr, [
        "1",
        quotation_data.get("product_name", ""),
        quotation_data.get("batch_id", ""),
        _fmt(available_qty, 0),
        _fmt(to_display(quote_price)),
        _fmt(to_display(subtotal_idr)),
    ]]

    col_w = [8 * mm, 52 * mm, 32 * mm, 18 * mm, 28 * mm, 28 * mm]
    items_tbl = Table(items_data, colWidths=col_w)
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(items_tbl)
    elems.append(Spacer(1, 4 * mm))

    # ── COST BREAKDOWN ────────────────────────────────────────────────────────
    elems.append(Paragraph("Calculation Breakdown", heading))
    elems.append(Spacer(1, 2 * mm))

    manpower_pct = float(quotation_data.get("manpower_percent") or 0)
    management_pct = float(quotation_data.get("management_percent") or 0)
    margin_pct = float(quotation_data.get("margin_percent") or 0)
    manpower_amt = purchase_price * (manpower_pct / 100)
    management_amt = purchase_price * (management_pct / 100)
    margin_amt = purchase_price * (margin_pct / 100)

    breakdown_rows = [
        ["Purchase Price", f"IDR {_fmt(purchase_price)}", f"{currency} {_fmt(to_display(purchase_price))}"],
        [f"Delivery Cost Per Unit", f"IDR {_fmt(delivery_cost)}", f"{currency} {_fmt(to_display(delivery_cost))}"],
        [f"Manpower ({_fmt(manpower_pct, 1)}%)", f"IDR {_fmt(manpower_amt)}", f"{currency} {_fmt(to_display(manpower_amt))}"],
        [f"Management Fee ({_fmt(management_pct, 1)}%)", f"IDR {_fmt(management_amt)}", f"{currency} {_fmt(to_display(management_amt))}"],
        [f"Margin ({_fmt(margin_pct, 1)}%)", f"IDR {_fmt(margin_amt)}", f"{currency} {_fmt(to_display(margin_amt))}"],
        ["Quote Price (per unit)", f"IDR {_fmt(quote_price)}", f"{currency} {_fmt(to_display(quote_price))}"],
    ]

    bd_hdr = [["Item", "Amount (IDR)", f"Amount ({currency})"]]
    bd_tbl = Table(bd_hdr + breakdown_rows, colWidths=[70 * mm, 38 * mm, 38 * mm], hAlign="LEFT")
    bd_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), BRAND_MID),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(bd_tbl)
    elems.append(Spacer(1, 4 * mm))

    # ── SUMMARY (Subtotal / Tax / Grand Total) ────────────────────────────────
    summary_data = [
        ["Subtotal", f"IDR {_fmt(subtotal_idr)}", f"{currency} {_fmt(to_display(subtotal_idr))}"],
        [f"Tax ({_fmt(tax_pct, 0)}%)", f"IDR {_fmt(tax_amount)}", f"{currency} {_fmt(to_display(tax_amount))}"],
        ["GRAND TOTAL", f"IDR {_fmt(grand_total_idr)}", f"{currency} {_fmt(to_display(grand_total_idr))}"],
    ]
    sum_hdr = [["", "IDR", currency]]
    sum_tbl = Table(sum_hdr + summary_data, colWidths=[70 * mm, 38 * mm, 38 * mm], hAlign="LEFT")
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        # Grand total row
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("BACKGROUND", (0, -1), (-1, -1), BRAND_GREEN),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ("FONTSIZE", (0, -1), (-1, -1), 10),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    elems.append(sum_tbl)
    elems.append(Spacer(1, 6 * mm))

    # ── NOTES ─────────────────────────────────────────────────────────────────
    if quotation_data.get("notes"):
        elems.append(Paragraph("Notes", heading))
        elems.append(Paragraph(quotation_data["notes"], normal))
        elems.append(Spacer(1, 4 * mm))

    # ── TERMS & SIGNATURE ─────────────────────────────────────────────────────
    terms = [
        "1. This quotation is valid for 30 days from the date of issue.",
        "2. Prices are in the stated currency and subject to change without notice.",
        "3. Payment terms: as per agreement.",
        "4. All prices are exclusive of applicable taxes unless stated.",
    ]
    elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#AAAAAA")))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph("Terms & Conditions", bold))
    for t in terms:
        elems.append(Paragraph(t, small))
    elems.append(Spacer(1, 8 * mm))

    sig_data = [
        ["", ""],
        [Paragraph(f"Authorized by: {company_name}", small), ""],
    ]
    sig_tbl = Table(sig_data, colWidths=[80 * mm, 94 * mm])
    sig_tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 1, colors.HexColor("#888888")),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elems.append(sig_tbl)

    # ── FOOTER (page number via onLaterPages) ─────────────────────────────────
    elems.append(Spacer(1, 5 * mm))
    elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CCCCCC")))
    footer_txt = (
        f"Generated by {company_name}  ·  {datetime.now().strftime('%d-%b-%Y %H:%M')}  ·  "
        f"This is a computer-generated document."
    )
    elems.append(Paragraph(footer_txt, ParagraphStyle(
        "Ft", parent=styles["Normal"], fontSize=7,
        textColor=colors.HexColor("#888888"), alignment=TA_CENTER, leading=10,
    )))

    doc.build(elems)
    return buffer.getvalue()
