from datetime import datetime
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

BANK_NAME = "VaultOS Banking"

_BASE = Path(__file__).resolve().parent.parent
_LOGO = _BASE / "react-app" / "brand_assets" / "ChatGPT Image 10_29_53 26 thg 4, 2026.png"

_DARK = colors.HexColor("#0f0f0f")
_GREEN = colors.HexColor("#7adf2e")
_GRAY = colors.HexColor("#737373")
_LIGHT = colors.HexColor("#f5f5f5")
_BORDER = colors.HexColor("#e5e5e5")
_POS = colors.HexColor("#16a34a")
_NEG = colors.HexColor("#dc2626")


def _money(val) -> str:
    try:
        return f"{float(val):,.0f} VND"
    except Exception:
        return str(val)


def _dt(val) -> str:
    if val is None:
        return "-"
    try:
        if hasattr(val, "strftime"):
            return val.strftime("%d %b %Y %H:%M")
        s = str(val)
        return s[:16].replace("T", " ")
    except Exception:
        return str(val)


def _logo_image(size_mm=10):
    if _LOGO.exists():
        try:
            return Image(str(_LOGO), width=size_mm * mm, height=size_mm * mm)
        except Exception:
            pass
    return None


def _page_header(story, styles):
    img = _logo_image(10)
    if img:
        hdr = Table([[img, Paragraph(BANK_NAME, styles["bank"])]], colWidths=[14 * mm, None])
        hdr.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
    else:
        hdr = Table([[Paragraph(BANK_NAME, styles["bank"])]], colWidths=[None])
    story.append(hdr)
    story.append(Spacer(1, 4 * mm))
    story.append(HRFlowable(width="100%", thickness=1.5, color=_GREEN))
    story.append(Spacer(1, 6 * mm))


def _page_footer(story, styles):
    story.append(Spacer(1, 8 * mm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=_BORDER))
    story.append(Spacer(1, 3 * mm))
    now = datetime.now().strftime("%d %b %Y %H:%M:%S")
    story.append(Paragraph(f"Generated: {now}  ·  {BANK_NAME}", styles["footer"]))
    story.append(Paragraph("This is a system-generated document. No signature required.", styles["footer"]))


def transaction_receipt_pdf(txn: dict, account: dict) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    styles = {
        "bank":    ParagraphStyle("bank",    fontSize=13, textColor=_DARK, fontName="Helvetica-Bold"),
        "title":   ParagraphStyle("title",   fontSize=20, textColor=_DARK, fontName="Helvetica-Bold", spaceAfter=2),
        "sub":     ParagraphStyle("sub",     fontSize=10, textColor=_GRAY),
        "lbl":     ParagraphStyle("lbl",     fontSize=9,  textColor=_GRAY),
        "val":     ParagraphStyle("val",     fontSize=10, textColor=_DARK, fontName="Helvetica-Bold"),
        "footer":  ParagraphStyle("footer",  fontSize=8,  textColor=_GRAY, alignment=TA_CENTER),
    }

    story = []
    _page_header(story, styles)

    tx_type = str(txn.get("transaction_type", "")).replace("_", " ").title()
    story.append(Paragraph("Transaction Receipt", styles["title"]))
    story.append(Paragraph(f"{tx_type}  ·  #{txn.get('transaction_id', '')}", styles["sub"]))
    story.append(Spacer(1, 8 * mm))

    rows = [
        ("Transaction ID",  f"#{txn.get('transaction_id', '')}"),
        ("Type",            tx_type),
        ("Amount",          _money(txn.get("amount", 0))),
        ("Date & Time",     _dt(txn.get("transaction_date"))),
        ("Reference",       str(txn.get("reference_id") or "-")),
        ("Description",     str(txn.get("description") or "-")),
        ("",                ""),
        ("Account Number",  account.get("account_number", "-")),
        ("Account Type",    account.get("account_type",   "-")),
        ("Customer",        account.get("customer_name",  "-")),
        ("Branch",          account.get("branch_name",    "-")),
    ]

    tbl_data = []
    separator_row = None
    for i, (k, v) in enumerate(rows):
        if not k:
            separator_row = i
            continue
        tbl_data.append([Paragraph(k, styles["lbl"]), Paragraph(v, styles["val"])])

    tbl = Table(tbl_data, colWidths=[55 * mm, None], rowHeights=8.5 * mm)
    sep_idx = separator_row - 1 if separator_row else None

    style_cmds = [
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, _LIGHT]),
        ("GRID",           (0, 0), (-1, -1), 0.5, _BORDER),
        ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",    (0, 0), (-1, -1), 4 * mm),
        ("RIGHTPADDING",   (0, 0), (-1, -1), 4 * mm),
        ("TOPPADDING",     (0, 0), (-1, -1), 1.5 * mm),
        ("BOTTOMPADDING",  (0, 0), (-1, -1), 1.5 * mm),
    ]
    if sep_idx is not None:
        style_cmds.append(("LINEBELOW", (0, sep_idx), (-1, sep_idx), 1.5, _GREEN))

    tbl.setStyle(TableStyle(style_cmds))
    story.append(tbl)

    _page_footer(story, styles)
    doc.build(story)
    return buf.getvalue()


def account_statement_pdf(account: dict, transactions: list, from_date: str, to_date: str) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    styles = {
        "bank":   ParagraphStyle("bank",   fontSize=13, textColor=_DARK, fontName="Helvetica-Bold"),
        "title":  ParagraphStyle("title",  fontSize=18, textColor=_DARK, fontName="Helvetica-Bold"),
        "sub":    ParagraphStyle("sub",    fontSize=10, textColor=_GRAY, spaceAfter=2),
        "lbl":    ParagraphStyle("lbl",    fontSize=9,  textColor=_GRAY),
        "val":    ParagraphStyle("val",    fontSize=9,  textColor=_DARK, fontName="Helvetica-Bold"),
        "th":     ParagraphStyle("th",     fontSize=8,  textColor=colors.white, fontName="Helvetica-Bold"),
        "td":     ParagraphStyle("td",     fontSize=8,  textColor=_DARK),
        "td_pos": ParagraphStyle("td_pos", fontSize=8,  textColor=_POS, fontName="Helvetica-Bold"),
        "td_neg": ParagraphStyle("td_neg", fontSize=8,  textColor=_NEG, fontName="Helvetica-Bold"),
        "sumval": ParagraphStyle("sumval", fontSize=9,  fontName="Helvetica-Bold"),
        "footer": ParagraphStyle("footer", fontSize=8,  textColor=_GRAY, alignment=TA_CENTER),
    }

    story = []
    _page_header(story, styles)

    story.append(Paragraph("Account Statement", styles["title"]))
    period = f"{from_date or 'All'} — {to_date or 'All'}"
    story.append(Paragraph(f"Period: {period}", styles["sub"]))
    story.append(Spacer(1, 5 * mm))

    summary_data = [
        [Paragraph("Account Number", styles["lbl"]), Paragraph(account.get("account_number", "-"), styles["val"]),
         Paragraph("Customer", styles["lbl"]),      Paragraph(account.get("customer_name", "-"), styles["val"])],
        [Paragraph("Account Type", styles["lbl"]),  Paragraph(account.get("account_type", "-"), styles["val"]),
         Paragraph("Branch", styles["lbl"]),         Paragraph(account.get("branch_name", "-"), styles["val"])],
        [Paragraph("Current Balance", styles["lbl"]), Paragraph(_money(account.get("balance", 0)), styles["val"]),
         Paragraph("Status", styles["lbl"]),          Paragraph(str(account.get("status", "-")), styles["val"])],
    ]
    sum_tbl = Table(summary_data, colWidths=[35 * mm, 62 * mm, 30 * mm, 53 * mm], rowHeights=7 * mm)
    sum_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), _LIGHT),
        ("GRID",          (0, 0), (-1, -1), 0.5, _BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3 * mm),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3 * mm),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 6 * mm))

    col_w = [36 * mm, 24 * mm, 33 * mm, 38 * mm, 22 * mm, 27 * mm]
    hdr_row = [
        Paragraph("Date", styles["th"]),
        Paragraph("Type", styles["th"]),
        Paragraph("Amount", styles["th"]),
        Paragraph("Description", styles["th"]),
        Paragraph("Ref", styles["th"]),
        Paragraph("Txn ID", styles["th"]),
    ]
    rows = [hdr_row]
    credits = debits = 0.0

    for t in transactions:
        is_credit = str(t.get("transaction_type", "")).lower() in (
            "deposit", "credit", "transfer_in", "interest_credit"
        )
        amt = float(t.get("amount", 0))
        if is_credit:
            credits += amt
        else:
            debits += amt
        amt_style = styles["td_pos"] if is_credit else styles["td_neg"]
        amt_str = f"+{_money(amt)}" if is_credit else f"-{_money(amt)}"
        desc = str(t.get("description") or "-")
        rows.append([
            Paragraph(_dt(t.get("transaction_date")), styles["td"]),
            Paragraph(str(t.get("transaction_type", "")).replace("_", " ").title(), styles["td"]),
            Paragraph(amt_str, amt_style),
            Paragraph(desc[:42], styles["td"]),
            Paragraph(str(t.get("reference_id") or "-"), styles["td"]),
            Paragraph(f"#{t.get('transaction_id', '')}", styles["td"]),
        ])

    if len(rows) == 1:
        rows.append([Paragraph("No transactions in this period.", styles["td"])] + [Paragraph("", styles["td"])] * 5)

    tx_tbl = Table(rows, colWidths=col_w, repeatRows=1)
    tx_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0, 0), (-1, 0), _DARK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, _LIGHT]),
        ("GRID",         (0, 0), (-1, -1), 0.4, _BORDER),
        ("VALIGN",       (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",  (0, 0), (-1, -1), 2.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 2.5 * mm),
        ("TOPPADDING",   (0, 0), (-1, -1), 1.5 * mm),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 1.5 * mm),
    ]))
    story.append(tx_tbl)
    story.append(Spacer(1, 5 * mm))

    totals_data = [[
        Paragraph(f"Transactions: {len(transactions)}", styles["td"]),
        Paragraph(f"Credits:  +{_money(credits)}", ParagraphStyle("cp", fontSize=9, textColor=_POS, fontName="Helvetica-Bold")),
        Paragraph(f"Debits:  -{_money(debits)}", ParagraphStyle("dp", fontSize=9, textColor=_NEG, fontName="Helvetica-Bold")),
    ]]
    tot_tbl = Table(totals_data, colWidths=[60 * mm, 65 * mm, 55 * mm])
    tot_tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), _LIGHT),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
        ("TOPPADDING",  (0, 0), (-1, -1), 2 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(tot_tbl)

    _page_footer(story, styles)
    doc.build(story)
    return buf.getvalue()
