from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base


class ProductMaster(Base):
    __tablename__ = "product_master"

    id = Column(Integer, primary_key=True, index=True)
    commodity_id = Column(String(20), unique=True, index=True, nullable=False)  # KH00001
    commodity = Column(String(100), nullable=False)
    origin = Column(String(100), nullable=True)
    categories = Column(String(100), nullable=True)
    product_name = Column(String(200), nullable=False)
    unit = Column(String(20), nullable=False, default="Kg")  # Kg | Liter | Piece | Box | Other
    status = Column(String(20), nullable=False, default="Active")  # Active | Inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
