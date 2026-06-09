from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class StockMovement(Base):
    __tablename__ = "stock_movement"

    id = Column(Integer, primary_key=True, index=True)
    movement_id = Column(String(20), unique=True, index=True, nullable=False)
    date = Column(DateTime, default=datetime.utcnow, nullable=False)
    commodity_id = Column(String(20), nullable=False, index=True)
    batch_id = Column(String(50), nullable=False, index=True)
    movement_type = Column(String(30), nullable=False)
    qty_in = Column(Float, nullable=False, default=0.0)
    qty_out = Column(Float, nullable=False, default=0.0)
    balance = Column(Float, nullable=False, default=0.0)
    reference_id = Column(String(50), nullable=True)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
