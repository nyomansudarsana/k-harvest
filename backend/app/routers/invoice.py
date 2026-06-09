from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.invoice import Invoice
from app.models.quotation import Quotation
from app.models.user import User
from app.schemas.invoice import InvoiceCreate, InvoiceFromQuotation, InvoiceUpdate, InvoiceResponse, InvoiceListResponse
from app.services.inventory_service import deduct_stock
from app.services.pdf_service import generate_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["Invoices"])


def get_invoice_prefix(db: Session) -> str:
    from app.models.settings import SystemSettings
    s = db.query(SystemSettings).filter(SystemSettings.key == "invoice_prefix").first()
    return s.value if s and s.value else "INV"


@router.get("", response_model=InvoiceListResponse)
def list_invoices(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    invoice_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Invoice).filter(Invoice.deleted_at.is_(None))
    if search:
        query = query.filter(
            Invoice.customer_name.ilike(f"%{search}%") |
            Invoice.invoice_id.ilike(f"%{search}%") |
            Invoice.product_name.ilike(f"%{search}%")
        )
    if invoice_status:
        query = query.filter(Invoice.invoice_status == invoice_status)
    total = query.count()
    items = query.order_by(Invoice.id.desc()).offset((page - 1) * size).limit(size).all()
    return InvoiceListResponse(
        items=[InvoiceResponse.model_validate(i) for i in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(payload: InvoiceCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    prefix = get_invoice_prefix(db)
    count = db.query(Invoice).count()
    invoice_id = f"{prefix}-{str(count + 1).zfill(5)}"
    total = payload.quantity * payload.unit_price
    invoice = Invoice(
        invoice_id=invoice_id,
        total_amount=total,
        grand_total=total,
        invoice_status="Draft",
        **payload.model_dump(),
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return invoice


@router.post("/from-quotation", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_from_quotation(
    payload: InvoiceFromQuotation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.quotation_id == payload.quotation_id, Quotation.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status == "Converted to Invoice":
        raise HTTPException(status_code=400, detail="Quotation already converted")
    if payload.quantity > q.available_qty:
        raise HTTPException(status_code=400, detail=f"Requested qty {payload.quantity} exceeds available {q.available_qty}")

    prefix = get_invoice_prefix(db)
    count = db.query(Invoice).count()
    invoice_id = f"{prefix}-{str(count + 1).zfill(5)}"
    total = payload.quantity * q.quote_price

    # Inherit currency and tax settings from the quotation
    tax_pct = q.tax_percentage or 0.0
    tax_amount = total * (tax_pct / 100)
    grand_total = total + tax_amount

    invoice = Invoice(
        invoice_id=invoice_id,
        invoice_date=payload.invoice_date,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_address=payload.customer_address,
        quotation_id=q.quotation_id,
        commodity_id=q.commodity_id,
        product_name=q.product_name,
        batch_id=q.batch_id,
        quantity=payload.quantity,
        unit_price=q.quote_price,
        total_amount=total,
        invoice_status="Draft",
        notes=payload.notes,
        # Currency inherited from quotation
        currency_code=q.currency_code or "IDR",
        exchange_rate=q.exchange_rate or 1.0,
        tax_percentage=tax_pct,
        tax_amount=tax_amount,
        grand_total=grand_total,
    )
    db.add(invoice)
    q.status = "Converted to Invoice"
    db.commit()
    db.refresh(invoice)
    return invoice


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(invoice_id: str, payload: InvoiceUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    old_status = inv.invoice_status
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(inv, field, value)
    if payload.invoice_status == "Issued" and old_status == "Draft":
        try:
            deduct_stock(
                db, commodity_id=inv.commodity_id, batch_id=inv.batch_id,
                quantity=inv.quantity, movement_type="Invoice",
                reference_id=inv.invoice_id, remarks=f"Invoice issued to {inv.customer_name}",
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    inv.total_amount = inv.quantity * inv.unit_price
    # Recalculate tax/grand_total on quantity or price change
    tax_pct = inv.tax_percentage or 0.0
    inv.tax_amount = inv.total_amount * (tax_pct / 100)
    inv.grand_total = inv.total_amount + inv.tax_amount
    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return inv


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(invoice_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    from app.models.settings import SystemSettings
    settings_rows = db.query(SystemSettings).filter(SystemSettings.deleted_at.is_(None)).all()
    settings_data = {s.key: s.value for s in settings_rows}

    invoice_dict = {
        "invoice_id": inv.invoice_id,
        "invoice_date": str(inv.invoice_date),
        "invoice_status": inv.invoice_status,
        "customer_name": inv.customer_name,
        "customer_email": inv.customer_email,
        "customer_address": inv.customer_address,
        "quotation_id": inv.quotation_id,
        "product_name": inv.product_name,
        "batch_id": inv.batch_id,
        "quantity": inv.quantity,
        "unit_price": inv.unit_price,
        "total_amount": inv.total_amount,
        "notes": inv.notes,
        "currency_code": inv.currency_code or "IDR",
        "exchange_rate": inv.exchange_rate or 1.0,
        "tax_percentage": inv.tax_percentage or 0.0,
        "tax_amount": inv.tax_amount or 0.0,
        "grand_total": inv.grand_total or inv.total_amount,
    }
    pdf_bytes = generate_invoice_pdf(invoice_dict, settings_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={invoice_id}.pdf"},
    )


@router.delete("/{invoice_id}", response_model=dict)
def delete_invoice(invoice_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Invoice).filter(Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.invoice_status in ["Issued", "Paid"]:
        raise HTTPException(status_code=400, detail="Cannot delete an issued or paid invoice")
    inv.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Invoice deleted"}
