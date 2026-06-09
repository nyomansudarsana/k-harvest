from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.product import ProductMaster
from app.models.user import User
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse, ProductListResponse
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/products", tags=["Products"])


@router.get("", response_model=ProductListResponse)
def list_products(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ProductMaster).filter(ProductMaster.deleted_at.is_(None))
    if search:
        query = query.filter(
            ProductMaster.product_name.ilike(f"%{search}%") |
            ProductMaster.commodity.ilike(f"%{search}%") |
            ProductMaster.commodity_id.ilike(f"%{search}%") |
            ProductMaster.categories.ilike(f"%{search}%")
        )
    if status:
        query = query.filter(ProductMaster.status == status)
    total = query.count()
    items = query.order_by(ProductMaster.id.desc()).offset((page - 1) * size).limit(size).all()
    return ProductListResponse(
        items=[ProductResponse.model_validate(p) for p in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.get("/all", response_model=list[ProductResponse])
def get_all_products(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ProductMaster).filter(ProductMaster.deleted_at.is_(None), ProductMaster.status == "Active").all()


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    commodity_id = generate_id(db, ProductMaster, "commodity_id", "KH", 5)
    product = ProductMaster(commodity_id=commodity_id, **payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{commodity_id}", response_model=ProductResponse)
def get_product(commodity_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = db.query(ProductMaster).filter(
        ProductMaster.commodity_id == commodity_id,
        ProductMaster.deleted_at.is_(None),
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{commodity_id}", response_model=ProductResponse)
def update_product(commodity_id: str, payload: ProductUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = db.query(ProductMaster).filter(
        ProductMaster.commodity_id == commodity_id,
        ProductMaster.deleted_at.is_(None),
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(product, field, value)
    product.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{commodity_id}", response_model=dict)
def delete_product(commodity_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    product = db.query(ProductMaster).filter(
        ProductMaster.commodity_id == commodity_id,
        ProductMaster.deleted_at.is_(None),
    ).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Product deleted successfully"}
