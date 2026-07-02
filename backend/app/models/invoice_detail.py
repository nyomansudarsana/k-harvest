from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class InvoiceDetail(Base):
    __tablename__ = "invoice_detail"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(30), nullable=False, index=True)
    batch_id = Column(String(50), nullable=False)
    commodity_id = Column(String(20), nullable=False)
    product_name = Column(String(200), nullable=False)
    quantity = Column(Float, nullable=False, default=0.0)
    unit_price = Column(Float, nullable=False, default=0.0)
    line_total = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
