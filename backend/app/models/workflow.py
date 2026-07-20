from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from app.database import Base


class WorkflowRule(Base):
    """
    Defines automatic task creation rules triggered by ERP module events.
    e.g. When a Quotation is created → create a "Review Quotation {record_number}" task
    assigned to all users of assign_to_role.
    """
    __tablename__ = "workflow_rules"

    id = Column(Integer, primary_key=True, index=True)
    module_name = Column(String(50), nullable=False, index=True)   # quotation, invoice, receiving, stock_opname
    event_name = Column(String(50), nullable=False)                  # created, submitted, discrepancy
    task_title_template = Column(String(300), nullable=False)        # "Review Quotation {record_number}"
    category_id = Column(Integer, ForeignKey("cc_categories.id"), nullable=True)
    priority_id = Column(Integer, ForeignKey("cc_priorities.id"), nullable=True)
    assign_to_role = Column(String(50), nullable=True)               # Role name to assign tasks to
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
