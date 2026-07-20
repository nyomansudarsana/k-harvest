from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any
from datetime import datetime, date


class CCCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    icon: str
    sort_order: int


class CCPriorityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    sort_order: int


class CCStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    is_terminal: bool
    sort_order: int


class CCLabelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    color: str
    icon: Optional[str] = None


class CCLabelCreate(BaseModel):
    name: str
    color: str = "#6B7280"
    icon: Optional[str] = None


class CCChecklistCreate(BaseModel):
    title: str


class CCAttachmentCreate(BaseModel):
    file_name: str
    external_url: Optional[str] = None
    source_type: str = "url"  # url, drive, dropbox


class CCLocationCreate(BaseModel):
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    maps_url: Optional[str] = None


class CCReminderCreate(BaseModel):
    remind_at: datetime
    remind_type: str = "custom"


class CCTaskAssigneeResponse(BaseModel):
    id: int
    task_id: str
    user_id: int
    assigned_by: int
    assigned_at: datetime
    is_primary: bool
    user_full_name: Optional[str] = None
    user_username: Optional[str] = None


class CCTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    status_id: Optional[int] = None
    assigned_to: Optional[int] = None           # Primary assignee (backward compat)
    assignee_ids: List[int] = []                # Additional assignees
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class CCTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    status_id: Optional[int] = None
    assigned_to: Optional[int] = None
    assignee_ids: Optional[List[int]] = None    # When provided, replaces all assignees
    start_date: Optional[date] = None
    due_date: Optional[date] = None


class CCTaskStatusUpdate(BaseModel):
    status_id: int


class CCCommentCreate(BaseModel):
    comment: str
    parent_id: Optional[int] = None


class CCCommentUpdate(BaseModel):
    comment: str


class CCTaskResponse(BaseModel):
    id: int
    task_id: str
    title: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    status_id: Optional[int] = None
    assigned_by: int
    assigned_to: Optional[int] = None
    created_by: int
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # ERP linkage
    related_module: Optional[str] = None
    related_record_id: Optional[str] = None
    related_record_number: Optional[str] = None
    # Enriched
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    priority_name: Optional[str] = None
    priority_color: Optional[str] = None
    status_name: Optional[str] = None
    status_color: Optional[str] = None
    is_terminal: Optional[bool] = None
    assigned_by_name: Optional[str] = None
    assigned_to_name: Optional[str] = None
    created_by_name: Optional[str] = None
    comment_count: int = 0
    attachment_count: int = 0
    checklist_total: int = 0
    checklist_done: int = 0
    labels: List[Any] = []
    assignees: List[Any] = []
    checklists: List[Any] = []
    attachments: List[Any] = []
    location: Optional[Any] = None
    reminders: List[Any] = []
    comments: List[Any] = []
    activities: List[Any] = []


class CCTaskListResponse(BaseModel):
    items: List[CCTaskResponse]
    total: int
    page: int
    size: int
    pages: int


class CCNotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    task_id: Optional[str] = None
    type: str
    title: str
    message: Optional[str] = None
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None
