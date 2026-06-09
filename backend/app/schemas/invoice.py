from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime, date


class InvoiceBase(BaseModel):
    invoice_date: date
    customer_name: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    commodity_id: str
    product_name: str
    batch_id: str
    quantity: float
    unit_price: float
    notes: Optional[str] = None


class InvoiceCreate(InvoiceBase):
    quotation_id: Optional[str] = None


class InvoiceFromQuotation(BaseModel):
    quotation_id: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    quantity: float
    invoice_date: date
    notes: Optional[str] = None


class InvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_address: Optional[str] = None
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    invoice_status: Optional[str] = None
    notes: Optional[str] = None


class InvoiceResponse(InvoiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    invoice_id: str
    quotation_id: Optional[str] = None
    total_amount: float
    invoice_status: str
    currency_code: Optional[str] = "IDR"
    exchange_rate: Optional[float] = 1.0
    tax_percentage: Optional[float] = 0.0
    tax_amount: Optional[float] = 0.0
    grand_total: Optional[float] = 0.0
    created_at: datetime
    updated_at: datetime


class InvoiceListResponse(BaseModel):
    items: list[InvoiceResponse]
    total: int
    page: int
    size: int
    pages: int
