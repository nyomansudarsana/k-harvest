from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List

from app.database import get_db
from app.core.deps import get_current_user, require_admin
from app.models.workflow import WorkflowRule
from app.models.command_center import CCCategory, CCPriority
from app.models.user import User
from app.schemas.workflow import WorkflowRuleCreate, WorkflowRuleUpdate, WorkflowRuleResponse

router = APIRouter(prefix="/workflow-rules", tags=["Workflow"])

MODULE_OPTIONS = ["quotation", "invoice", "receiving", "stock_opname"]
EVENT_OPTIONS = ["created", "submitted", "discrepancy"]


def _enrich(rule: WorkflowRule, db: Session) -> WorkflowRuleResponse:
    resp = WorkflowRuleResponse.model_validate(rule)
    if rule.category_id:
        cat = db.query(CCCategory).filter(CCCategory.id == rule.category_id).first()
        if cat:
            resp.category_name = cat.name
            resp.category_color = cat.color
    if rule.priority_id:
        pri = db.query(CCPriority).filter(CCPriority.id == rule.priority_id).first()
        if pri:
            resp.priority_name = pri.name
            resp.priority_color = pri.color
    return resp


@router.get("", response_model=List[WorkflowRuleResponse])
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rules = db.query(WorkflowRule).order_by(WorkflowRule.module_name, WorkflowRule.event_name).all()
    return [_enrich(r, db) for r in rules]


@router.post("", response_model=WorkflowRuleResponse, status_code=status.HTTP_201_CREATED)
def create_rule(
    payload: WorkflowRuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if payload.module_name not in MODULE_OPTIONS:
        raise HTTPException(400, f"module_name must be one of: {MODULE_OPTIONS}")
    if payload.event_name not in EVENT_OPTIONS:
        raise HTTPException(400, f"event_name must be one of: {EVENT_OPTIONS}")
    rule = WorkflowRule(**payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _enrich(rule, db)


@router.put("/{rule_id}", response_model=WorkflowRuleResponse)
def update_rule(
    rule_id: int,
    payload: WorkflowRuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.query(WorkflowRule).filter(WorkflowRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Workflow rule not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return _enrich(rule, db)


@router.patch("/{rule_id}/toggle", response_model=WorkflowRuleResponse)
def toggle_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.query(WorkflowRule).filter(WorkflowRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Workflow rule not found")
    rule.is_active = not rule.is_active
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return _enrich(rule, db)


@router.delete("/{rule_id}")
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    rule = db.query(WorkflowRule).filter(WorkflowRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Workflow rule not found")
    db.delete(rule)
    db.commit()
    return {"message": "Rule deleted"}


@router.get("/meta")
def workflow_meta(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Return available modules, events, categories and priorities for the rule editor."""
    cats = db.query(CCCategory).order_by(CCCategory.name).all()
    pris = db.query(CCPriority).order_by(CCPriority.sort_order).all()
    return {
        "modules": [
            {"value": "quotation",    "label": "Quotation"},
            {"value": "invoice",      "label": "Invoice"},
            {"value": "receiving",    "label": "Receiving"},
            {"value": "stock_opname", "label": "Stock Opname"},
        ],
        "events": [
            {"value": "created",     "label": "Record Created"},
            {"value": "submitted",   "label": "Record Submitted"},
            {"value": "discrepancy", "label": "Stock Discrepancy Detected"},
        ],
        "categories": [{"id": c.id, "name": c.name, "color": c.color} for c in cats],
        "priorities":  [{"id": p.id, "name": p.name, "color": p.color} for p in pris],
    }
