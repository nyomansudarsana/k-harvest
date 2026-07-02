from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Date
from app.database import Base


class QCFailedInventory(Base):
    __tablename__ = "qc_failed_inventory"

    id = Column(Integer, primary_key=True, index=True)
    qc_failed_id = Column(String(20), unique=True, index=True, nullable=False)
    qc_id = Column(String(20), nullable=False, index=True)
    batch_id = Column(String(50), nullable=False, index=True)
    commodity_id = Column(String(20), nullable=False)
    product_name = Column(String(200), nullable=True)
    failed_qty = Column(Float, nullable=False, default=0.0)
    qc_date = Column(Date, nullable=True)
    reason = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
