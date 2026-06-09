from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.supplier import SupplierMaster
from app.models.user import User
from app.schemas.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("", response_model=SupplierListResponse)
def list_suppliers(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(SupplierMaster).filter(SupplierMaster.deleted_at.is_(None))
    if search:
        query = query.filter(
            SupplierMaster.supplier_name.ilike(f"%{search}%") |
            SupplierMaster.supplier_id.ilike(f"%{search}%") |
            SupplierMaster.location.ilike(f"%{search}%")
        )
    total = query.count()
    items = query.order_by(SupplierMaster.id.desc()).offset((page - 1) * size).limit(size).all()
    return SupplierListResponse(
        items=[SupplierResponse.model_validate(s) for s in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/all", response_model=list[SupplierResponse])
def get_all_suppliers(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(SupplierMaster).filter(SupplierMaster.deleted_at.is_(None)).all()


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier_id = generate_id(db, SupplierMaster, "supplier_id", "SU", 5)
    supplier = SupplierMaster(supplier_id=supplier_id, **payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}", response_model=SupplierResponse)
def get_supplier(supplier_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = db.query(SupplierMaster).filter(
        SupplierMaster.supplier_id == supplier_id,
        SupplierMaster.deleted_at.is_(None),
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: str, payload: SupplierUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = db.query(SupplierMaster).filter(
        SupplierMaster.supplier_id == supplier_id,
        SupplierMaster.deleted_at.is_(None),
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(supplier, field, value)
    supplier.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(supplier)
    return supplier


@router.delete("/{supplier_id}", response_model=dict)
def delete_supplier(supplier_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    supplier = db.query(SupplierMaster).filter(
        SupplierMaster.supplier_id == supplier_id,
        SupplierMaster.deleted_at.is_(None),
    ).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Supplier deleted successfully"}
