from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.invoice import Invoice
from app.models.invoice_detail import InvoiceDetail
from app.models.quotation import Quotation
from app.models.quotation_detail import QuotationDetail
from app.models.user import User
from app.schemas.invoice import (
    InvoiceCreate, InvoiceFromQuotation, InvoiceUpdate,
    InvoiceResponse, InvoiceDetailResponse, InvoiceListResponse,
)
from app.services.inventory_service import deduct_stock
from app.services.pdf_service import generate_invoice_pdf

router = APIRouter(prefix="/invoices", tags=["Invoices"])

# Statuses that lock a quotation (cannot re-invoice)
LOCKING_STATUSES = {"Approved", "Paid", "Completed", "Issued"}
# Statuses that release the quotation back to Pending
# NOTE: "Draft" is intentionally NOT here — a Draft invoice IS an active invoice
# that holds the quotation. Only explicit cancellation/void releases it.
RELEASING_STATUSES = {"Cancelled", "Void"}


def get_invoice_prefix(db: Session) -> str:
    from app.models.settings import SystemSettings
    s = db.query(SystemSettings).filter(SystemSettings.key == "invoice_prefix").first()
    return s.value if s and s.value else "INV"


def _build_response(inv: Invoice, db: Session) -> InvoiceResponse:
    """Attach invoice_detail rows to the response."""
    details = db.query(InvoiceDetail).filter(
        InvoiceDetail.invoice_id == inv.invoice_id,
        InvoiceDetail.deleted_at.is_(None),
    ).all()
    resp = InvoiceResponse.model_validate(inv)
    resp.items = [InvoiceDetailResponse.model_validate(d) for d in details]
    return resp


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
        items=[_build_response(i, db) for i in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
    return _build_response(invoice, db)


@router.post("/from-quotation", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_from_quotation(
    payload: InvoiceFromQuotation,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(
        Quotation.quotation_id == payload.quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    # Block re-invoicing if there is already an active (non-released) invoice
    if q.status in LOCKING_STATUSES or q.status == "Converted to Invoice":
        active_invoice = db.query(Invoice).filter(
            Invoice.quotation_id == payload.quotation_id,
            Invoice.deleted_at.is_(None),
            Invoice.invoice_status.notin_(list(RELEASING_STATUSES)),
        ).first()
        if active_invoice:
            raise HTTPException(
                status_code=400,
                detail=f"An active invoice ({active_invoice.invoice_id}) already exists for this quotation",
            )

    # Load all quotation detail rows
    qt_details = db.query(QuotationDetail).filter(
        QuotationDetail.quotation_id == q.quotation_id,
        QuotationDetail.deleted_at.is_(None),
    ).all()

    prefix = get_invoice_prefix(db)
    count = db.query(Invoice).count()
    invoice_id = f"{prefix}-{str(count + 1).zfill(5)}"
    tax_pct = q.tax_percentage or 0.0

    if qt_details:
        # Multi-product: inherit all line items from quotation_detail
        subtotal = sum(d.line_subtotal for d in qt_details)
        tax_amount = subtotal * (tax_pct / 100)
        grand_total = subtotal + tax_amount
        # Legacy header fields populated from first detail (satisfies NOT NULL constraints)
        first = qt_details[0]
        inv_qty = first.quoted_qty
        inv_unit_price = first.unit_price
        inv_commodity_id = first.commodity_id
        inv_product_name = first.product_name
        inv_batch_id = first.batch_id
    else:
        # Fallback: single-product quotation with no detail rows
        available = q.available_qty or 0.0
        if payload.quantity and payload.quantity > available:
            raise HTTPException(
                status_code=400,
                detail=f"Requested qty {payload.quantity} exceeds available {available}",
            )
        inv_qty = payload.quantity or available
        inv_unit_price = q.quote_price or 0.0
        subtotal = inv_qty * inv_unit_price
        tax_amount = subtotal * (tax_pct / 100)
        grand_total = subtotal + tax_amount
        inv_commodity_id = q.commodity_id
        inv_product_name = q.product_name
        inv_batch_id = q.batch_id

    invoice = Invoice(
        invoice_id=invoice_id,
        invoice_date=payload.invoice_date,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_address=payload.customer_address,
        quotation_id=q.quotation_id,
        commodity_id=inv_commodity_id,
        product_name=inv_product_name,
        batch_id=inv_batch_id,
        quantity=inv_qty,
        unit_price=inv_unit_price,
        total_amount=subtotal,
        invoice_status="Draft",
        notes=payload.notes,
        currency_code=q.currency_code or "IDR",
        exchange_rate=q.exchange_rate or 1.0,
        tax_percentage=tax_pct,
        tax_amount=tax_amount,
        grand_total=grand_total,
    )
    db.add(invoice)
    db.flush()

    # Create invoice_detail rows from quotation_detail rows
    for d in qt_details:
        inv_detail = InvoiceDetail(
            invoice_id=invoice_id,
            batch_id=d.batch_id,
            commodity_id=d.commodity_id,
            product_name=d.product_name,
            quantity=d.quoted_qty,
            unit_price=d.unit_price,
            line_total=d.line_subtotal,
        )
        db.add(inv_detail)

    q.status = "Converted to Invoice"
    db.commit()
    db.refresh(invoice)
    return _build_response(invoice, db)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _build_response(inv, db)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: str,
    payload: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    old_status = inv.invoice_status
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(inv, field, value)
    new_status = inv.invoice_status

    # Release quotation when invoice moves to a releasing status (Cancelled or Void)
    if new_status in RELEASING_STATUSES and old_status not in RELEASING_STATUSES:
        if inv.quotation_id:
            q = db.query(Quotation).filter(
                Quotation.quotation_id == inv.quotation_id,
                Quotation.deleted_at.is_(None),
            ).first()
            if q:
                q.status = "Pending"

    # Deduct stock when invoice is issued
    if new_status == "Issued" and old_status == "Draft":
        details = db.query(InvoiceDetail).filter(
            InvoiceDetail.invoice_id == invoice_id,
            InvoiceDetail.deleted_at.is_(None),
        ).all()
        if details:
            # Multi-product: deduct each line separately
            for d in details:
                try:
                    deduct_stock(
                        db, commodity_id=d.commodity_id, batch_id=d.batch_id,
                        quantity=d.quantity, movement_type="Invoice",
                        reference_id=inv.invoice_id,
                        remarks=f"Invoice issued to {inv.customer_name}",
                    )
                except ValueError as e:
                    raise HTTPException(status_code=400, detail=str(e))
        else:
            # Legacy single-product
            try:
                deduct_stock(
                    db, commodity_id=inv.commodity_id, batch_id=inv.batch_id,
                    quantity=inv.quantity, movement_type="Invoice",
                    reference_id=inv.invoice_id,
                    remarks=f"Invoice issued to {inv.customer_name}",
                )
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))

    # Recalculate totals
    details = db.query(InvoiceDetail).filter(
        InvoiceDetail.invoice_id == invoice_id,
        InvoiceDetail.deleted_at.is_(None),
    ).all()
    if details:
        # Multi-product: totals from detail rows, do not overwrite with header qty * unit_price
        subtotal = sum(d.line_total for d in details)
        tax_pct = inv.tax_percentage or 0.0
        inv.total_amount = subtotal
        inv.tax_amount = subtotal * (tax_pct / 100)
        inv.grand_total = subtotal + inv.tax_amount
    else:
        # Single-product legacy recalculation
        inv.total_amount = inv.quantity * inv.unit_price
        tax_pct = inv.tax_percentage or 0.0
        inv.tax_amount = inv.total_amount * (tax_pct / 100)
        inv.grand_total = inv.total_amount + inv.tax_amount

    inv.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(inv)
    return _build_response(inv, db)


@router.get("/{invoice_id}/pdf")
def download_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")

    from app.models.settings import SystemSettings
    settings_rows = db.query(SystemSettings).filter(SystemSettings.deleted_at.is_(None)).all()
    settings_data = {s.key: s.value for s in settings_rows}

    details = db.query(InvoiceDetail).filter(
        InvoiceDetail.invoice_id == invoice_id,
        InvoiceDetail.deleted_at.is_(None),
    ).all()

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
        "items": [
            {
                "product_name": d.product_name,
                "batch_id": d.batch_id,
                "quantity": d.quantity,
                "unit_price": d.unit_price,
                "line_total": d.line_total,
            }
            for d in details
        ],
    }
    pdf_bytes = generate_invoice_pdf(invoice_dict, settings_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={invoice_id}.pdf"},
    )


@router.delete("/{invoice_id}", response_model=dict)
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    inv = db.query(Invoice).filter(
        Invoice.invoice_id == invoice_id, Invoice.deleted_at.is_(None)
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.invoice_status in ["Issued", "Paid"]:
        raise HTTPException(status_code=400, detail="Cannot delete an issued or paid invoice")
    inv.deleted_at = datetime.utcnow()
    # Release quotation on delete
    if inv.quotation_id:
        q = db.query(Quotation).filter(
            Quotation.quotation_id == inv.quotation_id,
            Quotation.deleted_at.is_(None),
        ).first()
        if q and q.status == "Converted to Invoice":
            q.status = "Pending"
    db.commit()
    return {"message": "Invoice deleted"}
