from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class ClientCreate(BaseModel):
    client_name: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_number: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = "Indonesia"
    npwp: Optional[str] = None
    tax_registered: Optional[str] = "No"
    industry: Optional[str] = None
    preferred_currency: Optional[str] = "USD"
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = 0.0
    status: Optional[str] = "Active"
    remarks: Optional[str] = None


class ClientUpdate(BaseModel):
    client_name: Optional[str] = None
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_number: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    npwp: Optional[str] = None
    tax_registered: Optional[str] = None
    industry: Optional[str] = None
    preferred_currency: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


class ClientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: str
    client_name: str
    company_name: Optional[str] = None
    contact_person: Optional[str] = None
    phone_number: Optional[str] = None
    mobile_number: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    province: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    npwp: Optional[str] = None
    tax_registered: Optional[str] = None
    industry: Optional[str] = None
    preferred_currency: Optional[str] = None
    payment_terms: Optional[str] = None
    credit_limit: Optional[float] = None
    status: str
    remarks: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ClientListResponse(BaseModel):
    items: List[ClientResponse]
    total: int
    page: int
    size: int
    pages: int
