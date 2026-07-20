from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime


class RoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6B7280"


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class RoleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    color: str
    is_system: bool
    sort_order: int
    created_at: datetime


class MenuPermissionItem(BaseModel):
    menu_code: str
    can_view: bool = False
    can_create: bool = False
    can_edit: bool = False
    can_delete: bool = False
    can_approve: bool = False
    can_export: bool = False


class PermissionMatrixUpdate(BaseModel):
    permissions: List[MenuPermissionItem]


class MenuPermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role_name: str
    menu_code: str
    can_view: bool
    can_create: bool
    can_edit: bool
    can_delete: bool
    can_approve: bool
    can_export: bool
