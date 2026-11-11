"""Reconcile one deterministic schedule from the current task, not stream images."""

import json
import os

from botocore.exceptions import ClientError

from shared.aws import error_code, get_client, log_event
from shared.time_utils import parse_timestamp, utc_now


def schedule_parameters(task):
    payload = {key: task[key] for key in ("taskId", "userId", "reminderAt", "reminderRevision")}
    payload["reminderRevision"] = int(payload["reminderRevision"])
    return {
        "Name": f"task-{task['taskId']}", "GroupName": os.environ["SCHEDULE_GROUP"],
        "ScheduleExpression": f"at({task['reminderAt'].removesuffix('Z')})",
        "ScheduleExpressionTimezone": "UTC", "State": "ENABLED",
        "FlexibleTimeWindow": {"Mode": "OFF"}, "ActionAfterCompletion": "DELETE",
        "Target": {
            "Arn": os.environ["REMINDER_FUNCTION_ARN"],
            "RoleArn": os.environ["SCHEDULER_ROLE_ARN"],
            "Input": json.dumps(payload),
            "RetryPolicy": {"MaximumRetryAttempts": 2, "MaximumEventAgeInSeconds": 3600},
        },
    }


def needs_schedule(task, now):
    return bool(task and task["status"] != "completed" and task["reminderOption"] != "none"
                and task.get("reminderAt") and parse_timestamp(task["reminderAt"]) > now)


def reconcile(table, task_id):
    scheduler = get_client("scheduler")
    identity = {"Name": f"task-{task_id}", "GroupName": os.environ["SCHEDULE_GROUP"]}
    for attempt in range(3):
        # A create/update conflict restarts here and reads the newest task again.
        task = table.get_item(Key={"taskId": task_id}, ConsistentRead=True).get("Item")
        if not needs_schedule(task, utc_now()):
            try:
                scheduler.delete_schedule(**identity)
            except ClientError as error:
                if error_code(error) != "ResourceNotFoundException":
                    raise
            log_event("schedule_reconciled", taskId=task_id, result="absent")
            return
        try:
            scheduler.get_schedule(**identity)
            exists = True
        except ClientError as error:
            if error_code(error) != "ResourceNotFoundException":
                raise
            exists = False
        try:
            params = schedule_parameters(task)
            if exists:
                scheduler.update_schedule(**params)
            else:
                scheduler.create_schedule(**params)
            log_event("schedule_reconciled", taskId=task_id, result="updated" if exists else "created")
            return
        except ClientError as error:
            conflict = error_code(error) in {"ConflictException", "ResourceNotFoundException"}
            if not conflict or attempt == 2:
                raise
