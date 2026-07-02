from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class QCFailedResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    qc_failed_id: str
    qc_id: str
    batch_id: str
    commodity_id: str
    product_name: Optional[str] = None
    failed_qty: float
    qc_date: Optional[date] = None
    reason: Optional[str] = None
    created_at: datetime


class QCFailedListResponse(BaseModel):
    items: list[QCFailedResponse]
    total: int
    page: int
    size: int
    pages: int
