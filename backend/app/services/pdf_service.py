"""
Invoice PDF generator — updated with Kopernik Harvest green branding,
tax support, and currency display. Backward-compatible with existing invoices.
"""
import os
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable, Image as RLImage
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from datetime import datetime

_LOGO_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'static', 'logo.png')

BRAND_GREEN = colors.HexColor("#1A5C28")
BRAND_LIGHT = colors.HexColor("#E8F5E9")


def _fmt(n: float, decimals: int = 2) -> str:
    return f"{n:,.{decimals}f}"


def generate_invoice_pdf(invoice_data: dict, settings_data: dict) -> bytes:
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

    company_name = settings_data.get("company_name", "Kopernik Harvest")
    company_address = settings_data.get("company_address", "")
    currency = invoice_data.get("currency_code") or settings_data.get("currency", "IDR")
    exchange_rate = float(invoice_data.get("exchange_rate") or 1.0)
    tax_pct = float(invoice_data.get("tax_percentage") or 0.0)

    def to_display(idr_val: float) -> float:
        return idr_val / exchange_rate if currency != "IDR" and exchange_rate else idr_val

    elems = []

    # ── HEADER ────────────────────────────────────────────────────────────────
    logo_style = ParagraphStyle(
        "Logo", parent=styles["Normal"],
        fontSize=20, fontName="Helvetica-Bold", textColor=BRAND_GREEN, leading=24,
    )
    inv_label_style = ParagraphStyle(
        "IL", parent=styles["Normal"],
        fontSize=28, fontName="Helvetica-Bold",
        textColor=BRAND_GREEN, alignment=TA_RIGHT, leading=32,
    )
    try:
        _logo_cell = RLImage(_LOGO_PATH, height=24 * mm)
        _logo_cell.hAlign = 'LEFT'
    except Exception:
        _logo_cell = Paragraph(company_name, logo_style)
    header_tbl = Table(
        [[_logo_cell, Paragraph("INVOICE", inv_label_style)]],
        colWidths=[95 * mm, 79 * mm],
    )
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    elems.append(header_tbl)

    if company_address:
        elems.append(Paragraph(company_address, small))
    elems.append(Spacer(1, 3 * mm))
    elems.append(HRFlowable(width="100%", thickness=2, color=BRAND_GREEN))
    elems.append(Spacer(1, 4 * mm))

    # ── META + CUSTOMER ───────────────────────────────────────────────────────
    if currency != "IDR":
        rate_line = f"1 {currency} = IDR {_fmt(exchange_rate, 0)}"
    else:
        rate_line = "IDR (Base Currency)"

    meta_rows = [
        [Paragraph("Invoice No:", bold), Paragraph(invoice_data.get("invoice_id", ""), normal)],
        [Paragraph("Date:", bold), Paragraph(str(invoice_data.get("invoice_date", "")), normal)],
        [Paragraph("Status:", bold), Paragraph(invoice_data.get("invoice_status", ""), normal)],
        [Paragraph("Currency:", bold), Paragraph(currency, normal)],
        [Paragraph("Exchange Rate:", bold), Paragraph(rate_line, small)],
    ]
    if invoice_data.get("quotation_id"):
        meta_rows.insert(1, [Paragraph("Quotation Ref:", bold), Paragraph(invoice_data["quotation_id"], normal)])

    meta_tbl = Table(meta_rows, colWidths=[30 * mm, 64 * mm])
    meta_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    cust_lines = [
        [Paragraph("<b>Bill To:</b>", ParagraphStyle("H", parent=styles["Normal"], fontSize=11, fontName="Helvetica-Bold", textColor=BRAND_GREEN))],
        [Paragraph(invoice_data.get("customer_name", ""), normal)],
    ]
    if invoice_data.get("customer_email"):
        cust_lines.append([Paragraph(invoice_data["customer_email"], small)])
    if invoice_data.get("customer_address"):
        cust_lines.append([Paragraph(invoice_data["customer_address"], small)])

    cust_tbl = Table(cust_lines, colWidths=[94 * mm])
    cust_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))

    two_col = Table([[meta_tbl, cust_tbl]], colWidths=[98 * mm, 76 * mm])
    two_col.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP")]))
    elems.append(two_col)
    elems.append(Spacer(1, 5 * mm))

    # ── LINE ITEMS ────────────────────────────────────────────────────────────
    raw_items = invoice_data.get("items") or []
    if raw_items:
        # Multi-product invoice: render each detail row
        line_rows = []
        for i, it in enumerate(raw_items):
            q = float(it.get("quantity", 0))
            up = float(it.get("unit_price", 0))
            lt = float(it.get("line_total", q * up))
            line_rows.append([
                str(i + 1),
                it.get("product_name", ""),
                it.get("batch_id", ""),
                _fmt(q, 0),
                _fmt(to_display(up)),
                _fmt(to_display(lt)),
            ])
        total_amount = float(invoice_data.get("total_amount", sum(float(it.get("line_total", 0)) for it in raw_items)))
    else:
        # Legacy single-product invoice
        qty = float(invoice_data.get("quantity", 0))
        unit_price = float(invoice_data.get("unit_price", 0))
        total_amount = float(invoice_data.get("total_amount", qty * unit_price))
        line_rows = [[
            "1",
            invoice_data.get("product_name", ""),
            invoice_data.get("batch_id", ""),
            _fmt(qty, 0),
            _fmt(to_display(unit_price)),
            _fmt(to_display(total_amount)),
        ]]

    hdr = ["#", "Product", "Batch ID", "Qty", f"Unit Price ({currency})", f"Amount ({currency})"]
    items_tbl = Table([hdr] + line_rows, colWidths=[8 * mm, 52 * mm, 32 * mm, 18 * mm, 30 * mm, 30 * mm])
    items_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    elems.append(items_tbl)
    elems.append(Spacer(1, 4 * mm))

    # ── SUMMARY ───────────────────────────────────────────────────────────────
    tax_amount = float(invoice_data.get("tax_amount") or (total_amount * tax_pct / 100 if tax_pct else 0))
    grand_total = float(invoice_data.get("grand_total") or (total_amount + tax_amount))

    if tax_pct and tax_pct > 0:
        summary_rows = [
            ["Subtotal", f"{currency} {_fmt(to_display(total_amount))}"],
            [f"Tax ({_fmt(tax_pct, 0)}%)", f"{currency} {_fmt(to_display(tax_amount))}"],
            ["GRAND TOTAL", f"{currency} {_fmt(to_display(grand_total))}"],
        ]
        sum_styles = [
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, -1), (-1, -1), 10),
            ("BACKGROUND", (0, -1), (-1, -1), BRAND_GREEN),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
        ]
    else:
        summary_rows = [["TOTAL", f"{currency} {_fmt(to_display(total_amount))}"]]
        sum_styles = [
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_GREEN),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ]

    sum_tbl = Table(summary_rows, colWidths=[120 * mm, 50 * mm], hAlign="RIGHT")
    sum_tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("PADDING", (0, 0), (-1, -1), 5),
        *sum_styles,
    ]))
    elems.append(sum_tbl)

    if invoice_data.get("notes"):
        elems.append(Spacer(1, 5 * mm))
        elems.append(Paragraph("Notes:", bold))
        elems.append(Paragraph(invoice_data["notes"], normal))

    # ── PAYMENT + SIGNATURE ───────────────────────────────────────────────────
    elems.append(Spacer(1, 8 * mm))
    elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#AAAAAA")))
    elems.append(Spacer(1, 3 * mm))
    elems.append(Paragraph("Payment Information", bold))
    elems.append(Paragraph("Please remit payment within 30 days of invoice date.", small))
    elems.append(Spacer(1, 8 * mm))

    sig_tbl = Table([
        ["", ""],
        [Paragraph(f"Authorized by: {company_name}", small), ""],
    ], colWidths=[80 * mm, 94 * mm])
    sig_tbl.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (0, 0), 1, colors.HexColor("#888888")),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
    ]))
    elems.append(sig_tbl)

    # ── FOOTER ────────────────────────────────────────────────────────────────
    elems.append(Spacer(1, 5 * mm))
    elems.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CCCCCC")))
    footer = f"Generated by {company_name}  ·  {datetime.now().strftime('%d-%b-%Y %H:%M')}  ·  Computer-generated document"
    elems.append(Paragraph(footer, ParagraphStyle(
        "Ft", parent=styles["Normal"], fontSize=7,
        textColor=colors.HexColor("#888888"), alignment=TA_CENTER, leading=10,
    )))

    doc.build(elems)
    return buffer.getvalue()
