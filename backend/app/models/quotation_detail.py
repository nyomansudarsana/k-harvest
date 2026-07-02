from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class QuotationDetail(Base):
    __tablename__ = "quotation_detail"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(String(20), nullable=False, index=True)
    batch_id = Column(String(50), nullable=False)
    commodity_id = Column(String(20), nullable=False)
    product_name = Column(String(200), nullable=False)
    available_qty = Column(Float, nullable=False, default=0.0)
    quoted_qty = Column(Float, nullable=False, default=0.0)
    purchase_price = Column(Float, nullable=False, default=0.0)
    delivery_cost = Column(Float, nullable=False, default=0.0)
    extra_costs_total = Column(Float, nullable=False, default=0.0)
    total_cost_basis = Column(Float, nullable=False, default=0.0)
    manpower_percent = Column(Float, nullable=False, default=0.0)
    management_percent = Column(Float, nullable=False, default=0.0)
    margin_percent = Column(Float, nullable=False, default=0.0)
    unit_price = Column(Float, nullable=False, default=0.0)
    line_subtotal = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
