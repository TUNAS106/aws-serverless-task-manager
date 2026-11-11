"""Exercise the API -> stream -> reminder contract with shared in-memory state."""

import unittest
from contextlib import ExitStack
from unittest.mock import Mock, patch

from reminder import handler as reminder
from shared import ledger, notifications, schedules
from shared.time_utils import parse_timestamp
from stream_processor import handler as stream
from task_api import handler as api
from tests.helpers import MemoryTable, aws_error, editable, stream_image
from tests.test_workers import ENV


class WorkflowTests(unittest.TestCase):
    def test_create_notify_remind_complete_delete(self):
        tasks = MemoryTable()
        events = MemoryTable(key="eventKey")
        sns = Mock()
        scheduler = Mock()
        scheduler.get_schedule.side_effect = aws_error("ResourceNotFoundException", "GetSchedule")
        early = parse_timestamp("2030-01-01T10:00:00Z")
        later = parse_timestamp("2030-01-02T09:30:00Z")

        with ExitStack() as stack:
            stack.enter_context(patch.dict("os.environ", ENV))
            for module in (stream, reminder):
                stack.enter_context(patch.object(module, "tasks_table", return_value=tasks))
                stack.enter_context(patch.object(module, "ledger_table", return_value=events))
            api_clock = stack.enter_context(patch.object(api, "utc_now", return_value=early))
            ledger_clock = stack.enter_context(patch.object(ledger, "utc_now", return_value=early))
            schedule_clock = stack.enter_context(patch.object(schedules, "utc_now", return_value=early))
            reminder_clock = stack.enter_context(patch.object(reminder, "utc_now", return_value=early))
            stack.enter_context(patch.object(notifications, "get_client", return_value=sns))
            stack.enter_context(patch.object(schedules, "get_client", return_value=scheduler))

            created = api.create_task(tasks, "user-a", {
                "title": "End-to-end local", "dueAt": "2030-01-02T10:00:00Z",
                "reminderOption": "1h",
            })
            task_id = created["taskId"]

            def deliver(name, event_id, old=None, new=None):
                record = {"eventID": event_id, "eventName": name, "dynamodb": {
                    "Keys": {"taskId": {"S": task_id}},
                    "OldImage": stream_image(old or {}), "NewImage": stream_image(new or {}),
                }}
                stream.lambda_handler({"Records": [record]}, None)

            deliver("INSERT", "created-event", new=tasks.items[task_id])
            scheduler.create_schedule.assert_called_once()
            self.assertEqual(sns.publish.call_count, 1)
            payload = {key: tasks.items[task_id][key] for key in ("taskId", "userId", "reminderAt", "reminderRevision")}
            self.assertEqual(reminder.lambda_handler(payload, None), {"skipped": "too_early"})

            for clock in (api_clock, ledger_clock, schedule_clock, reminder_clock):
                clock.return_value = later
            self.assertEqual(reminder.lambda_handler(payload, None), {"sent": True})
            self.assertEqual(reminder.lambda_handler(payload, None), {"sent": False})
            self.assertEqual(sns.publish.call_count, 2)

            before = tasks.items[task_id].copy()
            updated = api.update_task(tasks, task_id, "user-a", {
                **editable(before), "status": "completed", "expectedVersion": before["version"],
            })
            self.assertEqual(updated["reminderRevision"], 2)
            deliver("MODIFY", "completed-event", old=before, new=tasks.items[task_id])
            scheduler.delete_schedule.assert_called_once()
            self.assertEqual(reminder.lambda_handler(payload, None), {"skipped": "reminder_disabled"})
            self.assertEqual(sns.publish.call_count, 3)

            api.delete_task(tasks, task_id, "user-a")
            deliver("REMOVE", "deleted-event", old=before)
            self.assertEqual(sns.publish.call_count, 3)
            self.assertEqual(reminder.lambda_handler(payload, None), {"skipped": "task_missing"})
            self.assertEqual(len(events.items), 3)
            self.assertTrue(all(item["state"] == "DONE" for item in events.items.values()))
