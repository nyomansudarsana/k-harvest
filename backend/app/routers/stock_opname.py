from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.stock_opname import StockOpname
from app.models.inventory import Inventory
from app.models.user import User
from app.schemas.stock_opname import StockOpnameCreate, StockOpnameResponse, StockOpnameListResponse
from app.services.inventory_service import adjust_stock
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/stock-opname", tags=["Stock Opname"])


@router.get("", response_model=StockOpnameListResponse)
def list_opname(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(StockOpname).filter(StockOpname.deleted_at.is_(None))
    if search:
        query = query.filter(
            StockOpname.batch_id.ilike(f"%{search}%") |
            StockOpname.opname_id.ilike(f"%{search}%") |
            StockOpname.product_name.ilike(f"%{search}%")
        )
    total = query.count()
    items = query.order_by(StockOpname.id.desc()).offset((page - 1) * size).limit(size).all()
    return StockOpnameListResponse(
        items=[StockOpnameResponse.model_validate(o) for o in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/system-qty/{batch_id}", response_model=dict)
def get_system_qty(batch_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Inventory).filter(Inventory.batch_id == batch_id, Inventory.deleted_at.is_(None)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Batch not found in inventory")
    return {"system_qty": inv.available_qty, "batch_id": batch_id}


@router.post("", response_model=StockOpnameResponse, status_code=status.HTTP_201_CREATED)
def create_opname(payload: StockOpnameCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(Inventory).filter(Inventory.batch_id == payload.batch_id, Inventory.deleted_at.is_(None)).first()
    system_qty = inv.available_qty if inv else 0.0
    difference = payload.physical_qty - system_qty
    opname_id = generate_id(db, StockOpname, "opname_id", "OP", 5)

    opname = StockOpname(
        opname_id=opname_id,
        opname_date=payload.opname_date,
        commodity_id=payload.commodity_id,
        product_name=payload.product_name,
        batch_id=payload.batch_id,
        system_qty=system_qty,
        physical_qty=payload.physical_qty,
        difference=difference,
        remarks=payload.remarks,
    )
    db.add(opname)
    db.flush()

    adjust_stock(
        db,
        commodity_id=payload.commodity_id,
        product_name=payload.product_name,
        batch_id=payload.batch_id,
        system_qty=system_qty,
        physical_qty=payload.physical_qty,
        reference_id=opname_id,
        remarks=payload.remarks or f"Stock Opname adjustment",
    )

    db.commit()
    db.refresh(opname)
    return opname
