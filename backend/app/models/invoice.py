from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Date
from app.database import Base


class Invoice(Base):
    __tablename__ = "invoice"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(30), unique=True, index=True, nullable=False)
    invoice_date = Column(Date, nullable=False)
    customer_name = Column(String(200), nullable=False)
    customer_email = Column(String(100), nullable=True)
    customer_address = Column(String(500), nullable=True)
    quotation_id = Column(String(20), nullable=True, index=True)
    commodity_id = Column(String(20), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    batch_id = Column(String(50), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=0.0)
    unit_price = Column(Float, nullable=False, default=0.0)
    total_amount = Column(Float, nullable=False, default=0.0)
    invoice_status = Column(String(20), nullable=False, default="Draft")
    notes = Column(String(500), nullable=True)
    # Currency fields — populated from linked quotation (Feature 1 + 6)
    currency_code = Column(String(10), nullable=True, default="IDR")
    exchange_rate = Column(Float, nullable=True, default=1.0)
    # Tax fields (Feature 6)
    tax_percentage = Column(Float, nullable=True, default=0.0)
    tax_amount = Column(Float, nullable=True, default=0.0)
    grand_total = Column(Float, nullable=True, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
