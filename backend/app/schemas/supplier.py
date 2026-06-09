from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class SupplierBase(BaseModel):
    supplier_name: str
    contact_number: Optional[str] = None
    contact_email: Optional[str] = None
    location: Optional[str] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    supplier_name: Optional[str] = None
    contact_number: Optional[str] = None
    contact_email: Optional[str] = None
    location: Optional[str] = None


class SupplierResponse(SupplierBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    supplier_id: str
    created_at: datetime
    updated_at: datetime


class SupplierListResponse(BaseModel):
    items: list[SupplierResponse]
    total: int
    page: int
    size: int
    pages: int
