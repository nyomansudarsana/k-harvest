from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime


class UserBase(BaseModel):
    full_name: str
    username: str
    email: str  # Required — used for task assignment notifications
    role: str = "Staff"
    status: str = "Active"


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class UserPasswordReset(BaseModel):
    new_password: str


class UserPermissionItem(BaseModel):
    menu_code: str
    can_view: bool = False
    can_create: bool = False
    can_edit: bool = False
    can_delete: bool = False
    can_approve: bool = False
    can_export: bool = False


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: str
    created_at: datetime
    updated_at: datetime
    permissions: List[UserPermissionItem] = []


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
