import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import Optional, List

from app.database import get_db
from app.core.deps import get_current_user
import re
from app.models.command_center import (
    CCTask, CCTaskAssignee, CCCategory, CCPriority, CCStatus, CCLabel,
    CCTaskLabel, CCChecklist, CCAttachment, CCTaskLocation,
    CCReminder, CCComment, CCActivity, CCNotification,
)
from app.models.user import User
from app.models.client import ClientMaster
from app.models.inventory import Inventory
from app.models.receiving import Receiving
from app.models.qc import QC
from app.schemas.command_center import (
    CCTaskCreate, CCTaskUpdate, CCTaskStatusUpdate,
    CCCommentCreate, CCCommentUpdate,
    CCTaskResponse, CCTaskListResponse, CCCategoryResponse,
    CCPriorityResponse, CCStatusResponse, CCLabelResponse, CCLabelCreate,
    CCChecklistCreate, CCAttachmentCreate, CCLocationCreate, CCReminderCreate,
    CCNotificationResponse,
)
from app.services import email_service

router = APIRouter(prefix="/command-center", tags=["Command Center"])

UPLOAD_DIR = "uploads/cc_attachments"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_name(db: Session, user_id: Optional[int]) -> Optional[str]:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == user_id).first()
    return u.full_name if u else None


def _build_task_response(task: CCTask, db: Session, include_detail: bool = False) -> CCTaskResponse:
    data = {
        "id": task.id,
        "task_id": task.task_id,
        "title": task.title,
        "description": task.description,
        "category_id": task.category_id,
        "priority_id": task.priority_id,
        "status_id": task.status_id,
        "assigned_by": task.assigned_by,
        "assigned_to": task.assigned_to,
        "created_by": task.created_by,
        "start_date": getattr(task, "start_date", None),
        "due_date": task.due_date,
        "completed_at": task.completed_at,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
        "related_module": getattr(task, "related_module", None),
        "related_record_id": getattr(task, "related_record_id", None),
        "related_record_number": getattr(task, "related_record_number", None),
        "client_id": getattr(task, "client_id", None),
        "client_name": None,
        "client_company": None,
        "related_inventory_id": getattr(task, "related_inventory_id", None),
        "related_batch_id": getattr(task, "related_batch_id", None),
        "related_receiving_id": getattr(task, "related_receiving_id", None),
        "inventory_info": None,
        "comment_count": 0,
        "attachment_count": 0,
        "checklist_total": 0,
        "checklist_done": 0,
        "assignees": [],
        "labels": [],
        "checklists": [],
        "attachments": [],
        "location": None,
        "reminders": [],
        "comments": [],
        "activities": [],
    }

    # Assignees (always included — needed for task card display)
    assignee_rows = db.query(CCTaskAssignee).filter(
        CCTaskAssignee.task_id == task.task_id,
        CCTaskAssignee.deleted_at.is_(None),
    ).order_by(CCTaskAssignee.is_primary.desc(), CCTaskAssignee.assigned_at).all()
    data["assignees"] = []
    for ar in assignee_rows:
        u = db.query(User).filter(User.id == ar.user_id).first()
        data["assignees"].append({
            "id": ar.id,
            "user_id": ar.user_id,
            "task_id": ar.task_id,
            "assigned_by": ar.assigned_by,
            "assigned_at": ar.assigned_at.isoformat() if ar.assigned_at else None,
            "is_primary": ar.is_primary,
            "user_full_name": u.full_name if u else None,
            "user_username": u.username if u else None,
        })

    # Client enrichment
    client_id_val = getattr(task, "client_id", None)
    if client_id_val:
        client = db.query(ClientMaster).filter(
            ClientMaster.client_id == client_id_val,
            ClientMaster.deleted_at.is_(None),
        ).first()
        if client:
            data["client_name"] = client.client_name
            data["client_company"] = client.company_name

    # Inventory enrichment
    inv_id_val = getattr(task, "related_inventory_id", None)
    if inv_id_val:
        inv = db.query(Inventory).filter(
            Inventory.inventory_id == inv_id_val,
            Inventory.deleted_at.is_(None),
        ).first()
        if inv:
            data["inventory_info"] = {
                "inventory_id": inv.inventory_id,
                "commodity_id": inv.commodity_id,
                "product_name": inv.product_name,
                "batch_id": inv.batch_id,
                "available_qty": inv.available_qty,
            }

    if task.category_id:
        cat = db.query(CCCategory).filter(CCCategory.id == task.category_id).first()
        if cat:
            data["category_name"] = cat.name
            data["category_color"] = cat.color
            data["category_icon"] = cat.icon

    if task.priority_id:
        pri = db.query(CCPriority).filter(CCPriority.id == task.priority_id).first()
        if pri:
            data["priority_name"] = pri.name
            data["priority_color"] = pri.color

    if task.status_id:
        st = db.query(CCStatus).filter(CCStatus.id == task.status_id).first()
        if st:
            data["status_name"] = st.name
            data["status_color"] = st.color
            data["is_terminal"] = st.is_terminal

    data["assigned_by_name"] = _get_user_name(db, task.assigned_by)
    data["assigned_to_name"] = _get_user_name(db, task.assigned_to)
    data["created_by_name"] = _get_user_name(db, task.created_by)

    data["comment_count"] = db.query(CCComment).filter(
        CCComment.task_id == task.task_id,
        CCComment.deleted_at.is_(None)
    ).count()

    data["attachment_count"] = db.query(CCAttachment).filter(
        CCAttachment.task_id == task.task_id,
        CCAttachment.deleted_at.is_(None)
    ).count()

    checklist_items = db.query(CCChecklist).filter(
        CCChecklist.task_id == task.task_id,
        CCChecklist.deleted_at.is_(None)
    ).order_by(CCChecklist.sort_order, CCChecklist.id).all()
    data["checklist_total"] = len(checklist_items)
    data["checklist_done"] = sum(1 for c in checklist_items if c.is_done)

    # Labels always included (needed for board card display)
    task_labels = db.query(CCTaskLabel).filter(CCTaskLabel.task_id == task.task_id).all()
    labels = []
    for tl in task_labels:
        lbl = db.query(CCLabel).filter(CCLabel.id == tl.label_id, CCLabel.deleted_at.is_(None)).first()
        if lbl:
            labels.append({"id": lbl.id, "name": lbl.name, "color": lbl.color, "icon": lbl.icon})
    data["labels"] = labels

    if include_detail:
        data["checklists"] = [
            {
                "id": c.id,
                "title": c.title,
                "is_done": c.is_done,
                "done_at": c.done_at.isoformat() if c.done_at else None,
                "done_by": _get_user_name(db, c.done_by),
                "sort_order": c.sort_order,
            }
            for c in checklist_items
        ]

        attachments = db.query(CCAttachment).filter(
            CCAttachment.task_id == task.task_id,
            CCAttachment.deleted_at.is_(None)
        ).order_by(CCAttachment.uploaded_at.asc()).all()
        data["attachments"] = [
            {
                "id": a.id,
                "file_name": a.file_name,
                "file_type": a.file_type,
                "file_size": a.file_size,
                "storage_path": a.storage_path,
                "external_url": a.external_url,
                "source_type": a.source_type,
                "uploaded_by": _get_user_name(db, a.uploaded_by),
                "uploaded_at": a.uploaded_at.isoformat(),
            }
            for a in attachments
        ]

        loc = db.query(CCTaskLocation).filter(CCTaskLocation.task_id == task.task_id).first()
        if loc:
            data["location"] = {
                "id": loc.id,
                "name": loc.name,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "maps_url": loc.maps_url,
            }

        reminders = db.query(CCReminder).filter(
            CCReminder.task_id == task.task_id,
            CCReminder.deleted_at.is_(None)
        ).order_by(CCReminder.remind_at.asc()).all()
        data["reminders"] = [
            {
                "id": r.id,
                "remind_at": r.remind_at.isoformat(),
                "remind_type": r.remind_type,
                "is_sent": r.is_sent,
            }
            for r in reminders
        ]

        comments = db.query(CCComment).filter(
            CCComment.task_id == task.task_id,
            CCComment.deleted_at.is_(None)
        ).order_by(CCComment.created_at.asc()).all()
        data["comments"] = [
            {
                "id": c.id,
                "task_id": c.task_id,
                "parent_id": getattr(c, "parent_id", None),
                "user_id": c.user_id,
                "comment": c.comment,
                "edited_at": c.edited_at.isoformat() if getattr(c, "edited_at", None) else None,
                "created_at": c.created_at.isoformat(),
                "user_name": _get_user_name(db, c.user_id) or "Unknown",
            }
            for c in comments
        ]

        acts = db.query(CCActivity).filter(
            CCActivity.task_id == task.task_id
        ).order_by(CCActivity.created_at.asc()).all()
        data["activities"] = [
            {
                "id": a.id,
                "action": a.action,
                "field_name": a.field_name,
                "old_value": a.old_value,
                "new_value": a.new_value,
                "created_by": a.created_by,
                "created_at": a.created_at.isoformat(),
                "created_by_name": _get_user_name(db, a.created_by) or "System",
            }
            for a in acts
        ]

    return CCTaskResponse(**data)


def _log(db: Session, task_id: str, action: str, user_id: int,
         field_name: str = None, old_value: str = None, new_value: str = None):
    db.add(CCActivity(
        task_id=task_id,
        action=action,
        field_name=field_name,
        old_value=old_value,
        new_value=new_value,
        created_by=user_id,
    ))


# ── Lookup Endpoints ──────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[CCCategoryResponse])
def list_categories(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(CCCategory).filter(CCCategory.deleted_at.is_(None)).order_by(CCCategory.sort_order).all()


@router.get("/priorities", response_model=List[CCPriorityResponse])
def list_priorities(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(CCPriority).order_by(CCPriority.sort_order).all()


@router.get("/statuses", response_model=List[CCStatusResponse])
def list_statuses(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(CCStatus).filter(CCStatus.deleted_at.is_(None)).order_by(CCStatus.sort_order).all()


@router.get("/users", response_model=List[dict])
def list_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).all()
    return [{"id": u.id, "full_name": u.full_name, "username": u.username, "role": u.role} for u in users]


# ── Label Endpoints ───────────────────────────────────────────────────────────

@router.get("/labels", response_model=List[CCLabelResponse])
def list_labels(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(CCLabel).filter(CCLabel.deleted_at.is_(None)).order_by(CCLabel.name).all()


@router.post("/labels", response_model=CCLabelResponse, status_code=201)
def create_label(
    payload: CCLabelCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    label = CCLabel(name=payload.name, color=payload.color, icon=payload.icon, created_by=current_user.id)
    db.add(label)
    db.commit()
    db.refresh(label)
    return label


@router.delete("/labels/{label_id}")
def delete_label(
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    label = db.query(CCLabel).filter(CCLabel.id == label_id, CCLabel.deleted_at.is_(None)).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    label.deleted_at = datetime.utcnow()
    db.commit()
    return {"message": "Label deleted"}


# ── Task Endpoints ────────────────────────────────────────────────────────────

@router.get("/inventory/search")
def search_inventory(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search inventory records for task inventory reference picker. Returns grade from QC."""
    query = db.query(Inventory).filter(Inventory.deleted_at.is_(None), Inventory.available_qty > 0)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            Inventory.product_name.ilike(like) |
            Inventory.batch_id.ilike(like) |
            Inventory.commodity_id.ilike(like) |
            Inventory.inventory_id.ilike(like)
        )
    items = query.order_by(Inventory.product_name).limit(100).all()
    result = []
    for inv in items:
        qc_rec = (
            db.query(QC)
            .filter(QC.batch_id == inv.batch_id, QC.deleted_at.is_(None), QC.qc_status == "Passed")
            .order_by(QC.id.desc())
            .first()
        )
        result.append({
            "inventory_id": inv.inventory_id,
            "commodity_id": inv.commodity_id,
            "product_name": inv.product_name,
            "batch_id": inv.batch_id,
            "available_qty": inv.available_qty,
            "quality_grade": qc_rec.quality_grade if qc_rec else None,
            "product_grade": qc_rec.product_grade if qc_rec else None,
        })
    return result


@router.get("/tasks", response_model=CCTaskListResponse)
def list_tasks(
    page: int = 1,
    size: int = 200,
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    priority_id: Optional[int] = None,
    status_id: Optional[int] = None,
    assigned_to: Optional[int] = None,
    client_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(CCTask).filter(CCTask.deleted_at.is_(None))
    if search:
        q = q.filter(CCTask.title.ilike(f"%{search}%"))
    if category_id:
        q = q.filter(CCTask.category_id == category_id)
    if priority_id:
        q = q.filter(CCTask.priority_id == priority_id)
    if status_id:
        q = q.filter(CCTask.status_id == status_id)
    if assigned_to:
        q = q.filter(CCTask.assigned_to == assigned_to)
    if client_id:
        q = q.filter(getattr(CCTask, "client_id", None) == client_id)

    total = q.count()
    tasks = q.order_by(CCTask.created_at.desc()).offset((page - 1) * size).limit(size).all()
    pages = (total + size - 1) // size if total > 0 else 1

    return CCTaskListResponse(
        items=[_build_task_response(t, db) for t in tasks],
        total=total, page=page, size=size, pages=pages,
    )


@router.post("/tasks", response_model=CCTaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: CCTaskCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(CCTask).count()
    task_id = f"CC-{str(count + 1).zfill(5)}"

    resolved_status_id = payload.status_id
    if not resolved_status_id:
        first_status = db.query(CCStatus).filter(
            CCStatus.deleted_at.is_(None), CCStatus.is_terminal == False,
        ).order_by(CCStatus.sort_order).first()
        if first_status:
            resolved_status_id = first_status.id

    task = CCTask(
        task_id=task_id,
        title=payload.title,
        description=payload.description,
        category_id=payload.category_id,
        priority_id=payload.priority_id,
        status_id=resolved_status_id,
        assigned_by=current_user.id,
        assigned_to=payload.assigned_to,
        created_by=current_user.id,
        start_date=payload.start_date,
        due_date=payload.due_date,
        client_id=payload.client_id,
        related_inventory_id=payload.related_inventory_id,
        related_batch_id=payload.related_batch_id,
        related_receiving_id=payload.related_receiving_id,
    )
    db.add(task)
    db.flush()

    _log(db, task_id, "created", current_user.id)

    cat = db.query(CCCategory).filter(CCCategory.id == payload.category_id).first() if payload.category_id else None
    pri = db.query(CCPriority).filter(CCPriority.id == payload.priority_id).first() if payload.priority_id else None

    # Build full assignee set: primary (assigned_to) + additional (assignee_ids), deduped
    all_assignee_ids = []
    if payload.assigned_to:
        all_assignee_ids.append(payload.assigned_to)
    for uid in payload.assignee_ids:
        if uid not in all_assignee_ids:
            all_assignee_ids.append(uid)

    email_jobs = []
    for i, uid in enumerate(all_assignee_ids):
        is_primary = (i == 0)
        name = _get_user_name(db, uid) or str(uid)
        _log(db, task_id, "assigned", current_user.id, "assigned_to", None, name)
        db.add(CCTaskAssignee(
            task_id=task_id, user_id=uid,
            assigned_by=current_user.id, is_primary=is_primary,
        ))
        if uid != current_user.id:
            assignee = db.query(User).filter(User.id == uid).first()
            if assignee:
                db.add(CCNotification(
                    user_id=assignee.id, task_id=task_id, type="assignment",
                    title=f"New task assigned: {task_id}",
                    message=f"{current_user.full_name} assigned you: {payload.title}",
                ))
                if assignee.email:
                    email_jobs.append(dict(
                        to_email=assignee.email,
                        assignee_name=assignee.full_name,
                        task_id=task_id,
                        task_title=payload.title,
                        assigned_by_name=current_user.full_name,
                        category_name=cat.name if cat else None,
                        priority_name=pri.name if pri else None,
                        due_date=payload.due_date,
                        description=payload.description,
                        notification_type="assignment",
                    ))

    db.commit()
    db.refresh(task)

    for job in email_jobs:
        background_tasks.add_task(email_service.send_task_assignment_email, **job)

    return _build_task_response(task, db, include_detail=True)


@router.get("/tasks/{task_id}", response_model=CCTaskResponse)
def get_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return _build_task_response(task, db, include_detail=True)


@router.put("/tasks/{task_id}", response_model=CCTaskResponse)
def update_task(
    task_id: str,
    payload: CCTaskUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    old_status_id = task.status_id
    old_assigned = task.assigned_to
    old_due_date = task.due_date

    upd = payload.model_dump(exclude_none=True)
    new_assignee_ids = upd.pop("assignee_ids", None)  # Handle separately

    # Only set mapped column fields
    _SKIP = {"assignee_ids"}
    for field, value in upd.items():
        if field not in _SKIP:
            setattr(task, field, value)

    # Replace assignees when explicitly provided
    if new_assignee_ids is not None:
        db.query(CCTaskAssignee).filter(
            CCTaskAssignee.task_id == task_id,
            CCTaskAssignee.deleted_at.is_(None),
        ).update({"deleted_at": datetime.utcnow()})
        all_ids = []
        if task.assigned_to:
            all_ids.append(task.assigned_to)
        for uid in new_assignee_ids:
            if uid not in all_ids:
                all_ids.append(uid)
        for i, uid in enumerate(all_ids):
            db.add(CCTaskAssignee(
                task_id=task_id, user_id=uid,
                assigned_by=current_user.id, is_primary=(i == 0),
            ))

    if payload.status_id and payload.status_id != old_status_id:
        old_st = db.query(CCStatus).filter(CCStatus.id == old_status_id).first()
        new_st = db.query(CCStatus).filter(CCStatus.id == payload.status_id).first()
        _log(db, task_id, "status_changed", current_user.id, "status",
             old_st.name if old_st else None, new_st.name if new_st else None)
        task.completed_at = datetime.utcnow() if (new_st and new_st.is_terminal) else None

    email_jobs = []

    if payload.assigned_to is not None and payload.assigned_to != old_assigned:
        name = _get_user_name(db, payload.assigned_to) or str(payload.assigned_to)
        _log(db, task_id, "assigned", current_user.id, "assigned_to", None, name)

        # Notify the new assignee (not the person making the change)
        if payload.assigned_to != current_user.id:
            assignee = db.query(User).filter(User.id == payload.assigned_to).first()
            if assignee:
                cat = db.query(CCCategory).filter(CCCategory.id == task.category_id).first() if task.category_id else None
                pri = db.query(CCPriority).filter(CCPriority.id == task.priority_id).first() if task.priority_id else None
                db.add(CCNotification(
                    user_id=assignee.id,
                    task_id=task_id,
                    type="reassignment",
                    title=f"Task reassigned to you: {task_id}",
                    message=f"{current_user.full_name} reassigned you: {task.title}",
                ))
                if assignee.email:
                    email_jobs.append(dict(
                        to_email=assignee.email,
                        assignee_name=assignee.full_name,
                        task_id=task_id,
                        task_title=task.title,
                        assigned_by_name=current_user.full_name,
                        category_name=cat.name if cat else None,
                        priority_name=pri.name if pri else None,
                        due_date=task.due_date,
                        notification_type="reassignment",
                    ))

    # Notify current assignee when due date changes
    if (payload.due_date is not None and payload.due_date != old_due_date
            and task.assigned_to and task.assigned_to != current_user.id):
        assignee = db.query(User).filter(User.id == task.assigned_to).first()
        if assignee:
            db.add(CCNotification(
                user_id=assignee.id,
                task_id=task_id,
                type="due_date_changed",
                title=f"Due date updated: {task_id}",
                message=f"Due date changed to {payload.due_date} for: {task.title}",
            ))
            if assignee.email:
                cat = db.query(CCCategory).filter(CCCategory.id == task.category_id).first() if task.category_id else None
                pri = db.query(CCPriority).filter(CCPriority.id == task.priority_id).first() if task.priority_id else None
                email_jobs.append(dict(
                    to_email=assignee.email,
                    assignee_name=assignee.full_name,
                    task_id=task_id,
                    task_title=task.title,
                    assigned_by_name=current_user.full_name,
                    category_name=cat.name if cat else None,
                    priority_name=pri.name if pri else None,
                    due_date=payload.due_date,
                    notification_type="due_date_changed",
                ))

    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)

    for job in email_jobs:
        background_tasks.add_task(email_service.send_task_assignment_email, **job)

    return _build_task_response(task, db, include_detail=True)


@router.patch("/tasks/{task_id}/status", response_model=CCTaskResponse)
def update_task_status(
    task_id: str,
    payload: CCTaskStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    old_st = db.query(CCStatus).filter(CCStatus.id == task.status_id).first()
    new_st = db.query(CCStatus).filter(CCStatus.id == payload.status_id).first()
    if not new_st:
        raise HTTPException(status_code=400, detail="Invalid status")

    _log(db, task_id, "status_changed", current_user.id, "status",
         old_st.name if old_st else None, new_st.name)
    task.status_id = payload.status_id
    task.completed_at = datetime.utcnow() if new_st.is_terminal else None
    task.updated_at = datetime.utcnow()

    # Notify all assignees of the status change
    assignees_to_notify = db.query(CCTaskAssignee).filter(
        CCTaskAssignee.task_id == task_id,
        CCTaskAssignee.deleted_at.is_(None),
    ).all()
    notif_msg = f"{current_user.full_name} changed status to: {new_st.name}"
    for ar in assignees_to_notify:
        if ar.user_id != current_user.id:
            notif_type = "task_completed" if new_st.is_terminal else "status_changed"
            db.add(CCNotification(
                user_id=ar.user_id,
                task_id=task_id,
                type=notif_type,
                title=f"Task {notif_type.replace('_', ' ')}: {task_id}",
                message=notif_msg,
            ))

    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/tasks/{task_id}")
def delete_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.deleted_at = datetime.utcnow()
    _log(db, task_id, "deleted", current_user.id)
    db.commit()
    return {"message": "Task deleted"}


# ── Task Assignee Endpoints ───────────────────────────────────────────────────

@router.post("/tasks/{task_id}/assignees/{user_id}", response_model=CCTaskResponse)
def add_assignee(
    task_id: str,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    exists = db.query(CCTaskAssignee).filter(
        CCTaskAssignee.task_id == task_id,
        CCTaskAssignee.user_id == user_id,
        CCTaskAssignee.deleted_at.is_(None),
    ).first()
    if not exists:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        is_first = db.query(CCTaskAssignee).filter(
            CCTaskAssignee.task_id == task_id, CCTaskAssignee.deleted_at.is_(None),
        ).count() == 0
        db.add(CCTaskAssignee(task_id=task_id, user_id=user_id, assigned_by=current_user.id, is_primary=is_first))
        _log(db, task_id, "assigned", current_user.id, "assigned_to", None, user.full_name)
        if user.id != current_user.id:
            db.add(CCNotification(
                user_id=user.id, task_id=task_id, type="assignment",
                title=f"Added as assignee: {task_id}",
                message=f"{current_user.full_name} added you to: {task.title}",
            ))
        if is_first:
            task.assigned_to = user_id
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/tasks/{task_id}/assignees/{user_id}", response_model=CCTaskResponse)
def remove_assignee(
    task_id: str,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    row = db.query(CCTaskAssignee).filter(
        CCTaskAssignee.task_id == task_id,
        CCTaskAssignee.user_id == user_id,
        CCTaskAssignee.deleted_at.is_(None),
    ).first()
    if row:
        row.deleted_at = datetime.utcnow()
        # If primary removed, promote next
        if row.is_primary:
            next_a = db.query(CCTaskAssignee).filter(
                CCTaskAssignee.task_id == task_id,
                CCTaskAssignee.user_id != user_id,
                CCTaskAssignee.deleted_at.is_(None),
            ).order_by(CCTaskAssignee.assigned_at).first()
            if next_a:
                next_a.is_primary = True
                task.assigned_to = next_a.user_id
            else:
                task.assigned_to = None
        task.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Task Label Endpoints ──────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/labels/{label_id}", response_model=CCTaskResponse)
def attach_label(
    task_id: str,
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    label = db.query(CCLabel).filter(CCLabel.id == label_id, CCLabel.deleted_at.is_(None)).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    existing = db.query(CCTaskLabel).filter(
        CCTaskLabel.task_id == task_id, CCTaskLabel.label_id == label_id
    ).first()
    if not existing:
        db.add(CCTaskLabel(task_id=task_id, label_id=label_id))
        _log(db, task_id, "label_added", current_user.id, "labels", None, label.name)
        task.updated_at = datetime.utcnow()
        db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/tasks/{task_id}/labels/{label_id}", response_model=CCTaskResponse)
def remove_label(
    task_id: str,
    label_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    tl = db.query(CCTaskLabel).filter(
        CCTaskLabel.task_id == task_id, CCTaskLabel.label_id == label_id
    ).first()
    if tl:
        label = db.query(CCLabel).filter(CCLabel.id == label_id).first()
        db.delete(tl)
        _log(db, task_id, "label_removed", current_user.id, "labels", label.name if label else None, None)
        task.updated_at = datetime.utcnow()
        db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Checklist Endpoints ───────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/checklists", response_model=CCTaskResponse)
def add_checklist(
    task_id: str,
    payload: CCChecklistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    max_order = db.query(CCChecklist).filter(
        CCChecklist.task_id == task_id, CCChecklist.deleted_at.is_(None)
    ).count()
    db.add(CCChecklist(task_id=task_id, title=payload.title, sort_order=max_order))
    _log(db, task_id, "checklist_added", current_user.id, "checklist", None, payload.title)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.patch("/checklists/{item_id}/toggle", response_model=CCTaskResponse)
def toggle_checklist(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CCChecklist).filter(CCChecklist.id == item_id, CCChecklist.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.is_done = not item.is_done
    item.done_at = datetime.utcnow() if item.is_done else None
    item.done_by = current_user.id if item.is_done else None
    action = "checklist_completed" if item.is_done else "checklist_unchecked"
    _log(db, item.task_id, action, current_user.id, "checklist", item.title, None)
    task = db.query(CCTask).filter(CCTask.task_id == item.task_id).first()
    if task:
        task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/checklists/{item_id}", response_model=CCTaskResponse)
def delete_checklist(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = db.query(CCChecklist).filter(CCChecklist.id == item_id, CCChecklist.deleted_at.is_(None)).first()
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    item.deleted_at = datetime.utcnow()
    task = db.query(CCTask).filter(CCTask.task_id == item.task_id).first()
    if task:
        task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Attachment Endpoints ──────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/attachments", response_model=CCTaskResponse)
def add_attachment_link(
    task_id: str,
    payload: CCAttachmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.add(CCAttachment(
        task_id=task_id,
        file_name=payload.file_name,
        external_url=payload.external_url,
        source_type=payload.source_type,
        uploaded_by=current_user.id,
    ))
    _log(db, task_id, "attachment_added", current_user.id, "attachment", None, payload.file_name)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.post("/tasks/{task_id}/attachments/upload", response_model=CCTaskResponse)
async def upload_attachment(
    task_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    safe_name = f"{uuid.uuid4()}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    ext = os.path.splitext(file.filename)[1].lower()
    db.add(CCAttachment(
        task_id=task_id,
        file_name=file.filename,
        file_type=ext,
        file_size=len(contents),
        storage_path=file_path,
        source_type="local",
        uploaded_by=current_user.id,
    ))
    _log(db, task_id, "attachment_uploaded", current_user.id, "attachment", None, file.filename)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/attachments/{attachment_id}", response_model=CCTaskResponse)
def delete_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    att = db.query(CCAttachment).filter(CCAttachment.id == attachment_id, CCAttachment.deleted_at.is_(None)).first()
    if not att:
        raise HTTPException(status_code=404, detail="Attachment not found")
    att.deleted_at = datetime.utcnow()
    task = db.query(CCTask).filter(CCTask.task_id == att.task_id).first()
    if task:
        task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Location Endpoints ────────────────────────────────────────────────────────

@router.put("/tasks/{task_id}/location", response_model=CCTaskResponse)
def set_location(
    task_id: str,
    payload: CCLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    loc = db.query(CCTaskLocation).filter(CCTaskLocation.task_id == task_id).first()
    if loc:
        loc.name = payload.name
        loc.latitude = payload.latitude
        loc.longitude = payload.longitude
        loc.maps_url = payload.maps_url
        loc.updated_at = datetime.utcnow()
    else:
        db.add(CCTaskLocation(
            task_id=task_id, name=payload.name,
            latitude=payload.latitude, longitude=payload.longitude,
            maps_url=payload.maps_url,
        ))
    _log(db, task_id, "location_set", current_user.id, "location", None, payload.name or "Updated")
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/tasks/{task_id}/location", response_model=CCTaskResponse)
def delete_location(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    loc = db.query(CCTaskLocation).filter(CCTaskLocation.task_id == task_id).first()
    if loc:
        db.delete(loc)
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Reminder Endpoints ────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/reminders", response_model=CCTaskResponse)
def add_reminder(
    task_id: str,
    payload: CCReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.add(CCReminder(
        task_id=task_id, remind_at=payload.remind_at,
        remind_type=payload.remind_type, user_id=current_user.id,
    ))
    _log(db, task_id, "reminder_set", current_user.id, "reminder", None, payload.remind_at.isoformat())
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/reminders/{reminder_id}", response_model=CCTaskResponse)
def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rem = db.query(CCReminder).filter(CCReminder.id == reminder_id, CCReminder.deleted_at.is_(None)).first()
    if not rem:
        raise HTTPException(status_code=404, detail="Reminder not found")
    task_id = rem.task_id
    rem.deleted_at = datetime.utcnow()
    task = db.query(CCTask).filter(CCTask.task_id == task_id).first()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Comment Endpoints ─────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/comments", response_model=CCTaskResponse)
def add_comment(
    task_id: str,
    payload: CCCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    comment = CCComment(task_id=task_id, user_id=current_user.id, comment=payload.comment)
    if payload.parent_id:
        comment.parent_id = payload.parent_id
    db.add(comment)
    _log(db, task_id, "commented", current_user.id)

    # Parse @mentions and notify mentioned users
    mentions = re.findall(r"@(\w+)", payload.comment)
    for username in set(mentions):
        mentioned = db.query(User).filter(
            User.username == username,
            User.deleted_at.is_(None),
        ).first()
        if mentioned and mentioned.id != current_user.id:
            db.add(CCNotification(
                user_id=mentioned.id,
                task_id=task_id,
                type="mention",
                title=f"You were mentioned in {task_id}",
                message=f"{current_user.full_name}: {payload.comment[:200]}",
            ))

    task.updated_at = datetime.utcnow()
    db.commit()
    return _build_task_response(task, db, include_detail=True)


@router.put("/comments/{comment_id}", response_model=CCTaskResponse)
def edit_comment(
    comment_id: int,
    payload: CCCommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = db.query(CCComment).filter(
        CCComment.id == comment_id,
        CCComment.user_id == current_user.id,
        CCComment.deleted_at.is_(None),
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found or unauthorized")
    comment.comment = payload.comment
    comment.edited_at = datetime.utcnow()
    task = db.query(CCTask).filter(CCTask.task_id == comment.task_id).first()
    if task:
        task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


@router.delete("/comments/{comment_id}", response_model=CCTaskResponse)
def delete_comment(
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    comment = db.query(CCComment).filter(
        CCComment.id == comment_id, CCComment.deleted_at.is_(None),
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.deleted_at = datetime.utcnow()
    task = db.query(CCTask).filter(CCTask.task_id == comment.task_id).first()
    if task:
        task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return _build_task_response(task, db, include_detail=True)


# ── Dashboard Endpoint ────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    total_open = db.query(CCTask).join(
        CCStatus, CCTask.status_id == CCStatus.id
    ).filter(CCTask.deleted_at.is_(None), CCStatus.is_terminal == False).count()

    overdue = db.query(CCTask).join(
        CCStatus, CCTask.status_id == CCStatus.id
    ).filter(
        CCTask.deleted_at.is_(None), CCStatus.is_terminal == False,
        CCTask.due_date < today, CCTask.due_date.isnot(None)
    ).count()

    critical = db.query(CCTask).join(
        CCPriority, CCTask.priority_id == CCPriority.id
    ).join(
        CCStatus, CCTask.status_id == CCStatus.id
    ).filter(
        CCTask.deleted_at.is_(None), CCStatus.is_terminal == False,
        CCPriority.name == "Critical"
    ).count()

    my_tasks = db.query(CCTask).join(
        CCStatus, CCTask.status_id == CCStatus.id
    ).filter(
        CCTask.deleted_at.is_(None), CCStatus.is_terminal == False,
        CCTask.assigned_to == current_user.id
    ).count()

    return {"total_open": total_open, "overdue": overdue, "critical": critical, "my_tasks": my_tasks}


@router.post("/tasks/{task_id}/duplicate", response_model=CCTaskResponse)
def duplicate_task(
    task_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Duplicate a task — copies core fields, strips dates, prefixes title."""
    task = db.query(CCTask).filter(CCTask.task_id == task_id, CCTask.deleted_at.is_(None)).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Generate new task_id
    count = db.query(CCTask).count()
    new_task_id = f"CC-{count + 1:05d}"
    while db.query(CCTask).filter(CCTask.task_id == new_task_id).first():
        count += 1
        new_task_id = f"CC-{count + 1:05d}"

    # Pick first non-terminal status as default
    first_status = db.query(CCStatus).filter(CCStatus.is_terminal == False).order_by(CCStatus.sort_order, CCStatus.id).first()

    new_task = CCTask(
        task_id=new_task_id,
        title=f"Copy of {task.title}",
        description=task.description,
        category_id=task.category_id,
        priority_id=task.priority_id,
        status_id=first_status.id if first_status else task.status_id,
        assigned_by=current_user.id,
        assigned_to=task.assigned_to,
        created_by=current_user.id,
        start_date=None,
        due_date=None,
    )
    db.add(new_task)
    db.flush()

    # Copy labels
    for tl in db.query(CCTaskLabel).filter(CCTaskLabel.task_id == task_id).all():
        db.add(CCTaskLabel(task_id=new_task_id, label_id=tl.label_id))

    # Copy checklist items
    for cl in db.query(CCChecklist).filter(CCChecklist.task_id == task_id, CCChecklist.deleted_at.is_(None)).all():
        db.add(CCChecklist(task_id=new_task_id, title=cl.title, sort_order=cl.sort_order))

    # Activity log
    db.add(CCActivity(
        task_id=new_task_id,
        action="created",
        new_value=f"Duplicated from {task_id}",
        created_by=current_user.id,
    ))
    db.commit()

    return _build_task_response(new_task, db, include_detail=False)


# ── Notification Endpoints ─────────────────────────────────────────────────────

@router.get("/notifications", response_model=List[CCNotificationResponse])
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(CCNotification)
        .filter(CCNotification.user_id == current_user.id)
        .order_by(CCNotification.is_read.asc(), CCNotification.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/notifications/unread-count")
def unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(CCNotification).filter(
        CCNotification.user_id == current_user.id,
        CCNotification.is_read == False,
    ).count()
    return {"count": count}


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notif = db.query(CCNotification).filter(
        CCNotification.id == notification_id,
        CCNotification.user_id == current_user.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    notif.read_at = datetime.utcnow()
    db.commit()
    return {"message": "Marked as read"}


@router.patch("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    db.query(CCNotification).filter(
        CCNotification.user_id == current_user.id,
        CCNotification.is_read == False,
    ).update({"is_read": True, "read_at": datetime.utcnow()})
    db.commit()
    return {"message": "All notifications marked as read"}
