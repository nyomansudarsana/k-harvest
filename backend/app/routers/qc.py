from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from app.database import get_db
from app.core.deps import get_current_user
from app.models.qc import QC
from app.models.user import User
from app.schemas.qc import QCCreate, QCUpdate, QCResponse, QCListResponse
from app.utils.id_generator import generate_id

router = APIRouter(prefix="/qc", tags=["QC"])


@router.get("", response_model=QCListResponse)
def list_qc(
    page: int = 1,
    size: int = 20,
    search: Optional[str] = None,
    qc_status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(QC).filter(QC.deleted_at.is_(None))
    if search:
        query = query.filter(QC.batch_id.ilike(f"%{search}%") | QC.qc_id.ilike(f"%{search}%"))
    if qc_status:
        query = query.filter(QC.qc_status == qc_status)
    total = query.count()
    items = query.order_by(QC.id.desc()).offset((page - 1) * size).limit(size).all()
    return QCListResponse(
        items=[QCResponse.model_validate(q) for q in items],
        total=total, page=page, size=size,
        pages=(total + size - 1) // size,
    )


@router.post("", response_model=QCResponse, status_code=status.HTTP_201_CREATED)
def create_qc(payload: QCCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    qc_id = generate_id(db, QC, "qc_id", "QC", 5)
    qc = QC(qc_id=qc_id, **payload.model_dump())
    db.add(qc)
    db.commit()
    db.refresh(qc)
    return qc


@router.get("/{qc_id}", response_model=QCResponse)
def get_qc(qc_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    return qc


@router.put("/{qc_id}", response_model=QCResponse)
def update_qc(qc_id: str, payload: QCUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(qc, field, value)
    qc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(qc)
    return qc


@router.delete("/{qc_id}", response_model=dict)
def delete_qc(qc_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    qc = db.query(QC).filter(QC.qc_id == qc_id, QC.deleted_at.is_(None)).first()
    if not qc:
        raise HTTPException(status_code=404, detail="QC record not found")
    qc.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "QC record deleted"}
