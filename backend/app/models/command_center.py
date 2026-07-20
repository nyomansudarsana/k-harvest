from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, ForeignKey, Date, Float
from app.database import Base


class CCCategory(Base):
    __tablename__ = "cc_categories"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(7), default="#6B7280")
    icon = Column(String(50), default="bi-tag")
    sort_order = Column(Integer, default=0)
    deleted_at = Column(DateTime, nullable=True)


class CCPriority(Base):
    __tablename__ = "cc_priorities"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), nullable=False)
    color = Column(String(7), nullable=False)
    sort_order = Column(Integer, nullable=False)


class CCStatus(Base):
    __tablename__ = "cc_statuses"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(7), default="#6B7280")
    is_terminal = Column(Boolean, default=False)
    sort_order = Column(Integer, nullable=False)
    deleted_at = Column(DateTime, nullable=True)


class CCLabel(Base):
    __tablename__ = "cc_labels"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(7), default="#6B7280")
    icon = Column(String(50), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    deleted_at = Column(DateTime, nullable=True)


class CCTask(Base):
    __tablename__ = "cc_tasks"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(300), nullable=False)
    description = Column(Text, nullable=True)
    category_id = Column(Integer, ForeignKey("cc_categories.id"), nullable=True)
    priority_id = Column(Integer, ForeignKey("cc_priorities.id"), nullable=True)
    status_id = Column(Integer, ForeignKey("cc_statuses.id"), nullable=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)  # Primary assignee (backward compat)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    start_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    # ERP workflow linkage
    related_module = Column(String(50), nullable=True)       # quotation, invoice, receiving, stock_opname
    related_record_id = Column(String(50), nullable=True)
    related_record_number = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class CCTaskAssignee(Base):
    """Multiple assignees per task — complements the legacy assigned_to on CCTask."""
    __tablename__ = "cc_task_assignees"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=datetime.utcnow)
    is_primary = Column(Boolean, default=False)
    deleted_at = Column(DateTime, nullable=True)


class CCTaskLabel(Base):
    __tablename__ = "cc_task_labels"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    label_id = Column(Integer, ForeignKey("cc_labels.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CCChecklist(Base):
    __tablename__ = "cc_checklists"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    title = Column(String(300), nullable=False)
    is_done = Column(Boolean, default=False)
    done_at = Column(DateTime, nullable=True)
    done_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    sort_order = Column(Integer, default=0)
    deleted_at = Column(DateTime, nullable=True)


class CCAttachment(Base):
    __tablename__ = "cc_attachments"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    file_name = Column(String(300), nullable=False)
    file_type = Column(String(50), nullable=True)
    file_size = Column(Integer, nullable=True)
    storage_path = Column(Text, nullable=True)
    external_url = Column(Text, nullable=True)
    source_type = Column(String(20), default="local")  # local, drive, dropbox, url
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class CCTaskLocation(Base):
    __tablename__ = "cc_task_locations"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    maps_url = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CCReminder(Base):
    __tablename__ = "cc_reminders"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    remind_at = Column(DateTime, nullable=False)
    remind_type = Column(String(20), default="custom")  # 1d, 3d, 1w, custom
    is_sent = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class CCComment(Base):
    __tablename__ = "cc_comments"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    parent_id = Column(Integer, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=False)
    edited_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)


class CCActivity(Base):
    __tablename__ = "cc_activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(20), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    field_name = Column(String(100), nullable=True)
    old_value = Column(String(500), nullable=True)
    new_value = Column(String(500), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CCNotification(Base):
    __tablename__ = "cc_notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_id = Column(String(20), nullable=True, index=True)
    type = Column(String(50), default="assignment")  # assignment, reassignment, due_date_changed, mention
    title = Column(String(300), nullable=False)
    message = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime, nullable=True)
