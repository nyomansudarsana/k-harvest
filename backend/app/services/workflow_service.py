"""
Workflow automation engine for Kopernik Harvest.

Triggered by ERP module events (quotation created, invoice created, etc.)
to automatically generate Command Center tasks and notifications.
"""
import logging
from typing import Optional
from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.command_center import CCTask, CCTaskAssignee, CCActivity, CCNotification, CCStatus
from app.models.workflow import WorkflowRule
from app.models.user import User
from app.services import email_service

logger = logging.getLogger(__name__)

MODULE_LABELS = {
    "quotation":    "Quotation",
    "invoice":      "Invoice",
    "receiving":    "Receiving",
    "stock_opname": "Stock Opname",
}

EVENT_LABELS = {
    "created":     "Created",
    "submitted":   "Submitted",
    "discrepancy": "Stock Discrepancy",
}


def _next_task_id(db: Session) -> str:
    count = db.query(CCTask).count()
    tid = f"CC-{count + 1:05d}"
    while db.query(CCTask).filter(CCTask.task_id == tid).first():
        count += 1
        tid = f"CC-{count + 1:05d}"
    return tid


def trigger_workflow(
    module_name: str,
    event_name: str,
    record_id: str,
    record_number: str,
    triggered_by: User,
    db: Session,
    background_tasks: Optional[BackgroundTasks] = None,
    description: Optional[str] = None,
) -> int:
    """
    Fire all active workflow rules matching (module_name, event_name).
    Returns the number of tasks created.
    """
    rules = db.query(WorkflowRule).filter(
        WorkflowRule.module_name == module_name,
        WorkflowRule.event_name == event_name,
        WorkflowRule.is_active == True,
    ).all()

    if not rules:
        return 0

    # First non-terminal status
    first_status = db.query(CCStatus).filter(
        CCStatus.is_terminal == False,
        CCStatus.deleted_at.is_(None),
    ).order_by(CCStatus.sort_order).first()

    tasks_created = 0

    for rule in rules:
        title = rule.task_title_template.replace("{record_number}", record_number)

        # Resolve target users by role
        assignees = []
        if rule.assign_to_role:
            assignees = db.query(User).filter(
                User.role == rule.assign_to_role,
                User.status == "Active",
                User.deleted_at.is_(None),
            ).all()

        primary = assignees[0] if assignees else None
        task_id = _next_task_id(db)

        task = CCTask(
            task_id=task_id,
            title=title,
            description=description or f"Auto-generated from {MODULE_LABELS.get(module_name, module_name)} {record_number}",
            category_id=rule.category_id,
            priority_id=rule.priority_id,
            status_id=first_status.id if first_status else None,
            assigned_by=triggered_by.id,
            assigned_to=primary.id if primary else None,
            created_by=triggered_by.id,
            related_module=module_name,
            related_record_id=record_id,
            related_record_number=record_number,
        )
        db.add(task)
        db.flush()

        db.add(CCActivity(
            task_id=task_id,
            action="created",
            new_value=f"Auto-generated: {MODULE_LABELS.get(module_name, module_name)} {record_number}",
            created_by=triggered_by.id,
        ))

        for i, user in enumerate(assignees):
            db.add(CCTaskAssignee(
                task_id=task_id,
                user_id=user.id,
                assigned_by=triggered_by.id,
                is_primary=(i == 0),
            ))
            db.add(CCActivity(
                task_id=task_id,
                action="assigned",
                field_name="assigned_to",
                new_value=user.full_name,
                created_by=triggered_by.id,
            ))
            db.add(CCNotification(
                user_id=user.id,
                task_id=task_id,
                type="assignment",
                title=f"New task: {title}",
                message=f"Auto-assigned from {MODULE_LABELS.get(module_name, module_name)} {record_number}",
            ))
            if background_tasks and user.email:
                background_tasks.add_task(
                    email_service.send_task_assignment_email,
                    to_email=user.email,
                    assignee_name=user.full_name,
                    task_id=task_id,
                    task_title=title,
                    assigned_by_name=triggered_by.full_name,
                    notification_type="assignment",
                )

        tasks_created += 1
        logger.info("Workflow created task %s from %s %s", task_id, module_name, record_number)

    db.commit()
    return tasks_created
