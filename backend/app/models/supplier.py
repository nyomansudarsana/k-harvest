from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class SupplierMaster(Base):
    __tablename__ = "supplier_master"

    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(String(20), unique=True, index=True, nullable=False)  # SU00001
    supplier_name = Column(String(200), nullable=False)
    contact_number = Column(String(50), nullable=True)
    contact_email = Column(String(100), nullable=True)
    location = Column(String(300), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
