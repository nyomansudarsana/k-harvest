from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class QCBase(BaseModel):
    batch_id: str
    commodity_id: str
    moisture_content: Optional[float] = None
    quality_grade: Optional[str] = None
    inspection_date: Optional[date] = None
    qc_status: str = "Pending"
    remarks: Optional[str] = None


class QCCreate(QCBase):
    pass


class QCUpdate(BaseModel):
    moisture_content: Optional[float] = None
    quality_grade: Optional[str] = None
    inspection_date: Optional[date] = None
    qc_status: Optional[str] = None
    remarks: Optional[str] = None


class QCResponse(QCBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    qc_id: str
    created_at: datetime
    updated_at: datetime


class QCListResponse(BaseModel):
    items: list[QCResponse]
    total: int
    page: int
    size: int
    pages: int
