from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Boolean
from app.database import Base


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, nullable=False, index=True)
    description = Column(String(200), nullable=True)
    color = Column(String(7), default="#6B7280")
    is_system = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class MenuPermission(Base):
    __tablename__ = "menu_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(50), nullable=False, index=True)
    menu_code = Column(String(50), nullable=False)
    can_view = Column(Boolean, default=False)
    can_create = Column(Boolean, default=False)
    can_edit = Column(Boolean, default=False)
    can_delete = Column(Boolean, default=False)
    can_approve = Column(Boolean, default=False)
    can_export = Column(Boolean, default=False)
