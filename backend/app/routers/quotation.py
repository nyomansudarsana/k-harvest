from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.quotation import Quotation
from app.models.quotation_detail import QuotationDetail
from app.models.user import User
from app.schemas.quotation import (
    QuotationCreate, QuotationUpdate, QuotationResponse, QuotationListResponse,
    QuotationCalculateRequest, QuotationCalculateResponse,
    QuotationDetailResponse, QuotationStatusUpdate,
)
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/quotations", tags=["Quotations"])

QUOTATION_STATUSES = ["Draft", "Pending", "Sent", "Approved", "Rejected", "Cancelled", "Expired"]
LOCKED_STATUSES = {"Approved", "Paid", "Completed"}


# ── Calculation ───────────────────────────────────────────────────────────────

def calc_line(
    purchase_price: float, delivery_cost: float, extra_costs_total: float,
    manpower_pct: float, management_pct: float, margin_pct: float,
    quoted_qty: float,
) -> dict:
    cost_basis = purchase_price + delivery_cost + extra_costs_total
    manpower_amt = cost_basis * (manpower_pct / 100)
    management_amt = cost_basis * (management_pct / 100)
    margin_amt = cost_basis * (margin_pct / 100)
    unit_price = cost_basis + manpower_amt + management_amt + margin_amt
    line_subtotal = unit_price * quoted_qty
    return {
        "total_cost_basis": cost_basis,
        "manpower_amount": manpower_amt,
        "management_amount": management_amt,
        "margin_amount": margin_amt,
        "unit_price": unit_price,
        "line_subtotal": line_subtotal,
    }


def _build_response(q: Quotation, db: Session) -> QuotationResponse:
    details = db.query(QuotationDetail).filter(
        QuotationDetail.quotation_id == q.quotation_id,
        QuotationDetail.deleted_at.is_(None),
    ).all()
    resp = QuotationResponse.model_validate(q)
    resp.items = [QuotationDetailResponse.model_validate(d) for d in details]
    return resp


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/calculate", response_model=QuotationCalculateResponse)
def calculate(payload: QuotationCalculateRequest, current_user: User = Depends(get_current_user)):
    line = calc_line(
        payload.purchase_price, payload.delivery_cost, payload.extra_costs_total,
        payload.manpower_percent, payload.management_percent, payload.margin_percent,
        payload.quoted_qty,
    )
    tax_amount = line["line_subtotal"] * (payload.tax_percentage / 100)
    return QuotationCalculateResponse(
        total_cost_basis=line["total_cost_basis"],
        manpower_amount=line["manpower_amount"],
        management_amount=line["management_amount"],
        margin_amount=line["margin_amount"],
        unit_price=line["unit_price"],
        quoted_qty=payload.quoted_qty,
        line_subtotal=line["line_subtotal"],
        tax_percentage=payload.tax_percentage,
        tax_amount=tax_amount,
        grand_total=line["line_subtotal"] + tax_amount,
    )


@router.get("/all", response_model=list[QuotationResponse])
def get_all_quotations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return quotations available for invoice creation (not locked)."""
    quotations = db.query(Quotation).filter(
        Quotation.deleted_at.is_(None),
        Quotation.status.notin_(list(LOCKED_STATUSES) + ["Converted to Invoice"]),
    ).all()
    return [_build_response(q, db) for q in quotations]


@router.get("", response_model=QuotationListResponse)
def list_quotations(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Quotation).filter(Quotation.deleted_at.is_(None))
    if search:
        query = query.filter(
            Quotation.quotation_id.ilike(f"%{search}%") |
            Quotation.customer_name.ilike(f"%{search}%")
        )
    if status_filter:
        query = query.filter(Quotation.status == status_filter)
    total = query.count()
    items = query.order_by(Quotation.id.desc()).offset((page - 1) * size).limit(size).all()
    return QuotationListResponse(
        items=[_build_response(q, db) for q in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one line item is required")

    quotation_id = generate_id(db, Quotation, "quotation_id", "QT", 5)
    tax_pct = payload.tax_percentage or 10.0

    # Validate stock availability
    from app.models.inventory import Inventory
    for item in payload.items:
        inv = db.query(Inventory).filter(
            Inventory.batch_id == item.batch_id,
            Inventory.deleted_at.is_(None),
        ).first()
        if inv and item.quoted_qty > inv.available_qty:
            raise HTTPException(
                status_code=400,
                detail=f"Batch {item.batch_id}: requested {item.quoted_qty} exceeds available {inv.available_qty}"
            )

    # Pre-compute first item for legacy header fields (satisfies NOT NULL constraints)
    first = payload.items[0]
    first_line = calc_line(
        first.purchase_price, first.delivery_cost, first.extra_costs_total,
        first.manpower_percent, first.management_percent, first.margin_percent,
        first.quoted_qty,
    )

    # Create header — legacy fields populated now so flush does not hit NOT NULL
    q = Quotation(
        quotation_id=quotation_id,
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        notes=payload.notes,
        status="Pending",
        currency_code=payload.currency_code,
        exchange_rate=payload.exchange_rate,
        exchange_rate_timestamp=payload.exchange_rate_timestamp,
        tax_percentage=tax_pct,
        # Legacy single-product fields — always populated from first item
        commodity_id=first.commodity_id,
        product_name=first.product_name,
        batch_id=first.batch_id,
        available_qty=first.available_qty,
        purchase_price=first.purchase_price,
        delivery_cost=first.delivery_cost,
        manpower_percent=first.manpower_percent,
        management_percent=first.management_percent,
        margin_percent=first.margin_percent,
        quote_price=first_line["unit_price"],
    )
    db.add(q)
    db.flush()  # Safe: commodity_id/product_name/batch_id are set above

    # Create detail rows and accumulate totals
    subtotal = 0.0
    for item in payload.items:
        line = calc_line(
            item.purchase_price, item.delivery_cost, item.extra_costs_total,
            item.manpower_percent, item.management_percent, item.margin_percent,
            item.quoted_qty,
        )
        detail = QuotationDetail(
            quotation_id=quotation_id,
            batch_id=item.batch_id,
            commodity_id=item.commodity_id,
            product_name=item.product_name,
            available_qty=item.available_qty,
            quoted_qty=item.quoted_qty,
            purchase_price=item.purchase_price,
            delivery_cost=item.delivery_cost,
            extra_costs_total=item.extra_costs_total,
            total_cost_basis=line["total_cost_basis"],
            manpower_percent=item.manpower_percent,
            management_percent=item.management_percent,
            margin_percent=item.margin_percent,
            unit_price=line["unit_price"],
            line_subtotal=line["line_subtotal"],
        )
        db.add(detail)
        subtotal += line["line_subtotal"]

    # Update header totals
    tax_amount = subtotal * (tax_pct / 100)
    q.subtotal = subtotal
    q.tax_amount = tax_amount
    q.grand_total = subtotal + tax_amount

    db.commit()
    db.refresh(q)
    return _build_response(q, db)


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    from app.models.settings import SystemSettings
    from app.services.quotation_pdf_service import generate_quotation_pdf

    settings_rows = db.query(SystemSettings).filter(SystemSettings.deleted_at.is_(None)).all()
    settings_data = {s.key: s.value for s in settings_rows}

    details = db.query(QuotationDetail).filter(
        QuotationDetail.quotation_id == quotation_id,
        QuotationDetail.deleted_at.is_(None),
    ).all()

    qt_dict = {
        "quotation_id": q.quotation_id,
        "commodity_id": q.commodity_id,
        "product_name": q.product_name,
        "batch_id": q.batch_id,
        "available_qty": q.available_qty,
        "purchase_price": q.purchase_price,
        "delivery_cost": q.delivery_cost,
        "manpower_percent": q.manpower_percent,
        "management_percent": q.management_percent,
        "margin_percent": q.margin_percent,
        "quote_price": q.quote_price,
        "status": q.status,
        "customer_name": q.customer_name,
        "customer_email": q.customer_email,
        "notes": q.notes,
        "currency_code": q.currency_code or "IDR",
        "exchange_rate": q.exchange_rate or 1.0,
        "exchange_rate_timestamp": q.exchange_rate_timestamp,
        "tax_percentage": q.tax_percentage or 10.0,
        "tax_amount": q.tax_amount or 0.0,
        "grand_total": q.grand_total or 0.0,
        "created_at": q.created_at,
        "items": [
            {
                "batch_id": d.batch_id, "product_name": d.product_name,
                "commodity_id": d.commodity_id, "quoted_qty": d.quoted_qty,
                "unit_price": d.unit_price, "line_subtotal": d.line_subtotal,
            }
            for d in details
        ],
    }
    pdf_bytes = generate_quotation_pdf(qt_dict, settings_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={quotation_id}.pdf"},
    )


@router.get("/{quotation_id}", response_model=QuotationResponse)
def get_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _build_response(q, db)


@router.patch("/{quotation_id}/status", response_model=QuotationResponse)
def update_quotation_status(
    quotation_id: str,
    payload: QuotationStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enh 11 — manually set quotation status."""
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if payload.status not in QUOTATION_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {QUOTATION_STATUSES}")
    q.status = payload.status
    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return _build_response(q, db)


@router.put("/{quotation_id}", response_model=QuotationResponse)
def update_quotation(
    quotation_id: str,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status in LOCKED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot edit a {q.status} quotation")

    # Update header fields
    for field in ("customer_name", "customer_email", "notes", "status",
                  "currency_code", "exchange_rate", "exchange_rate_timestamp", "tax_percentage"):
        val = getattr(payload, field, None)
        if val is not None:
            setattr(q, field, val)

    # Replace detail rows if provided
    if payload.items is not None:
        db.query(QuotationDetail).filter(
            QuotationDetail.quotation_id == quotation_id
        ).delete()
        subtotal = 0.0
        tax_pct = q.tax_percentage or 10.0
        for item in payload.items:
            line = calc_line(
                item.purchase_price, item.delivery_cost, item.extra_costs_total,
                item.manpower_percent, item.management_percent, item.margin_percent,
                item.quoted_qty,
            )
            detail = QuotationDetail(
                quotation_id=quotation_id,
                batch_id=item.batch_id, commodity_id=item.commodity_id,
                product_name=item.product_name, available_qty=item.available_qty,
                quoted_qty=item.quoted_qty, purchase_price=item.purchase_price,
                delivery_cost=item.delivery_cost, extra_costs_total=item.extra_costs_total,
                total_cost_basis=line["total_cost_basis"],
                manpower_percent=item.manpower_percent, management_percent=item.management_percent,
                margin_percent=item.margin_percent, unit_price=line["unit_price"],
                line_subtotal=line["line_subtotal"],
            )
            db.add(detail)
            subtotal += line["line_subtotal"]
        tax_amount = subtotal * (tax_pct / 100)
        q.subtotal = subtotal
        q.tax_amount = tax_amount
        q.grand_total = subtotal + tax_amount
        # Keep legacy header fields in sync with first item
        first = payload.items[0]
        first_line = calc_line(
            first.purchase_price, first.delivery_cost, first.extra_costs_total,
            first.manpower_percent, first.management_percent, first.margin_percent,
            first.quoted_qty,
        )
        q.commodity_id = first.commodity_id
        q.product_name = first.product_name
        q.batch_id = first.batch_id
        q.available_qty = first.available_qty
        q.purchase_price = first.purchase_price
        q.delivery_cost = first.delivery_cost
        q.manpower_percent = first.manpower_percent
        q.management_percent = first.management_percent
        q.margin_percent = first.margin_percent
        q.quote_price = first_line["unit_price"]

    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return _build_response(q, db)


@router.delete("/{quotation_id}", response_model=dict)
def delete_quotation(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status in LOCKED_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot delete a {q.status} quotation")
    q.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Quotation deleted"}
