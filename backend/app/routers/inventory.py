from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.inventory import Inventory
from app.models.stock_movement import StockMovement
from app.models.user import User
from app.schemas.inventory import InventoryListResponse, InventoryResponse, StockMovementResponse

router = APIRouter(prefix="/inventory", tags=["Inventory"])


@router.get("", response_model=InventoryListResponse)
def list_inventory(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    commodity_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Inventory).filter(Inventory.deleted_at.is_(None))
    if search:
        query = query.filter(
            Inventory.product_name.ilike(f"%{search}%") |
            Inventory.batch_id.ilike(f"%{search}%") |
            Inventory.commodity_id.ilike(f"%{search}%")
        )
    if commodity_id:
        query = query.filter(Inventory.commodity_id == commodity_id)
    total = query.count()
    items = query.order_by(Inventory.id.desc()).offset((page - 1) * size).limit(size).all()
    return InventoryListResponse(
        items=[InventoryResponse.model_validate(i) for i in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/movements", response_model=dict)
def list_movements(
    page: int = 1,
    size: int = 30,
    batch_id: Optional[str] = None,
    commodity_id: Optional[str] = None,
    movement_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(StockMovement).filter(StockMovement.deleted_at.is_(None))
    if batch_id:
        query = query.filter(StockMovement.batch_id == batch_id)
    if commodity_id:
        query = query.filter(StockMovement.commodity_id == commodity_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    total = query.count()
    items = query.order_by(StockMovement.id.desc()).offset((page - 1) * size).limit(size).all()
    return {
        "items": [StockMovementResponse.model_validate(m) for m in items],
        "total": total, "page": page, "size": size,
        "pages": (total + size - 1) // size,
    }


@router.get("/summary", response_model=dict)
def inventory_summary(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from sqlalchemy import func
    items = db.query(
        Inventory.commodity_id,
        Inventory.product_name,
        func.sum(Inventory.available_qty).label("total_qty"),
        func.count(Inventory.id).label("batch_count"),
    ).filter(
        Inventory.deleted_at.is_(None)
    ).group_by(Inventory.commodity_id, Inventory.product_name).all()
    return {
        "items": [
            {"commodity_id": r.commodity_id, "product_name": r.product_name,
             "total_qty": r.total_qty, "batch_count": r.batch_count}
            for r in items
        ]
    }
