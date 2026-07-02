from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.qc import QC
from app.models.qc_failed import QCFailedInventory
from app.models.user import User
from app.schemas.qc import QCCreate, QCUpdate, QCResponse, QCListResponse
from app.schemas.qc_failed import QCFailedResponse, QCFailedListResponse
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/qc", tags=["QC"])


@router.get("", response_model=QCListResponse)
def list_qc(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    qc_status: Optional[str] = None,
    draft_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(QC).filter(QC.deleted_at.is_(None))
    if search:
        query = query.filter(
            QC.batch_id.ilike(f"%{search}%") |
            QC.qc_id.ilike(f"%{search}%") |
            QC.commodity_id.ilike(f"%{search}%")
        )
    if qc_status:
        query = query.filter(QC.qc_status == qc_status)
    if draft_status:
        query = query.filter(QC.draft_status == draft_status)
    total = query.count()
    items = query.order_by(QC.id.desc()).offset((page - 1) * size).limit(size).all()
    return QCListResponse(
        items=[QCResponse.model_validate(q) for q in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/available-batches", response_model=list[dict])
def get_available_batches(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return inventory batches available for QC selection."""
    from app.models.inventory import Inventory
    from app.models.receiving import Receiving

    query = db.query(Receiving, Inventory).join(
        Inventory, Receiving.batch_id == Inventory.batch_id
    ).filter(
        Receiving.deleted_at.is_(None),
        Inventory.deleted_at.is_(None),
        Inventory.available_qty > 0,
    )
    if search:
        query = query.filter(
            Receiving.batch_id.ilike(f"%{search}%") |
            Receiving.product_name.ilike(f"%{search}%") |
            Receiving.commodity_id.ilike(f"%{search}%")
        )
    results = query.all()
    return [
        {
            "batch_id": r.batch_id,
            "commodity_id": r.commodity_id,
            "product_name": r.product_name,
            "available_qty": inv.available_qty,
            "label": f"{r.batch_id} — {r.product_name} ({inv.available_qty:.0f} units)",
        }
        for r, inv in results
    ]


@router.post("", response_model=QCResponse, status_code=status.HTTP_201_CREATED)
def create_qc(
    payload: QCCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate: non-draft records must have commodity_id
    if payload.draft_status != "Draft" and not payload.commodity_id:
        raise HTTPException(status_code=400, detail="commodity_id is required for non-draft QC records")

    qc_id = generate_id(db, QC, "qc_id", "QC", 5)
    qc = QC(qc_id=qc_id, **payload.model_dump())
    db.add(qc)

    # If submitted with failed_qty — create failed inventory record
    if payload.draft_status != "Draft" and payload.failed_qty and payload.failed_qty > 0 and payload.commodity_id:
        _create_failed_record(db, qc, payload.failed_qty, payload.inspection_date, payload.remarks)

    db.commit()
    db.refresh(qc)
    return qc


@router.get("/failed", response_model=QCFailedListResponse)
def list_qc_failed(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(QCFailedInventory).filter(QCFailedInventory.deleted_at.is_(None))
    if search:
        query = query.filter(
            QCFailedInventory.batch_id.ilike(f"%{search}%") |
            QCFailedInventory.product_name.ilike(f"%{search}%") |
            QCFailedInventory.commodity_id.ilike(f"%{search}%")
        )
    total = query.count()
    items = query.order_by(QCFailedInventory.id.desc()).offset((page - 1) * size).limit(size).all()
    return QCFailedListResponse(
        items=[QCFailedResponse.model_validate(i) for i in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/{qc_id}", response_model=QCResponse)
def get_qc(
    qc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    return qc


@router.put("/{qc_id}", response_model=QCResponse)
def update_qc(
    qc_id: str,
    payload: QCUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")

    old_failed_qty = qc.failed_qty or 0.0
    old_draft_status = qc.draft_status

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(qc, field, value)
    qc.updated_at = datetime.utcnow()

    new_failed_qty = qc.failed_qty or 0.0
    new_draft_status = qc.draft_status or "Submitted"

    # When transitioning from Draft → Submitted/Approved and there is failed_qty
    if old_draft_status == "Draft" and new_draft_status != "Draft":
        if new_failed_qty > 0 and qc.commodity_id:
            # Check if a failed record already exists for this qc_id
            existing = db.query(QCFailedInventory).filter(
                QCFailedInventory.qc_id == qc_id,
                QCFailedInventory.deleted_at.is_(None),
            ).first()
            if not existing:
                _create_failed_record(db, qc, new_failed_qty, qc.inspection_date, qc.remarks)
    # When failed_qty increases on an already-submitted record
    elif old_draft_status != "Draft" and new_failed_qty > old_failed_qty:
        delta = new_failed_qty - old_failed_qty
        _create_failed_record(db, qc, delta, qc.inspection_date, qc.remarks)

    db.commit()
    db.refresh(qc)
    return qc


@router.delete("/{qc_id}", response_model=dict)
def delete_qc(
    qc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    qc.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "QC record deleted"}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _create_failed_record(db: Session, qc: QC, failed_qty: float, qc_date, remarks: str):
    """Deduct from inventory and create a QC failed record."""
    from app.services.inventory_service import deduct_stock

    try:
        deduct_stock(
            db,
            commodity_id=qc.commodity_id,
            batch_id=qc.batch_id,
            quantity=failed_qty,
            movement_type="QC Failed",
            reference_id=qc.qc_id,
            remarks=f"QC Failed — {remarks or 'No reason given'}",
        )
    except ValueError:
        pass  # If stock is insufficient, still record the failed item

    failed_id = generate_id(db, QCFailedInventory, "qc_failed_id", "QCF", 5)
    # Lookup product name from receiving
    from app.models.receiving import Receiving
    rec = db.query(Receiving).filter(
        Receiving.batch_id == qc.batch_id,
        Receiving.deleted_at.is_(None),
    ).first()
    product_name = rec.product_name if rec else None

    record = QCFailedInventory(
        qc_failed_id=failed_id,
        qc_id=qc.qc_id,
        batch_id=qc.batch_id,
        commodity_id=qc.commodity_id,
        product_name=product_name,
        failed_qty=failed_qty,
        qc_date=qc_date,
        reason=remarks,
    )
    db.add(record)
