from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

EXTRA_COST_TYPES = [
    "Handling Labor", "Truck Rental", "Packaging",
    "Storage", "Fuel", "Inspection Cost", "Other",
]


class ExtraCostCreate(BaseModel):
    cost_type: str
    amount: float


class ExtraCostResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    receiving_id: str
    cost_type: str
    amount: float
    created_at: datetime
