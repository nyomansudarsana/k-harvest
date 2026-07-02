from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class Quotation(Base):
    __tablename__ = "quotation"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(String(20), unique=True, index=True, nullable=False)
    # Header-level fields
    customer_name = Column(String(200), nullable=True)
    customer_email = Column(String(100), nullable=True)
    notes = Column(String(500), nullable=True)
    status = Column(String(30), nullable=False, default="Draft")
    currency_code = Column(String(10), nullable=True, default="IDR")
    exchange_rate = Column(Float, nullable=True, default=1.0)
    exchange_rate_timestamp = Column(DateTime, nullable=True)
    tax_percentage = Column(Float, nullable=True, default=10.0)
    subtotal = Column(Float, nullable=True, default=0.0)
    tax_amount = Column(Float, nullable=True, default=0.0)
    grand_total = Column(Float, nullable=True, default=0.0)
    # Legacy single-product fields — kept for backward compatibility with existing records
    commodity_id = Column(String(20), nullable=True, index=True)
    product_name = Column(String(200), nullable=True)
    batch_id = Column(String(50), nullable=True, index=True)
    available_qty = Column(Float, nullable=True, default=0.0)
    purchase_price = Column(Float, nullable=True, default=0.0)
    delivery_cost = Column(Float, nullable=True, default=0.0)
    manpower_percent = Column(Float, nullable=True, default=0.0)
    management_percent = Column(Float, nullable=True, default=0.0)
    margin_percent = Column(Float, nullable=True, default=0.0)
    quote_price = Column(Float, nullable=True, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
