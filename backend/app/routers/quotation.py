from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.quotation import Quotation
from app.models.user import User
from app.schemas.quotation import (
    QuotationCreate, QuotationUpdate, QuotationResponse, QuotationListResponse,
    QuotationCalculateRequest, QuotationCalculateResponse,
)
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/quotations", tags=["Quotations"])


def calculate_quote_price(
    purchase_price: float, delivery_cost: float,
    manpower_pct: float, management_pct: float, margin_pct: float,
    available_qty: float = 0.0, tax_pct: float = 10.0,
) -> dict:
    manpower_amt = purchase_price * (manpower_pct / 100)
    management_amt = purchase_price * (management_pct / 100)
    margin_amt = purchase_price * (margin_pct / 100)
    quote_price = purchase_price + delivery_cost + manpower_amt + management_amt + margin_amt
    # Tax calculated on total value (quote_price × qty)
    total_value = quote_price * available_qty
    tax_amount = total_value * (tax_pct / 100)
    grand_total = total_value + tax_amount
    return {
        "purchase_price": purchase_price,
        "delivery_cost": delivery_cost,
        "manpower_amount": manpower_amt,
        "management_amount": management_amt,
        "margin_amount": margin_amt,
        "quote_price": quote_price,
        "available_qty": available_qty,
        "tax_percentage": tax_pct,
        "tax_amount": tax_amount,
        "grand_total": grand_total,
    }


@router.get("/all", response_model=list[QuotationResponse])
def get_all_quotations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Quotation).filter(Quotation.deleted_at.is_(None), Quotation.status == "Pending").all()


@router.post("/calculate", response_model=QuotationCalculateResponse)
def calculate(payload: QuotationCalculateRequest, current_user: User = Depends(get_current_user)):
    return QuotationCalculateResponse(**calculate_quote_price(
        payload.purchase_price, payload.delivery_cost,
        payload.manpower_percent, payload.management_percent, payload.margin_percent,
        payload.available_qty, payload.tax_percentage,
    ))


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
            Quotation.product_name.ilike(f"%{search}%") |
            Quotation.quotation_id.ilike(f"%{search}%") |
            Quotation.customer_name.ilike(f"%{search}%")
        )
    if status_filter:
        query = query.filter(Quotation.status == status_filter)
    total = query.count()
    items = query.order_by(Quotation.id.desc()).offset((page - 1) * size).limit(size).all()
    return QuotationListResponse(
        items=[QuotationResponse.model_validate(q) for q in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tax_pct = payload.tax_percentage if payload.tax_percentage is not None else 10.0
    calc = calculate_quote_price(
        payload.purchase_price, payload.delivery_cost,
        payload.manpower_percent, payload.management_percent, payload.margin_percent,
        payload.available_qty, tax_pct,
    )
    quotation_id = generate_id(db, Quotation, "quotation_id", "QT", 5)
    data = payload.model_dump()
    # Remove fields we set explicitly to avoid duplicate kwarg
    for key in ("tax_percentage",):
        data.pop(key, None)
    quotation = Quotation(
        quotation_id=quotation_id,
        quote_price=calc["quote_price"],
        tax_percentage=tax_pct,
        tax_amount=calc["tax_amount"],
        grand_total=calc["grand_total"],
        status="Pending",
        **data,
    )
    db.add(quotation)
    db.commit()
    db.refresh(quotation)
    return quotation


@router.get("/{quotation_id}/pdf")
def download_quotation_pdf(
    quotation_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and download a professional PDF for the given quotation."""
    q = db.query(Quotation).filter(
        Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)
    ).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")

    from app.models.settings import SystemSettings
    from app.services.quotation_pdf_service import generate_quotation_pdf

    settings_rows = db.query(SystemSettings).filter(SystemSettings.deleted_at.is_(None)).all()
    settings_data = {s.key: s.value for s in settings_rows}

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
    }
    pdf_bytes = generate_quotation_pdf(qt_dict, settings_data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={quotation_id}.pdf"},
    )


@router.get("/{quotation_id}", response_model=QuotationResponse)
def get_quotation(quotation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Quotation).filter(Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return q


@router.put("/{quotation_id}", response_model=QuotationResponse)
def update_quotation(
    quotation_id: str,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Quotation).filter(Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status == "Converted to Invoice":
        raise HTTPException(status_code=400, detail="Cannot edit a converted quotation")
    data = payload.model_dump(exclude_none=True)
    for field, value in data.items():
        setattr(q, field, value)
    # Recalculate if percentages changed
    if any(k in data for k in ["manpower_percent", "management_percent", "margin_percent", "tax_percentage"]):
        tax_pct = q.tax_percentage or 10.0
        calc = calculate_quote_price(
            q.purchase_price, q.delivery_cost,
            q.manpower_percent, q.management_percent, q.margin_percent,
            q.available_qty, tax_pct,
        )
        q.quote_price = calc["quote_price"]
        q.tax_amount = calc["tax_amount"]
        q.grand_total = calc["grand_total"]
    q.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(q)
    return q


@router.delete("/{quotation_id}", response_model=dict)
def delete_quotation(quotation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(Quotation).filter(Quotation.quotation_id == quotation_id, Quotation.deleted_at.is_(None)).first()
    if not q:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if q.status == "Converted to Invoice":
        raise HTTPException(status_code=400, detail="Cannot delete a converted quotation")
    q.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Quotation deleted"}
