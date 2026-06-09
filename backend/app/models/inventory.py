from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class Inventory(Base):
    __tablename__ = "inventory"

    id = Column(Integer, primary_key=True, index=True)
    inventory_id = Column(String(20), unique=True, index=True, nullable=False)  # INV00001
    commodity_id = Column(String(20), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    batch_id = Column(String(50), unique=True, index=True, nullable=False)
    available_qty = Column(Float, nullable=False, default=0.0)
    reserved_qty = Column(Float, nullable=False, default=0.0)
    last_movement_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
