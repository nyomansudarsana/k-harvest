import math
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.core.deps import get_current_user
from app.models.client import ClientMaster
from app.models.user import User
from app.schemas.client import ClientCreate, ClientUpdate, ClientResponse, ClientListResponse

router = APIRouter(prefix="/clients", tags=["Client Master"])


def _next_client_id(db: Session) -> str:
    count = db.query(ClientMaster).count()
    return f"CL{count + 1:05d}"


@router.get("", response_model=ClientListResponse)
def list_clients(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    search: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(ClientMaster).filter(ClientMaster.deleted_at.is_(None))
    if search:
        like = f"%{search}%"
        q = q.filter(
            ClientMaster.client_name.ilike(like) |
            ClientMaster.company_name.ilike(like) |
            ClientMaster.email.ilike(like) |
            ClientMaster.city.ilike(like) |
            ClientMaster.client_id.ilike(like) |
            ClientMaster.contact_person.ilike(like)
        )
    if status_filter:
        q = q.filter(ClientMaster.status == status_filter)
    total = q.count()
    items = q.order_by(ClientMaster.client_name).offset((page - 1) * size).limit(size).all()
    return ClientListResponse(
        items=items, total=total, page=page, size=size,
        pages=max(1, math.ceil(total / size)),
    )


@router.get("/all")
def list_all_clients(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Returns all active clients for dropdown use."""
    clients = (
        db.query(ClientMaster)
        .filter(ClientMaster.deleted_at.is_(None), ClientMaster.status == "Active")
        .order_by(ClientMaster.client_name)
        .all()
    )
    return [
        {
            "id": c.id,
            "client_id": c.client_id,
            "client_name": c.client_name,
            "company_name": c.company_name,
            "city": c.city,
            "country": c.country,
        }
        for c in clients
    ]


@router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.email and payload.email.strip():
        dup = db.query(ClientMaster).filter(
            ClientMaster.email == payload.email.strip().lower(),
            ClientMaster.deleted_at.is_(None),
        ).first()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered to another client")

    data = payload.model_dump()
    if data.get("email"):
        data["email"] = data["email"].strip().lower()

    client = ClientMaster(
        client_id=_next_client_id(db),
        created_by=current_user.id,
        **data,
    )
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=ClientResponse)
def get_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(ClientMaster).filter(
        ClientMaster.client_id == client_id,
        ClientMaster.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return c


@router.put("/{client_id}", response_model=ClientResponse)
def update_client(
    client_id: str,
    payload: ClientUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(ClientMaster).filter(
        ClientMaster.client_id == client_id,
        ClientMaster.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    upd = payload.model_dump(exclude_none=True)
    if "email" in upd and upd["email"]:
        upd["email"] = upd["email"].strip().lower()
        dup = db.query(ClientMaster).filter(
            ClientMaster.email == upd["email"],
            ClientMaster.deleted_at.is_(None),
            ClientMaster.client_id != client_id,
        ).first()
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered to another client")

    for k, v in upd.items():
        setattr(c, k, v)
    c.updated_by = current_user.id
    c.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(c)
    return c


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.query(ClientMaster).filter(
        ClientMaster.client_id == client_id,
        ClientMaster.deleted_at.is_(None),
    ).first()
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    c.deleted_at = datetime.utcnow()
    c.deleted_by = current_user.id
    db.commit()
