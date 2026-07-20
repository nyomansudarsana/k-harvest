"""
Email notification service for Kopernik Harvest.

Uses Python's built-in smtplib — no extra dependencies.
All functions return bool (True = sent, False = skipped/failed).
Email failures NEVER raise; callers proceed regardless.
"""
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def _is_enabled() -> bool:
    return (
        settings.EMAIL_ENABLED
        and bool(settings.SMTP_HOST)
        and bool(settings.SMTP_USERNAME)
        and bool(settings.SMTP_PASSWORD)
        and bool(settings.SMTP_FROM_EMAIL)
    )


def _send(to_email: str, subject: str, html_body: str) -> bool:
    if not _is_enabled():
        logger.debug("Email disabled — skipping send to %s", to_email)
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        context = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())
        logger.info("Email sent to %s — %s", to_email, subject)
        return True
    except Exception as exc:
        logger.warning("Email to %s failed: %s", to_email, exc)
        return False


def _priority_color(priority_name: Optional[str]) -> str:
    colors = {
        "Critical": "#DC2626",
        "High": "#EA580C",
        "Medium": "#D97706",
        "Low": "#16A34A",
    }
    return colors.get(priority_name or "", "#6B7280")


def _format_date(d: Optional[date]) -> str:
    if not d:
        return "—"
    return d.strftime("%d %B %Y")


def _html_template(
    assignee_name: str,
    task_id: str,
    task_title: str,
    assigned_by_name: str,
    category_name: Optional[str],
    priority_name: Optional[str],
    due_date: Optional[date],
    description: Optional[str],
    task_link: str,
    notification_type: str = "assignment",
) -> str:
    pri_color = _priority_color(priority_name)
    due_str = _format_date(due_date)

    if notification_type == "reassignment":
        headline = "A task has been reassigned to you."
        badge_text = "Reassigned"
        badge_color = "#7C3AED"
    elif notification_type == "due_date_changed":
        headline = "The due date for your task has been updated."
        badge_text = "Due Date Updated"
        badge_color = "#0284C7"
    else:
        headline = "A new task has been assigned to you."
        badge_text = "New Assignment"
        badge_color = "#1a5276"

    desc_block = ""
    if description:
        safe_desc = description.replace("<", "&lt;").replace(">", "&gt;")
        desc_block = f"""
        <p style="color:#475467;font-size:14px;line-height:1.6;margin:16px 0 0 0;
                  padding:12px 16px;background:#f9fafb;border-left:3px solid #d0d5dd;
                  border-radius:0 6px 6px 0;">
          {safe_desc}
        </p>"""

    category_row = ""
    if category_name:
        category_row = f"""
          <tr>
            <td style="padding:7px 0;color:#6B7280;font-size:13px;width:110px;vertical-align:top;">Category</td>
            <td style="padding:7px 0;color:#1e293b;font-size:13px;">{category_name}</td>
          </tr>"""

    priority_row = ""
    if priority_name:
        priority_row = f"""
          <tr>
            <td style="padding:7px 0;color:#6B7280;font-size:13px;width:110px;vertical-align:top;">Priority</td>
            <td style="padding:7px 0;font-size:13px;">
              <span style="color:{pri_color};font-weight:600;">{priority_name}</span>
            </td>
          </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0"
           style="background:#ffffff;border-radius:10px;overflow:hidden;
                  box-shadow:0 2px 12px rgba(0,0,0,0.08);max-width:600px;width:100%;">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#1a5276,#0d3349);padding:28px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;color:#f39c12;font-size:11px;font-weight:700;
                          letter-spacing:2px;text-transform:uppercase;">KOPERNIK HARVEST</p>
                <p style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700;">
                  Command Center
                </p>
              </td>
              <td align="right">
                <span style="background:{badge_color};color:#fff;font-size:11px;font-weight:700;
                             padding:5px 12px;border-radius:20px;letter-spacing:0.5px;">
                  {badge_text}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 6px;color:#6B7280;font-size:13px;">Hello,</p>
          <p style="margin:0 0 20px;color:#111827;font-size:18px;font-weight:700;">{assignee_name}</p>
          <p style="margin:0 0 24px;color:#374151;font-size:14px;">{headline}</p>

          <!-- Task info card -->
          <table width="100%" cellpadding="0" cellspacing="0"
                 style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;
                        padding:16px 20px;margin-bottom:24px;">
            <tr>
              <td>
                <p style="margin:0 0 12px;color:#6B7280;font-size:11px;
                          font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
                  Task Details
                </p>
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:7px 0;color:#6B7280;font-size:13px;width:110px;vertical-align:top;">Task ID</td>
                    <td style="padding:7px 0;color:#1a5276;font-size:13px;font-weight:700;
                               font-family:monospace;">{task_id}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;color:#6B7280;font-size:13px;vertical-align:top;">Task</td>
                    <td style="padding:7px 0;color:#111827;font-size:14px;font-weight:700;">{task_title}</td>
                  </tr>
                  {category_row}
                  {priority_row}
                  <tr>
                    <td style="padding:7px 0;color:#6B7280;font-size:13px;vertical-align:top;">Due Date</td>
                    <td style="padding:7px 0;color:#1e293b;font-size:13px;">{due_str}</td>
                  </tr>
                  <tr>
                    <td style="padding:7px 0;color:#6B7280;font-size:13px;vertical-align:top;">Assigned by</td>
                    <td style="padding:7px 0;color:#1e293b;font-size:13px;">{assigned_by_name}</td>
                  </tr>
                </table>
                {desc_block}
              </td>
            </tr>
          </table>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="border-radius:6px;background:#1a5276;">
                <a href="{task_link}"
                   style="display:inline-block;padding:13px 28px;color:#ffffff;
                          text-decoration:none;font-size:14px;font-weight:700;
                          border-radius:6px;">
                  View Task &rarr;
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;color:#9ca3af;font-size:12px;">
            Or copy this link: <a href="{task_link}" style="color:#1a5276;">{task_link}</a>
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#9ca3af;font-size:11px;">
            This is an automated notification from Kopernik Harvest ERP.
            Please do not reply to this email.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>"""


def send_task_assignment_email(
    to_email: str,
    assignee_name: str,
    task_id: str,
    task_title: str,
    assigned_by_name: str,
    category_name: Optional[str] = None,
    priority_name: Optional[str] = None,
    due_date: Optional[date] = None,
    description: Optional[str] = None,
    notification_type: str = "assignment",
) -> bool:
    """Send a task assignment / reassignment notification email. Returns True if sent."""
    task_link = f"{settings.APP_BASE_URL}/command-center?task={task_id}"

    subjects = {
        "assignment": f"[Kopernik Harvest] New task assigned: {task_id}",
        "reassignment": f"[Kopernik Harvest] Task reassigned to you: {task_id}",
        "due_date_changed": f"[Kopernik Harvest] Due date updated for task: {task_id}",
    }
    subject = subjects.get(notification_type, subjects["assignment"])

    html = _html_template(
        assignee_name=assignee_name,
        task_id=task_id,
        task_title=task_title,
        assigned_by_name=assigned_by_name,
        category_name=category_name,
        priority_name=priority_name,
        due_date=due_date,
        description=description,
        task_link=task_link,
        notification_type=notification_type,
    )
    return _send(to_email, subject, html)
