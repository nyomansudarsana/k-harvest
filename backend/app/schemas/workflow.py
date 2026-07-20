from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class WorkflowRuleCreate(BaseModel):
    module_name: str
    event_name: str
    task_title_template: str
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    assign_to_role: Optional[str] = None
    is_active: bool = True


class WorkflowRuleUpdate(BaseModel):
    task_title_template: Optional[str] = None
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    assign_to_role: Optional[str] = None
    is_active: Optional[bool] = None


class WorkflowRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_name: str
    event_name: str
    task_title_template: str
    category_id: Optional[int] = None
    priority_id: Optional[int] = None
    assign_to_role: Optional[str] = None
    is_active: bool
    created_at: datetime
    # Enriched at query time
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    priority_name: Optional[str] = None
    priority_color: Optional[str] = None
