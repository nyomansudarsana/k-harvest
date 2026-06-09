from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class QuotationBase(BaseModel):
    commodity_id: str
    product_name: str
    batch_id: str
    available_qty: float
    purchase_price: float
    delivery_cost: float
    manpower_percent: float = 0.0
    management_percent: float = 0.0
    margin_percent: float = 0.0
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    currency_code: str = "IDR"
    exchange_rate: float = 1.0
    exchange_rate_timestamp: Optional[datetime] = None
    tax_percentage: float = 10.0


class QuotationCreate(QuotationBase):
    pass


class QuotationUpdate(BaseModel):
    manpower_percent: Optional[float] = None
    management_percent: Optional[float] = None
    margin_percent: Optional[float] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    currency_code: Optional[str] = None
    exchange_rate: Optional[float] = None
    exchange_rate_timestamp: Optional[datetime] = None
    tax_percentage: Optional[float] = None


class QuotationCalculateRequest(BaseModel):
    purchase_price: float
    delivery_cost: float
    manpower_percent: float = 0.0
    management_percent: float = 0.0
    margin_percent: float = 0.0
    available_qty: float = 0.0
    tax_percentage: float = 10.0


class QuotationCalculateResponse(BaseModel):
    purchase_price: float
    delivery_cost: float
    manpower_amount: float
    management_amount: float
    margin_amount: float
    quote_price: float
    available_qty: float
    tax_percentage: float
    tax_amount: float
    grand_total: float


class QuotationResponse(QuotationBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quotation_id: str
    quote_price: float
    status: str
    tax_amount: Optional[float] = 0.0
    grand_total: Optional[float] = 0.0
    created_at: datetime
    updated_at: datetime


class QuotationListResponse(BaseModel):
    items: list[QuotationResponse]
    total: int
    page: int
    size: int
    pages: int
