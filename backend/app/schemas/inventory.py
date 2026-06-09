from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class InventoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    inventory_id: str
    commodity_id: str
    product_name: str
    batch_id: str
    available_qty: float
    reserved_qty: float
    last_movement_date: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InventoryListResponse(BaseModel):
    items: list[InventoryResponse]
    total: int
    page: int
    size: int
    pages: int


class StockMovementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    movement_id: str
    date: datetime
    commodity_id: str
    batch_id: str
    movement_type: str
    qty_in: float
    qty_out: float
    balance: float
    reference_id: Optional[str] = None
    remarks: Optional[str] = None
    created_at: datetime
