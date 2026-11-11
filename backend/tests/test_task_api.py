import base64
import json
import os
import unittest
from decimal import Decimal
from unittest.mock import patch

from shared.time_utils import parse_timestamp
from shared.validation import ApiError, validate_payload
from task_api import handler as api
from tests.helpers import MemoryTable, aws_error, editable, task

NOW = parse_timestamp("2030-01-01T10:00:00Z")


class TaskApiTests(unittest.TestCase):
    def setUp(self):
        self.table = MemoryTable([task(), task(taskId="other", userId="user-b")])
        self.patches = [patch.dict(os.environ, {"ALLOWED_ORIGIN": "https://app.example"}),
                        patch.object(api, "tasks_table", return_value=self.table),
                        patch.object(api, "utc_now", return_value=NOW)]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def call(self, method, body=None, user="user-a", task_id=None, query=None):
        event = {
            "httpMethod": method, "resource": "/tasks/{taskId}" if task_id else "/tasks",
            "pathParameters": {"taskId": task_id} if task_id else None,
            "queryStringParameters": query,
            "requestContext": {"requestId": "test-request", "authorizer": {"claims": {"sub": user}}},
            "body": json.dumps(body) if body is not None else None,
        }
        result = api.lambda_handler(event, None)
        self.assertEqual(result["headers"]["Access-Control-Allow-Origin"], "https://app.example")
        return result["statusCode"], json.loads(result["body"]) if result["body"] else None

    def test_auth_and_options(self):
        self.assertEqual(self.call("GET", user=None)[0], 401)
        self.assertEqual(self.call("OPTIONS", user=None), (204, None))
        result = api.lambda_handler({"httpMethod": "GET", "requestContext": {"authorizer": None}}, None)
        self.assertEqual(result["statusCode"], 401)

    def test_create_defaults_normalization_and_private_fields(self):
        code, item = self.call("POST", {"title": "  New task  ", "dueAt": "2030-01-02T17:00:00+07:00"})
        self.assertEqual(code, 201)
        self.assertEqual(item["title"], "New task")
        self.assertEqual(item["dueAt"], "2030-01-02T10:00:00Z")
        self.assertEqual((item["status"], item["priority"], item["reminderOption"]), ("pending", "medium", "none"))
        self.assertEqual((item["version"], item["reminderRevision"]), (1, 1))
        self.assertNotIn("userId", item)
        self.assertEqual(self.table.items[item["taskId"]]["userId"], "user-a")

    def test_invalid_json_types_enums_and_fields(self):
        valid = {"title": "Task", "dueAt": "2030-01-02T10:00:00Z"}
        for body in [[], "text", {**valid, "userId": "user-b"}, {**valid, "status": "pending"},
                     {**valid, "priority": []}, {**valid, "reminderOption": True},
                     {**valid, "title": " "}, {**valid, "title": "x" * 121},
                     {**valid, "description": "x" * 1001}, {**valid, "dueAt": "2030-01-02T10:00:00"}]:
            with self.subTest(body=type(body).__name__):
                self.assertEqual(self.call("POST", body)[0], 400)

    def test_invalid_deadline_and_new_reminder(self):
        for payload, expected in [
            ({"title": "Task", "dueAt": "2029-01-01T10:00:00Z"}, "INVALID_DEADLINE"),
            ({"title": "Task", "dueAt": "2030-01-01T12:00:00Z", "reminderOption": "24h"}, "REMINDER_TIME_PASSED"),
        ]:
            code, result = self.call("POST", payload)
            self.assertEqual((code, result["error"]["code"]), (422, expected))

    def test_ownership_get_put_delete(self):
        for method in ("GET", "PUT", "DELETE"):
            self.assertEqual(self.call(method, {}, task_id="other")[0], 404)
        self.assertIn("other", self.table.items)
        self.assertTrue(all(read["ConsistentRead"] for read in self.table.reads))

    def test_full_replacement_version_and_revision(self):
        original = task()
        code, updated = self.call("PUT", {**editable(original), "status": "in_progress", "expectedVersion": 1}, task_id=original["taskId"])
        self.assertEqual(code, 200)
        self.assertEqual((updated["version"], updated["reminderRevision"]), (2, 1))
        code, completed = self.call("PUT", {**editable(updated), "status": "completed", "expectedVersion": 2}, task_id=original["taskId"])
        self.assertEqual((code, completed["reminderRevision"]), (200, 2))
        self.assertEqual(completed["createdAt"], original["createdAt"])

    def test_put_rejects_missing_fields_bool_or_stale_version(self):
        item = task()
        for version, expected in [(True, 400), (1.0, 400), (0, 400), (2, 409)]:
            self.assertEqual(self.call("PUT", {**editable(item), "expectedVersion": version}, task_id=item["taskId"])[0], expected)
        self.assertEqual(self.call("PUT", {"title": "Only title", "expectedVersion": 1}, task_id=item["taskId"])[0], 400)

    def test_conditional_write_race_returns_409_or_404(self):
        item = task()
        def conflict(**params):
            raise aws_error("ConditionalCheckFailedException")
        with patch.object(self.table, "put_item", side_effect=conflict):
            self.assertEqual(self.call("PUT", {**editable(item), "expectedVersion": 1}, task_id=item["taskId"])[0], 409)
        def disappear(**params):
            del self.table.items[item["taskId"]]
            raise aws_error("ConditionalCheckFailedException")
        with patch.object(self.table, "put_item", side_effect=disappear):
            self.assertEqual(self.call("PUT", {**editable(item), "expectedVersion": 1}, task_id=item["taskId"])[0], 404)

    def test_edit_complete_reopen_after_deadline(self):
        item = task(dueAt="2029-01-02T10:00:00Z", reminderAt="2029-01-02T09:00:00Z")
        self.table.items[item["taskId"]] = item
        for status in ("in_progress", "completed", "pending"):
            code, item = self.call("PUT", {**editable(item), "status": status, "expectedVersion": item["version"]}, task_id=item["taskId"])
            self.assertEqual(code, 200)

    def test_same_time_with_another_timezone_does_not_reschedule(self):
        item = task(dueAt="2029-01-02T10:00:00Z", reminderAt="2029-01-02T09:00:00Z")
        body = {**editable(item), "dueAt": "2029-01-02T17:00:00+07:00", "expectedVersion": 1}
        self.assertEqual(validate_payload(body, item, NOW)["dueAt"], item["dueAt"])

    def test_delete_is_conditional_and_empty_204(self):
        self.assertEqual(self.call("DELETE", task_id=task()["taskId"]), (204, None))
        self.assertEqual(self.call("DELETE", task_id=task()["taskId"])[0], 404)
        self.assertIn("ConditionExpression", self.table.writes[0])

    def test_pagination_uses_query_and_rejects_cross_user_cursor(self):
        self.table.items["new"] = task(taskId="new", createdAt="2030-01-01T09:00:00Z")
        code, first = self.call("GET", query={"limit": "1"})
        self.assertEqual(code, 200)
        self.assertEqual(first["items"][0]["taskId"], "new")
        code, second = self.call("GET", query={"limit": "1", "cursor": first["nextCursor"]})
        self.assertEqual((code, second["nextCursor"]), (200, None))
        self.assertEqual(second["items"][0]["taskId"], task()["taskId"])
        self.assertEqual(self.call("GET", user="user-b", query={"cursor": first["nextCursor"]})[0], 400)
        for query in ({"cursor": "bad!"}, {"limit": "0"}, {"limit": "101"}, {"limit": "1.0"}, {"limit": "9" * 5000}):
            self.assertEqual(self.call("GET", query=query)[0], 400)
        self.assertEqual(self.table.query_calls[0]["IndexName"], "userId-index")

    def test_error_body_does_not_leak_internal_details(self):
        with patch.object(self.table, "query", side_effect=RuntimeError("secret")):
            code, result = self.call("GET")
        self.assertEqual(code, 500)
        self.assertNotIn("secret", json.dumps(result))
        self.assertEqual(result["requestId"], "test-request")

    def test_decimal_serialization(self):
        self.assertEqual(json.loads(api.response(200, {"version": Decimal(2)})["body"]), {"version": 2})

    def test_base64_body_and_malformed_json(self):
        event = {"body": base64.b64encode(b'{"title":"ok"}').decode(), "isBase64Encoded": True}
        self.assertEqual(api.parse_body(event), {"title": "ok"})
        for body in ('{"broken":', '{"v":NaN}', None):
            with self.assertRaises(ApiError):
                api.parse_body({"body": body})
