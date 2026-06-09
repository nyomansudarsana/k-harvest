from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class ProductBase(BaseModel):
    commodity: str
    origin: Optional[str] = None
    categories: Optional[str] = None
    product_name: str
    unit: str = "Kg"
    status: str = "Active"


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    commodity: Optional[str] = None
    origin: Optional[str] = None
    categories: Optional[str] = None
    product_name: Optional[str] = None
    unit: Optional[str] = None
    status: Optional[str] = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    commodity_id: str
    created_at: datetime
    updated_at: datetime


class ProductListResponse(BaseModel):
    items: list[ProductResponse]
    total: int
    page: int
    size: int
    pages: int
