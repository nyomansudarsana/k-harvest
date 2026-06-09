from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Date
from app.database import Base


class Receiving(Base):
    __tablename__ = "receiving"

    id = Column(Integer, primary_key=True, index=True)
    receiving_id = Column(String(20), unique=True, index=True, nullable=False)  # RC00001
    date_received = Column(Date, nullable=False)
    commodity_id = Column(String(20), nullable=False, index=True)
    product_name = Column(String(200), nullable=False)
    supplier_id = Column(String(20), nullable=False, index=True)
    supplier_name = Column(String(200), nullable=False)
    quantity = Column(Float, nullable=False)
    batch_id = Column(String(50), unique=True, index=True, nullable=False)  # Auto-generated
    harvest_date = Column(Date, nullable=True)
    expired_date = Column(Date, nullable=True)
    purchase_price = Column(Float, nullable=False, default=0.0)
    delivery_cost = Column(Float, nullable=False, default=0.0)
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
