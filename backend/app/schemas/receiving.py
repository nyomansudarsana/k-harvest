from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime, date


class ReceivingBase(BaseModel):
    date_received: date
    commodity_id: str
    product_name: str
    supplier_id: str
    supplier_name: str
    quantity: float
    harvest_date: Optional[date] = None
    expired_date: Optional[date] = None
    purchase_price: float = 0.0
    delivery_cost: float = 0.0
    remarks: Optional[str] = None

    @field_validator("quantity")
    @classmethod
    def quantity_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("Quantity must be greater than 0")
        return v

    @field_validator("purchase_price", "delivery_cost")
    @classmethod
    def price_must_be_non_negative(cls, v):
        if v < 0:
            raise ValueError("Price must be >= 0")
        return v


class ReceivingCreate(ReceivingBase):
    pass


class ReceivingUpdate(BaseModel):
    date_received: Optional[date] = None
    quantity: Optional[float] = None
    harvest_date: Optional[date] = None
    expired_date: Optional[date] = None
    purchase_price: Optional[float] = None
    delivery_cost: Optional[float] = None
    remarks: Optional[str] = None


class ReceivingResponse(ReceivingBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    receiving_id: str
    batch_id: str
    created_at: datetime
    updated_at: datetime


class ReceivingListResponse(BaseModel):
    items: list[ReceivingResponse]
    total: int
    page: int
    size: int
    pages: int
