from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Any
from app.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.settings import SystemSettings
from app.models.user import User
from app.schemas.settings import SystemSettingsResponse

router = APIRouter(prefix="/settings", tags=["Settings"])

DEFAULT_SETTINGS = {
    "company_name": ("Kopernik Harvest", "Company display name"),
    "company_address": ("", "Company address"),
    "company_logo": ("", "Company logo URL"),
    "invoice_prefix": ("INV", "Invoice ID prefix"),
    "currency": ("USD", "Default currency code"),
}


@router.get("", response_model=SystemSettingsResponse)
def get_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(SystemSettings).filter(SystemSettings.deleted_at.is_(None)).all()
    data = {r.key: r.value for r in rows}
    return SystemSettingsResponse(
        company_name=data.get("company_name", "Kopernik Harvest"),
        company_address=data.get("company_address", ""),
        company_logo=data.get("company_logo", ""),
        invoice_prefix=data.get("invoice_prefix", "INV"),
        currency=data.get("currency", "USD"),
    )


@router.put("", response_model=SystemSettingsResponse)
def update_settings(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    allowed_keys = set(DEFAULT_SETTINGS.keys())
    for key, value in payload.items():
        if key not in allowed_keys:
            continue
        row = db.query(SystemSettings).filter(SystemSettings.key == key).first()
        if row:
            row.value = str(value) if value is not None else ""
            row.updated_at = datetime.utcnow()
        else:
            desc = DEFAULT_SETTINGS.get(key, ("", ""))[1]
            row = SystemSettings(key=key, value=str(value) if value is not None else "", description=desc)
            db.add(row)
    db.commit()
    return get_settings(db, current_user)
