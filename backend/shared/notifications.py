"""Plain-text messages go to a topic derived from the trusted task owner."""

import os
import re

from shared import ledger
from shared.aws import error_code, get_client, log_event

PROJECT_TAGS = [
    {"Key": "Project", "Value": "task-manager"},
    {"Key": "Environment", "Value": "demo"},
]


def topic_name(user_id):
    # Cognito sub is a UUID. Also allow harmless IDs used in Console test events.
    if not isinstance(user_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", user_id):
        raise ValueError("Invalid user identifier for SNS topic")
    return f"ptdm-user-{user_id}"


def topic_arn(user_id):
    region = os.environ["AWS_REGION"]
    account = os.environ["ACCOUNT_ID"]
    if not re.fullmatch(r"\d{12}", account):
        raise ValueError("ACCOUNT_ID must be a 12-digit account ID")
    return f"arn:{os.environ.get('AWS_PARTITION', 'aws')}:sns:{region}:{account}:{topic_name(user_id)}"


def publish(task, action):
    message = "\n".join([
        f"Sự kiện: {action}",
        f"Công việc: {task['title']}",
        f"Độ ưu tiên: {task['priority']}",
        f"Trạng thái: {task['status']}",
        f"Deadline (UTC): {task['dueAt']}",
        "Giờ trên ứng dụng được hiển thị theo múi giờ trình duyệt.",
    ])
    # Fixed subject prevents titles/newlines exceeding SNS Subject constraints.
    return get_client("sns").publish(
        TopicArn=topic_arn(task["userId"]),
        Subject=f"Task Manager - {action}", Message=message,
    )


def send_once(table, event_key, task, action):
    owner = ledger.acquire(table, event_key)
    if owner is None:
        log_event("notification_skipped", taskId=task["taskId"], reason="already_done")
        return False
    try:
        publish(task, action)
    except Exception:
        try:
            ledger.release(table, event_key, owner)
        except Exception as release_error:
            log_event("lease_release_failed", taskId=task["taskId"], errorCode=error_code(release_error))
        raise
    # If this fails AFTER publish, leave the lease to expire and propagate failure.
    # A later retry may duplicate an email: SNS and DynamoDB are not one transaction.
    ledger.mark_done(table, event_key, owner)
    log_event("notification_done", taskId=task["taskId"], eventKey=event_key)
    return True
