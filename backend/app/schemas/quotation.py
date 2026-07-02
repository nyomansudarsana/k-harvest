from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


# ── Detail line item ─────────────────────────────────────────────────────────

class QuotationDetailCreate(BaseModel):
    batch_id: str
    commodity_id: str
    product_name: str
    available_qty: float
    quoted_qty: float
    purchase_price: float
    delivery_cost: float
    extra_costs_total: float = 0.0
    manpower_percent: float = 0.0
    management_percent: float = 0.0
    margin_percent: float = 0.0


class QuotationDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quotation_id: str
    batch_id: str
    commodity_id: str
    product_name: str
    available_qty: float
    quoted_qty: float
    purchase_price: float
    delivery_cost: float
    extra_costs_total: float
    total_cost_basis: float
    manpower_percent: float
    management_percent: float
    margin_percent: float
    unit_price: float
    line_subtotal: float


# ── Header ────────────────────────────────────────────────────────────────────

class QuotationCreate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    currency_code: str = "IDR"
    exchange_rate: float = 1.0
    exchange_rate_timestamp: Optional[datetime] = None
    tax_percentage: float = 10.0
    items: list[QuotationDetailCreate]


class QuotationUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    currency_code: Optional[str] = None
    exchange_rate: Optional[float] = None
    exchange_rate_timestamp: Optional[datetime] = None
    tax_percentage: Optional[float] = None
    items: Optional[list[QuotationDetailCreate]] = None


class QuotationStatusUpdate(BaseModel):
    status: str


class QuotationCalculateRequest(BaseModel):
    purchase_price: float
    delivery_cost: float
    extra_costs_total: float = 0.0
    manpower_percent: float = 0.0
    management_percent: float = 0.0
    margin_percent: float = 0.0
    quoted_qty: float = 0.0
    tax_percentage: float = 10.0


class QuotationCalculateResponse(BaseModel):
    total_cost_basis: float
    manpower_amount: float
    management_amount: float
    margin_amount: float
    unit_price: float
    quoted_qty: float
    line_subtotal: float
    tax_percentage: float
    tax_amount: float
    grand_total: float


class QuotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    quotation_id: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    notes: Optional[str] = None
    status: str
    currency_code: Optional[str] = "IDR"
    exchange_rate: Optional[float] = 1.0
    exchange_rate_timestamp: Optional[datetime] = None
    tax_percentage: Optional[float] = 10.0
    subtotal: Optional[float] = 0.0
    tax_amount: Optional[float] = 0.0
    grand_total: Optional[float] = 0.0
    # Legacy fields for backward compat
    commodity_id: Optional[str] = None
    product_name: Optional[str] = None
    batch_id: Optional[str] = None
    available_qty: Optional[float] = 0.0
    purchase_price: Optional[float] = 0.0
    delivery_cost: Optional[float] = 0.0
    manpower_percent: Optional[float] = 0.0
    management_percent: Optional[float] = 0.0
    margin_percent: Optional[float] = 0.0
    quote_price: Optional[float] = 0.0
    items: list[QuotationDetailResponse] = []
    created_at: datetime
    updated_at: datetime


class QuotationListResponse(BaseModel):
    items: list[QuotationResponse]
    total: int
    page: int
    size: int
    pages: int
