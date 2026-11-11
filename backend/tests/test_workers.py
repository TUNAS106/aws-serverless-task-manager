import json
import os
import unittest
from unittest.mock import Mock, patch

import botocore.session
from botocore.stub import Stubber

from reminder import handler as reminder
from shared import ledger, notifications, schedules
from shared.time_utils import parse_timestamp
from stream_processor import handler as stream
from tests.helpers import MemoryTable, aws_error, stream_image, task
from user_setup import handler as setup

NOW = parse_timestamp("2030-01-02T09:30:00Z")
ENV = {
    "AWS_REGION": "ap-southeast-1", "ACCOUNT_ID": "123456789012",
    "SCHEDULE_GROUP": "ptdm-reminders",
    "REMINDER_FUNCTION_ARN": "arn:aws:lambda:ap-southeast-1:123456789012:function:ptdm-reminder",
    "SCHEDULER_ROLE_ARN": "arn:aws:iam::123456789012:role/PtdmSchedulerInvokeRole",
}


def sdk_client(service):
    # Real botocore models validate requests; Stubber prevents all network calls.
    return botocore.session.get_session().create_client(
        service, region_name=ENV["AWS_REGION"],
        aws_access_key_id="testing", aws_secret_access_key="testing",
    )


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.table = MemoryTable(key="eventKey")
        self.clock = patch.object(ledger, "utc_now", return_value=NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)

    def test_first_lease_done_and_duplicate(self):
        owner = ledger.acquire(self.table, "event-one")
        item = self.table.items["event-one"]
        self.assertEqual(item["leaseUntil"], int(NOW.timestamp()) + 60)
        self.assertEqual(item["ttl"], int(NOW.timestamp()) + 7 * 86400)
        ledger.mark_done(self.table, "event-one", owner)
        self.assertIsNone(ledger.acquire(self.table, "event-one"))
        self.assertTrue(self.table.reads[-1]["ConsistentRead"])

    def test_busy_lease_raises_instead_of_reporting_success(self):
        ledger.acquire(self.table, "event-one")
        with self.assertRaises(ledger.LeaseBusy):
            ledger.acquire(self.table, "event-one")

    def test_expired_lease_new_owner_and_old_owner_cannot_modify(self):
        old_owner = ledger.acquire(self.table, "event-one")
        self.table.items["event-one"]["leaseUntil"] = int(NOW.timestamp())
        new_owner = ledger.acquire(self.table, "event-one")
        self.assertNotEqual(old_owner, new_owner)
        with self.assertRaises(Exception):
            ledger.mark_done(self.table, "event-one", old_owner)
        ledger.release(self.table, "event-one", old_owner)
        self.assertEqual(self.table.items["event-one"]["ownerToken"], new_owner)
        self.assertGreater(self.table.items["event-one"]["leaseUntil"], int(NOW.timestamp()))

    def test_publish_failure_releases_and_propagates(self):
        with patch.object(notifications, "publish", side_effect=RuntimeError("SNS failed")):
            with self.assertRaises(RuntimeError):
                notifications.send_once(self.table, "event-one", task(), "TASK_CREATED")
        self.assertEqual(self.table.items["event-one"]["state"], "IN_PROGRESS")
        self.assertEqual(self.table.items["event-one"]["leaseUntil"], 0)
        self.assertIsNotNone(ledger.acquire(self.table, "event-one"))

    def test_publish_once_and_mark_done_only_after_success(self):
        with patch.object(notifications, "publish") as publish:
            self.assertTrue(notifications.send_once(self.table, "event-one", task(), "TASK_CREATED"))
            self.assertFalse(notifications.send_once(self.table, "event-one", task(), "TASK_CREATED"))
        publish.assert_called_once()

    def test_done_write_failure_propagates_after_publish(self):
        with patch.object(notifications, "publish") as publish, patch.object(ledger, "mark_done", side_effect=RuntimeError("DB failed")):
            with self.assertRaises(RuntimeError):
                notifications.send_once(self.table, "event-one", task(), "TASK_CREATED")
        publish.assert_called_once()
        self.assertEqual(self.table.items["event-one"]["state"], "IN_PROGRESS")


class ScheduleTests(unittest.TestCase):
    def setUp(self):
        self.client = sdk_client("scheduler")
        self.stub = Stubber(self.client)
        self.identity = {"Name": f"task-{task()['taskId']}", "GroupName": "ptdm-reminders"}
        self.arn = f"arn:aws:scheduler:ap-southeast-1:123456789012:schedule/ptdm-reminders/{self.identity['Name']}"
        self.table = MemoryTable([task()])
        self.patches = [patch.dict(os.environ, ENV), patch.object(schedules, "get_client", return_value=self.client),
                        patch.object(schedules, "utc_now", return_value=parse_timestamp("2030-01-01T10:00:00Z"))]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)
        self.stub.activate()
        self.addCleanup(self.stub.deactivate)

    def test_create_full_payload(self):
        self.stub.add_client_error("get_schedule", "ResourceNotFoundException", expected_params=self.identity)
        params = schedules.schedule_parameters(task())
        self.stub.add_response("create_schedule", {"ScheduleArn": self.arn}, params)
        schedules.reconcile(self.table, task()["taskId"])
        self.stub.assert_no_pending_responses()
        self.assertEqual(params["ScheduleExpression"], "at(2030-01-02T09:00:00)")
        self.assertEqual(params["ScheduleExpressionTimezone"], "UTC")
        self.assertEqual(params["ActionAfterCompletion"], "DELETE")
        self.assertEqual(json.loads(params["Target"]["Input"])["reminderRevision"], 1)
        self.assertEqual(params["Target"]["RetryPolicy"], {"MaximumRetryAttempts": 2, "MaximumEventAgeInSeconds": 3600})
        self.assertNotIn("Tags", params)

    def test_update_keeps_full_target_fields(self):
        self.stub.add_response("get_schedule", {}, self.identity)
        self.stub.add_response("update_schedule", {"ScheduleArn": self.arn}, schedules.schedule_parameters(task()))
        schedules.reconcile(self.table, task()["taskId"])
        self.stub.assert_no_pending_responses()

    def test_missing_completed_none_or_past_reminder_delete_schedule(self):
        for item in (None, task(status="completed"), task(reminderOption="none", reminderAt=None), task(reminderAt="2029-01-01T09:00:00Z")):
            table = MemoryTable([item] if item else [])
            self.stub.add_client_error("delete_schedule", "ResourceNotFoundException", expected_params=self.identity)
            schedules.reconcile(table, task()["taskId"])
        self.stub.assert_no_pending_responses()

    def test_conflict_reloads_task_before_retry(self):
        self.stub.add_client_error("get_schedule", "ResourceNotFoundException", expected_params=self.identity)
        self.stub.add_client_error("create_schedule", "ConflictException", expected_params=schedules.schedule_parameters(task()))
        latest = task(reminderRevision=2, reminderAt="2030-01-02T08:00:00Z")
        self.stub.add_response("get_schedule", {}, self.identity)
        self.stub.add_response("update_schedule", {"ScheduleArn": self.arn}, schedules.schedule_parameters(latest))
        with patch.object(self.table, "get_item", side_effect=[{"Item": task()}, {"Item": latest}]) as read:
            schedules.reconcile(self.table, task()["taskId"])
        self.assertEqual(read.call_count, 2)
        self.stub.assert_no_pending_responses()

    def test_retry_is_bounded_and_failure_propagates(self):
        for _ in range(3):
            self.stub.add_response("get_schedule", {}, self.identity)
            self.stub.add_client_error("update_schedule", "ResourceNotFoundException", expected_params=schedules.schedule_parameters(task()))
        with self.assertRaises(Exception):
            schedules.reconcile(self.table, task()["taskId"])
        self.stub.assert_no_pending_responses()


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.event = {key: task()[key] for key in ("taskId", "userId", "reminderAt", "reminderRevision")}

    def test_skip_conditions(self):
        cases = [
            (None, self.event, NOW, "task_missing"),
            (task(userId="user-b"), self.event, NOW, "owner_mismatch"),
            (task(status="completed"), self.event, NOW, "reminder_disabled"),
            (task(reminderOption="none"), self.event, NOW, "reminder_disabled"),
            (task(reminderRevision=2), self.event, NOW, "stale_schedule"),
            (task(reminderAt="2030-01-02T08:00:00Z"), self.event, NOW, "stale_schedule"),
            (task(), self.event, parse_timestamp("2030-01-02T08:59:59Z"), "too_early"),
            (task(), self.event, parse_timestamp(task()["dueAt"]), "deadline_passed"),
        ]
        for item, event, now, reason in cases:
            with self.subTest(reason=reason):
                self.assertEqual(reminder.skip_reason(item, event, now), reason)
        self.assertIsNone(reminder.skip_reason(task(), self.event, NOW))

    def test_publish_reads_current_task_strongly(self):
        table = MemoryTable([task()])
        with patch.object(reminder, "tasks_table", return_value=table), patch.object(reminder, "ledger_table"), patch.object(reminder, "utc_now", return_value=NOW), patch.object(reminder, "send_once", return_value=True) as send:
            self.assertEqual(reminder.lambda_handler(self.event, None), {"sent": True})
        self.assertTrue(table.reads[0]["ConsistentRead"])
        self.assertEqual(send.call_args.args[1], f"reminder#{task()['taskId']}#1")

    def test_stale_schedule_does_not_publish(self):
        with patch.object(reminder, "tasks_table", return_value=MemoryTable([task(reminderRevision=2)])), patch.object(reminder, "utc_now", return_value=NOW), patch.object(reminder, "send_once") as send:
            self.assertEqual(reminder.lambda_handler(self.event, None), {"skipped": "stale_schedule"})
        send.assert_not_called()

    def test_bad_payload_or_aws_failure_raises_for_async_retry(self):
        with self.assertRaises(ValueError):
            reminder.lambda_handler({**self.event, "reminderRevision": True}, None)
        with patch.object(reminder, "tasks_table", side_effect=RuntimeError("DB failed")):
            with self.assertRaises(RuntimeError):
                reminder.lambda_handler(self.event, None)


class StreamTests(unittest.TestCase):
    def record(self, name, old=None, new=None):
        return {"eventID": "event-one", "eventName": name, "dynamodb": {
            "Keys": {"taskId": {"S": task()["taskId"]}},
            "OldImage": stream_image(old or task()), "NewImage": stream_image(new or task()),
        }}

    def test_insert_and_status_change_use_correct_notification(self):
        for record, action in [(self.record("INSERT"), "TASK_CREATED"),
                               (self.record("MODIFY", new=task(status="in_progress")), "TASK_STATUS_CHANGED")]:
            with patch.object(stream, "tasks_table"), patch.object(stream, "ledger_table"), patch.object(stream, "reconcile") as reconcile, patch.object(stream, "send_once") as send:
                stream.lambda_handler({"Records": [record]}, None)
            reconcile.assert_called_once()
            self.assertEqual(send.call_args.args[1], f"stream#event-one#{action}")
            self.assertEqual(send.call_args.args[3], action)

    def test_title_edit_remove_and_operator_reconcile_do_not_email(self):
        for record in [self.record("MODIFY", new=task(title="Renamed")), self.record("MODIFY"), self.record("REMOVE")]:
            with patch.object(stream, "tasks_table"), patch.object(stream, "reconcile") as reconcile, patch.object(stream, "send_once") as send:
                stream.process_record(record)
            reconcile.assert_called_once()
            send.assert_not_called()

    def test_retry_reconciles_even_when_notification_already_done(self):
        with patch.object(stream, "tasks_table"), patch.object(stream, "ledger_table"), patch.object(stream, "reconcile") as reconcile, patch.object(stream, "send_once", return_value=False):
            for _ in range(2):
                stream.process_record(self.record("INSERT"))
        self.assertEqual(reconcile.call_count, 2)

    def test_schedule_failure_propagates_before_notification(self):
        with patch.object(stream, "tasks_table"), patch.object(stream, "reconcile", side_effect=RuntimeError("Scheduler failed")), patch.object(stream, "send_once") as send:
            with self.assertRaises(RuntimeError):
                stream.lambda_handler({"Records": [self.record("INSERT")]}, None)
        send.assert_not_called()


class UserSetupTests(unittest.TestCase):
    def setUp(self):
        self.event = {"triggerSource": "PostConfirmation_ConfirmSignUp", "request": {"userAttributes": {
            "sub": "user-a", "email": "verified@example.com", "email_verified": "true",
        }}}
        self.topic = "arn:aws:sns:ap-southeast-1:123456789012:ptdm-user-user-a"

    def test_create_topic_with_tags_and_subscribe(self):
        client = sdk_client("sns")
        with Stubber(client) as stub, patch.object(setup, "get_client", return_value=client):
            stub.add_response("create_topic", {"TopicArn": self.topic}, {"Name": "ptdm-user-user-a", "Tags": notifications.PROJECT_TAGS})
            stub.add_response("list_subscriptions_by_topic", {"Subscriptions": []}, {"TopicArn": self.topic})
            stub.add_response("subscribe", {"SubscriptionArn": "pending confirmation"}, {"TopicArn": self.topic, "Protocol": "email", "Endpoint": "verified@example.com", "ReturnSubscriptionArn": True})
            self.assertIs(setup.lambda_handler(self.event, None), self.event)
            stub.assert_no_pending_responses()

    def test_existing_pending_subscription_on_later_page_is_not_duplicated(self):
        sns = Mock()
        sns.list_subscriptions_by_topic.side_effect = [
            {"Subscriptions": [], "NextToken": "page-two"},
            {"Subscriptions": [{"Protocol": "email", "Endpoint": "verified@example.com", "SubscriptionArn": "PendingConfirmation"}]},
        ]
        setup.ensure_subscription(sns, self.topic, "verified@example.com", None)
        self.assertEqual(sns.list_subscriptions_by_topic.call_count, 2)
        sns.subscribe.assert_not_called()

    def test_password_reset_and_unverified_email_skip_setup(self):
        with patch.object(setup, "get_client") as client:
            setup.lambda_handler({**self.event, "triggerSource": "PostConfirmation_ConfirmForgotPassword"}, None)
            self.event["request"]["userAttributes"]["email_verified"] = "false"
            setup.lambda_handler(self.event, None)
        client.assert_not_called()

    def test_sns_error_returns_event_without_logging_email(self):
        with patch.object(setup, "get_client", side_effect=RuntimeError("verified@example.com")):
            with self.assertLogs("task-manager", level="INFO") as logs:
                self.assertIs(setup.lambda_handler(self.event, None), self.event)
        self.assertNotIn("verified@example.com", " ".join(logs.output))

    def test_not_enough_time_does_not_start_more_requests(self):
        sns = Mock()
        context = Mock()
        context.get_remaining_time_in_millis.return_value = 300
        with self.assertRaises(TimeoutError):
            setup.ensure_subscription(sns, self.topic, "verified@example.com", context)
        sns.list_subscriptions_by_topic.assert_not_called()

    def test_notification_uses_only_trusted_topic_and_plaintext(self):
        client = sdk_client("sns")
        with patch.dict(os.environ, ENV), patch.object(notifications, "get_client", return_value=client), Stubber(client) as stub:
            from botocore.stub import ANY
            stub.add_response("publish", {"MessageId": "message-one"}, {
                "TopicArn": self.topic, "Subject": "Task Manager - TASK_CREATED", "Message": ANY,
            })
            notifications.publish(task(title="A\nB"), "TASK_CREATED")
            stub.assert_no_pending_responses()
        with self.assertRaises(ValueError):
            notifications.topic_name("user:other-topic")
