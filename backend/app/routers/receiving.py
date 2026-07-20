from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.receiving import Receiving
from app.models.receiving_extra_cost import ReceivingExtraCost
from app.models.user import User
from app.schemas.receiving import ReceivingCreate, ReceivingUpdate, ReceivingResponse, ReceivingListResponse
from app.schemas.receiving_extra_cost import ExtraCostCreate, ExtraCostResponse
from app.services.inventory_service import add_stock
from app.services.workflow_service import trigger_workflow
from app.utils.id_generator import generate_id, generate_batch_id

router = APIRouter(prefix="/receiving", tags=["Receiving"])


def _build_response(r: Receiving, db: Session) -> ReceivingResponse:
    """Attach extra_costs and total_cost_basis to a receiving record."""
    extras = db.query(ReceivingExtraCost).filter(
        ReceivingExtraCost.receiving_id == r.receiving_id,
        ReceivingExtraCost.deleted_at.is_(None),
    ).all()
    extra_total = sum(e.amount for e in extras)
    resp = ReceivingResponse.model_validate(r)
    resp.extra_costs = [ExtraCostResponse.model_validate(e) for e in extras]
    resp.total_cost_basis = (r.purchase_price or 0.0) + (r.delivery_cost or 0.0) + extra_total
    return resp


@router.get("", response_model=ReceivingListResponse)
def list_receiving(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    commodity_id: Optional[str] = None,
    supplier_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Receiving).filter(Receiving.deleted_at.is_(None))
    if search:
        query = query.filter(
            Receiving.product_name.ilike(f"%{search}%") |
            Receiving.batch_id.ilike(f"%{search}%") |
            Receiving.supplier_name.ilike(f"%{search}%")
        )
    if commodity_id:
        query = query.filter(Receiving.commodity_id == commodity_id)
    if supplier_id:
        query = query.filter(Receiving.supplier_id == supplier_id)
    total = query.count()
    items = query.order_by(Receiving.id.desc()).offset((page - 1) * size).limit(size).all()
    return ReceivingListResponse(
        items=[_build_response(r, db) for r in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/batches", response_model=list[dict])
def get_available_batches(
    commodity_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return batches eligible for quotation: inventory rows with available_qty > 0.
    The inventory available_qty already reflects QC adjustments — when QC records a
    failed_qty, deduct_stock() reduces available_qty. So available_qty > 0 IS the
    net QC-passed quantity filter; no additional QC join is needed.
    """
    from app.models.inventory import Inventory

    query = db.query(Receiving, Inventory).join(
        Inventory, Receiving.batch_id == Inventory.batch_id
    ).filter(
        Receiving.deleted_at.is_(None),
        Inventory.deleted_at.is_(None),
        Inventory.available_qty > 0,
    )
    if commodity_id:
        query = query.filter(Receiving.commodity_id == commodity_id)
    results = query.all()
    batches = []
    for r, inv in results:
        extras = db.query(ReceivingExtraCost).filter(
            ReceivingExtraCost.receiving_id == r.receiving_id,
            ReceivingExtraCost.deleted_at.is_(None),
        ).all()
        extra_total = sum(e.amount for e in extras)
        batches.append({
            "batch_id": r.batch_id,
            "commodity_id": r.commodity_id,
            "product_name": r.product_name,
            "available_qty": inv.available_qty,
            "purchase_price": r.purchase_price,
            "delivery_cost": r.delivery_cost,
            "extra_costs_total": extra_total,
            "total_cost_basis": (r.purchase_price or 0) + (r.delivery_cost or 0) + extra_total,
            "expired_date": str(r.expired_date) if r.expired_date else None,
        })
    return batches


@router.post("", response_model=ReceivingResponse, status_code=status.HTTP_201_CREATED)
def create_receiving(
    payload: ReceivingCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    receiving_id = generate_id(db, Receiving, "receiving_id", "RC", 5)
    date_str = payload.date_received.strftime("%Y%m%d")
    existing_count = db.query(Receiving).filter(
        Receiving.commodity_id == payload.commodity_id,
        Receiving.deleted_at.is_(None),
    ).count()
    batch_id = generate_batch_id(payload.commodity_id, date_str, existing_count + 1)

    receiving = Receiving(receiving_id=receiving_id, batch_id=batch_id, **payload.model_dump())
    db.add(receiving)
    db.flush()

    add_stock(
        db,
        commodity_id=payload.commodity_id,
        product_name=payload.product_name,
        batch_id=batch_id,
        quantity=payload.quantity,
        movement_type="Receiving",
        reference_id=receiving_id,
        remarks=f"Received from {payload.supplier_name}",
    )

    db.commit()
    db.refresh(receiving)

    trigger_workflow(
        module_name="receiving", event_name="created",
        record_id=receiving_id, record_number=receiving_id,
        triggered_by=current_user, db=db, background_tasks=background_tasks,
    )

    return _build_response(receiving, db)


@router.get("/{receiving_id}", response_model=ReceivingResponse)
def get_receiving(
    receiving_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receiving record not found")
    return _build_response(r, db)


@router.put("/{receiving_id}", response_model=ReceivingResponse)
def update_receiving(
    receiving_id: str,
    payload: ReceivingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receiving record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(r, field, value)
    r.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(r)
    return _build_response(r, db)


@router.delete("/{receiving_id}", response_model=dict)
def delete_receiving(
    receiving_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receiving record not found")
    r.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Receiving record deleted"}


# ── Extra Costs ──────────────────────────────────────────────────────────────

@router.get("/{receiving_id}/extra-costs", response_model=list[ExtraCostResponse])
def list_extra_costs(
    receiving_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receiving record not found")
    costs = db.query(ReceivingExtraCost).filter(
        ReceivingExtraCost.receiving_id == receiving_id,
        ReceivingExtraCost.deleted_at.is_(None),
    ).all()
    return [ExtraCostResponse.model_validate(c) for c in costs]


@router.post("/{receiving_id}/extra-costs", response_model=ExtraCostResponse, status_code=status.HTTP_201_CREATED)
def add_extra_cost(
    receiving_id: str,
    payload: ExtraCostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    r = db.query(Receiving).filter(
        Receiving.receiving_id == receiving_id, Receiving.deleted_at.is_(None)
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Receiving record not found")
    cost = ReceivingExtraCost(receiving_id=receiving_id, **payload.model_dump())
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return ExtraCostResponse.model_validate(cost)


@router.delete("/{receiving_id}/extra-costs/{cost_id}", response_model=dict)
def delete_extra_cost(
    receiving_id: str,
    cost_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cost = db.query(ReceivingExtraCost).filter(
        ReceivingExtraCost.id == cost_id,
        ReceivingExtraCost.receiving_id == receiving_id,
        ReceivingExtraCost.deleted_at.is_(None),
    ).first()
    if not cost:
        raise HTTPException(status_code=404, detail="Extra cost not found")
    cost.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Extra cost deleted"}
