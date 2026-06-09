from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Date
from app.database import Base


class StockOpname(Base):
    __tablename__ = "stock_opname"

    id = Column(Integer, primary_key=True, index=True)
    opname_id = Column(String(20), unique=True, index=True, nullable=False)  # OP00001
    opname_date = Column(Date, nullable=False)
    commodity_id = Column(String(20), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    batch_id = Column(String(50), nullable=False, index=True)
    system_qty = Column(Float, nullable=False, default=0.0)
    physical_qty = Column(Float, nullable=False, default=0.0)
    difference = Column(Float, nullable=False, default=0.0)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
