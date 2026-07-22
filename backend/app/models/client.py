from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Text
from app.database import Base


class ClientMaster(Base):
    __tablename__ = "client_master"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(String(20), unique=True, nullable=False, index=True)  # CL00001

    # Core identification
    client_name = Column(String(200), nullable=False, index=True)
    company_name = Column(String(200), nullable=True)
    contact_person = Column(String(150), nullable=True)

    # Contact details
    phone_number = Column(String(30), nullable=True)
    mobile_number = Column(String(30), nullable=True)
    email = Column(String(100), nullable=True, index=True)
    website = Column(String(200), nullable=True)

    # Address
    address = Column(Text, nullable=True)
    city = Column(String(100), nullable=True)
    province = Column(String(100), nullable=True)
    postal_code = Column(String(20), nullable=True)
    country = Column(String(100), nullable=True, default="Indonesia")

    # Tax & legal
    npwp = Column(String(50), nullable=True)
    tax_registered = Column(String(10), nullable=True, default="No")  # Yes / No

    # Business classification
    industry = Column(String(100), nullable=True)

    # Commercial terms
    preferred_currency = Column(String(10), nullable=True, default="USD")
    payment_terms = Column(String(50), nullable=True)   # Net 30, Net 60, COD, etc.
    credit_limit = Column(Float, nullable=True, default=0.0)

    # Status & notes
    status = Column(String(20), nullable=False, default="Active")  # Active / Inactive
    remarks = Column(Text, nullable=True)

    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, nullable=True)
    updated_by = Column(Integer, nullable=True)
    deleted_by = Column(Integer, nullable=True)
