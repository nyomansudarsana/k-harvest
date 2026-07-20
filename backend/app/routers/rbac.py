from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from app.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.user import User
from app.models.rbac import Role, MenuPermission
from app.schemas.rbac import (
    RoleCreate, RoleUpdate, RoleResponse,
    MenuPermissionItem, PermissionMatrixUpdate, MenuPermissionResponse,
)

router = APIRouter(prefix="/rbac", tags=["RBAC"])

MENU_CODES = [
    "dashboard", "command_center",
    "products", "suppliers", "users",
    "receiving", "qc", "qc_failed", "inventory", "stock_opname",
    "quotation", "invoice", "settings",
]


@router.get("/roles", response_model=List[RoleResponse])
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Role)
        .filter(Role.deleted_at.is_(None))
        .order_by(Role.sort_order, Role.id)
        .all()
    )


@router.post("/roles", response_model=RoleResponse, status_code=201)
def create_role(
    payload: RoleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if db.query(Role).filter(Role.name == payload.name, Role.deleted_at.is_(None)).first():
        raise HTTPException(status_code=400, detail="Role name already exists")
    role = Role(
        name=payload.name,
        description=payload.description,
        color=payload.color,
        is_system=False,
        sort_order=99,
    )
    db.add(role)
    db.flush()
    for mc in MENU_CODES:
        db.add(MenuPermission(role_name=role.name, menu_code=mc))
    db.commit()
    db.refresh(role)
    return role


@router.put("/roles/{role_name}", response_model=RoleResponse)
def update_role(
    role_name: str,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    role = db.query(Role).filter(Role.name == role_name, Role.deleted_at.is_(None)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system and payload.name and payload.name != role_name:
        raise HTTPException(status_code=400, detail="System roles cannot be renamed")
    if payload.name and payload.name != role_name:
        db.query(MenuPermission).filter(MenuPermission.role_name == role_name).update(
            {"role_name": payload.name}
        )
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(role, field, value)
    role.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(role)
    return role


@router.delete("/roles/{role_name}")
def delete_role(
    role_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    role = db.query(Role).filter(Role.name == role_name, Role.deleted_at.is_(None)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    role.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": f"Role '{role_name}' deleted"}


@router.get("/roles/{role_name}/permissions", response_model=List[MenuPermissionResponse])
def get_permissions(
    role_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = db.query(Role).filter(Role.name == role_name, Role.deleted_at.is_(None)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    existing = db.query(MenuPermission).filter(MenuPermission.role_name == role_name).all()
    existing_codes = {p.menu_code for p in existing}
    for mc in MENU_CODES:
        if mc not in existing_codes:
            db.add(MenuPermission(role_name=role_name, menu_code=mc))
    db.commit()
    return (
        db.query(MenuPermission)
        .filter(MenuPermission.role_name == role_name)
        .order_by(MenuPermission.id)
        .all()
    )


@router.put("/roles/{role_name}/permissions")
def update_permissions(
    role_name: str,
    payload: PermissionMatrixUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    role = db.query(Role).filter(Role.name == role_name, Role.deleted_at.is_(None)).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    for item in payload.permissions:
        perm = db.query(MenuPermission).filter(
            MenuPermission.role_name == role_name,
            MenuPermission.menu_code == item.menu_code,
        ).first()
        if perm:
            perm.can_view = item.can_view
            perm.can_create = item.can_create
            perm.can_edit = item.can_edit
            perm.can_delete = item.can_delete
            perm.can_approve = item.can_approve
            perm.can_export = item.can_export
        else:
            db.add(MenuPermission(
                role_name=role_name,
                menu_code=item.menu_code,
                can_view=item.can_view,
                can_create=item.can_create,
                can_edit=item.can_edit,
                can_delete=item.can_delete,
                can_approve=item.can_approve,
                can_export=item.can_export,
            ))
    db.commit()
    return {"message": "Permissions updated"}


@router.get("/my-permissions", response_model=List[MenuPermissionResponse])
def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(MenuPermission).filter(MenuPermission.role_name == current_user.role).all()
