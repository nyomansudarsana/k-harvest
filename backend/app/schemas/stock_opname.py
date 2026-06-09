from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class StockOpnameBase(BaseModel):
    opname_date: date
    commodity_id: str
    product_name: str
    batch_id: str
    physical_qty: float
    remarks: Optional[str] = None


class StockOpnameCreate(StockOpnameBase):
    pass


class StockOpnameResponse(StockOpnameBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    opname_id: str
    system_qty: float
    difference: float
    created_at: datetime
    updated_at: datetime


class StockOpnameListResponse(BaseModel):
    items: list[StockOpnameResponse]
    total: int
    page: int
    size: int
    pages: int
