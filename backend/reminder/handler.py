"""Scheduler invokes this worker asynchronously. Recheck current state every time."""

from shared.aws import error_code, ledger_table, log_event, tasks_table
from shared.notifications import send_once
from shared.time_utils import parse_timestamp, utc_now


def skip_reason(task, event, now):
    if not task:
        return "task_missing"
    if task["userId"] != event["userId"]:
        return "owner_mismatch"
    if task["status"] == "completed" or task["reminderOption"] == "none":
        return "reminder_disabled"
    if task["reminderRevision"] != event["reminderRevision"] or task.get("reminderAt") != event["reminderAt"]:
        return "stale_schedule"
    if now < parse_timestamp(task["reminderAt"]):
        return "too_early"
    if now >= parse_timestamp(task["dueAt"]):
        return "deadline_passed"
    return None


def lambda_handler(event, context):
    try:
        for key in ("taskId", "userId", "reminderAt"):
            if not isinstance(event.get(key), str) or not event[key]:
                raise ValueError("Invalid Scheduler payload")
        if type(event.get("reminderRevision")) is not int or event["reminderRevision"] < 1:
            raise ValueError("Invalid reminder revision")
        task = tasks_table().get_item(Key={"taskId": event["taskId"]}, ConsistentRead=True).get("Item")
        reason = skip_reason(task, event, utc_now())
        if reason:
            log_event("reminder_skipped", taskId=event["taskId"], reason=reason)
            return {"skipped": reason}
        key = f"reminder#{task['taskId']}#{int(task['reminderRevision'])}"
        sent = send_once(ledger_table(), key, task, "TASK_REMINDER")
        return {"sent": sent}
    except Exception as error:
        log_event("reminder_failed", taskId=event.get("taskId"), errorCode=error_code(error))
        raise
