from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float
from app.database import Base


class ReceivingExtraCost(Base):
    __tablename__ = "receiving_extra_cost"

    id = Column(Integer, primary_key=True, index=True)
    receiving_id = Column(String(20), nullable=False, index=True)
    cost_type = Column(String(100), nullable=False)
    amount = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
