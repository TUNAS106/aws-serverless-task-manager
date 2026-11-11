"""DynamoDB Streams worker: schedule first, notification ledger second."""

from decimal import Decimal

from shared.aws import error_code, ledger_table, log_event, tasks_table
from shared.notifications import send_once
from shared.schedules import reconcile


def deserialize_image(image):
    # TasksTable has only strings, numbers and nulls; no generic serializer needed.
    result = {}
    for key, attribute in image.items():
        if "S" in attribute:
            result[key] = attribute["S"]
        elif "N" in attribute:
            result[key] = Decimal(attribute["N"])
        elif attribute.get("NULL") is True:
            result[key] = None
        else:
            raise ValueError("Unsupported attribute type in TasksTable")
    return result


def process_record(record):
    data = record["dynamodb"]
    task_id = data["Keys"]["taskId"]["S"]
    event_id = record["eventID"]
    name = record["eventName"]
    if name not in {"INSERT", "MODIFY", "REMOVE"}:
        raise ValueError("Unsupported DynamoDB stream event")
    log_event("event_received", eventID=event_id, taskId=task_id)
    # Always reconcile, including when the email ledger is already DONE.
    reconcile(tasks_table(), task_id)
    if name == "REMOVE":
        return
    new = deserialize_image(data["NewImage"])
    if name == "INSERT":
        action = "TASK_CREATED"
    else:
        old = deserialize_image(data["OldImage"])
        if old["status"] == new["status"]:
            log_event("notification_skipped", taskId=task_id, reason="status_unchanged")
            return
        action = "TASK_STATUS_CHANGED"
    # Email describes this event; schedule reconciliation uses the current DB item.
    send_once(ledger_table(), f"stream#{event_id}#{action}", new, action)


def lambda_handler(event, context):
    records = event["Records"]
    for record in records:
        try:
            process_record(record)
        except Exception as error:
            log_event("stream_failed", eventID=record.get("eventID"), errorCode=error_code(error))
            raise  # Lambda must see failure to retry, not an HTTP-style 500 response.
    return {"processed": len(records)}
