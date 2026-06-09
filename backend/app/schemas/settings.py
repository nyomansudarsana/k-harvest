from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class SettingUpdate(BaseModel):
    value: Optional[str] = None


class SettingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    value: Optional[str] = None
    description: Optional[str] = None
    updated_at: datetime


class SystemSettingsResponse(BaseModel):
    company_name: str = ""
    company_address: str = ""
    company_logo: str = ""
    invoice_prefix: str = "INV"
    currency: str = "USD"
