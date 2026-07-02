from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Float, Date
from app.database import Base


class QC(Base):
    __tablename__ = "qc"

    id = Column(Integer, primary_key=True, index=True)
    qc_id = Column(String(20), unique=True, index=True, nullable=False)
    batch_id = Column(String(50), nullable=False, index=True)
    commodity_id = Column(String(20), nullable=True, index=True)   # nullable for Draft mode
    moisture_content = Column(Float, nullable=True)
    quality_grade = Column(String(20), nullable=True)              # A | B | C | Reject
    product_grade = Column(String(100), nullable=True)             # Enh 7: Gourmet | Grade A | Grade B etc.
    inspection_date = Column(Date, nullable=True)
    qc_status = Column(String(20), nullable=False, default="Pending")  # Pending | Passed | Failed
    draft_status = Column(String(20), nullable=False, default="Submitted")  # Enh 8: Draft | Submitted | Approved | Rejected
    passed_qty = Column(Float, nullable=True, default=0.0)         # Enh 6
    failed_qty = Column(Float, nullable=True, default=0.0)         # Enh 6
    remarks = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)
