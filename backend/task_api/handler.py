"""API Gateway REST proxy handler. Cognito authorizer supplies verified claims."""

import base64
import binascii
import json
import os
from decimal import Decimal
from uuid import uuid4

from botocore.exceptions import ClientError

from shared.aws import error_code, log_event, tasks_table
from shared.time_utils import iso_utc, parse_timestamp, utc_now
from shared.validation import ApiError, invalid, validate_payload


def json_number(value):
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    raise TypeError("Unsupported JSON value")


def response(status, data=None):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": os.environ["ALLOWED_ORIGIN"],
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
            "Access-Control-Allow-Headers": "Authorization,Content-Type",
            "Cache-Control": "no-store",
        },
        "body": "" if status == 204 else json.dumps(data, default=json_number, ensure_ascii=False),
    }


def public_task(task):
    return {key: value for key, value in task.items() if key != "userId"}


def parse_body(event):
    try:
        raw = event.get("body")
        if not isinstance(raw, str):
            invalid("Body phải là chuỗi JSON của REST proxy event.")
        if event.get("isBase64Encoded"):
            raw = base64.b64decode(raw, validate=True).decode("utf-8")
        return json.loads(raw, parse_constant=lambda _: invalid("JSON không hợp lệ."))
    except (ValueError, UnicodeError, binascii.Error, RecursionError):
        invalid("Body không phải JSON hợp lệ.")


def get_task(table, task_id, user_id):
    task = table.get_item(Key={"taskId": task_id}, ConsistentRead=True).get("Item")
    if not task or task["userId"] != user_id:
        raise ApiError(404, "TASK_NOT_FOUND", "Không tìm thấy công việc.")
    return task


def encode_cursor(key):
    if not key:
        return None
    return base64.urlsafe_b64encode(json.dumps(key).encode()).decode()


def decode_cursor(cursor, user_id):
    try:
        if not isinstance(cursor, str) or len(cursor) > 4096:
            raise ValueError
        raw = base64.b64decode(cursor, altchars=b"-_", validate=True)
        key = json.loads(raw)
        if not isinstance(key, dict) or set(key) != {"taskId", "userId", "createdAt"}:
            raise ValueError
        if any(not isinstance(value, str) or not value or len(value) > 2048 for value in key.values()):
            raise ValueError
        if key["userId"] != user_id:
            raise ValueError
        if iso_utc(parse_timestamp(key["createdAt"])) != key["createdAt"]:
            raise ValueError
        return key
    except (ValueError, UnicodeError, binascii.Error, OverflowError, RecursionError):
        invalid("Cursor không hợp lệ hoặc không thuộc tài khoản này.")


def list_tasks(table, user_id, params):
    if params.keys() - {"limit", "cursor"}:
        invalid("Query parameter không được hỗ trợ.")
    raw_limit = params.get("limit", "50")
    if not isinstance(raw_limit, str) or not raw_limit.isascii() or not raw_limit.isdecimal():
        invalid("limit phải là số nguyên từ 1 đến 100.")
    limit = int(raw_limit) if len(raw_limit) <= 3 else 0
    if not 1 <= limit <= 100:
        invalid("limit phải từ 1 đến 100.")
    options = {
        "IndexName": "userId-index", "KeyConditionExpression": "#u = :uid",
        "ExpressionAttributeNames": {"#u": "userId"},
        "ExpressionAttributeValues": {":uid": user_id},
        "ScanIndexForward": False, "Limit": limit,
    }
    if "cursor" in params:
        options["ExclusiveStartKey"] = decode_cursor(params["cursor"], user_id)
    page = table.query(**options)
    return {"items": [public_task(item) for item in page.get("Items", [])],
            "nextCursor": encode_cursor(page.get("LastEvaluatedKey"))}


def create_task(table, user_id, body):
    now = utc_now()
    task = {
        **validate_payload(body, None, now), "taskId": str(uuid4()), "userId": user_id,
        "version": 1, "reminderRevision": 1,
        "createdAt": iso_utc(now), "updatedAt": iso_utc(now),
    }
    table.put_item(Item=task, ConditionExpression="attribute_not_exists(taskId)")
    return public_task(task)


def update_task(table, task_id, user_id, body):
    current = get_task(table, task_id, user_id)
    now = utc_now()
    values = validate_payload(body, current, now)
    if body["expectedVersion"] != current["version"]:
        raise ApiError(409, "VERSION_CONFLICT", "Công việc đã thay đổi. Hãy tải lại rồi sửa.")
    reminder_changed = (
        values["dueAt"] != current["dueAt"]
        or values["reminderOption"] != current["reminderOption"]
        or (values["status"] == "completed") != (current["status"] == "completed")
    )
    task = {**current, **values, "version": int(current["version"]) + 1,
            "reminderRevision": int(current["reminderRevision"]) + int(reminder_changed),
            "updatedAt": iso_utc(now)}
    try:
        # Full replacement keeps immutable fields from the strongly read item.
        table.put_item(
            Item=task, ConditionExpression="#u = :uid AND #v = :expected",
            ExpressionAttributeNames={"#u": "userId", "#v": "version"},
            ExpressionAttributeValues={":uid": user_id, ":expected": body["expectedVersion"]},
        )
    except ClientError as error:
        if error_code(error) != "ConditionalCheckFailedException":
            raise
        get_task(table, task_id, user_id)  # Missing or ownership changed -> 404.
        raise ApiError(409, "VERSION_CONFLICT", "Công việc đã thay đổi. Hãy tải lại rồi sửa.") from None
    return public_task(task)


def delete_task(table, task_id, user_id):
    try:
        table.delete_item(
            Key={"taskId": task_id}, ConditionExpression="#u = :uid",
            ExpressionAttributeNames={"#u": "userId"},
            ExpressionAttributeValues={":uid": user_id},
        )
    except ClientError as error:
        if error_code(error) != "ConditionalCheckFailedException":
            raise
        raise ApiError(404, "TASK_NOT_FOUND", "Không tìm thấy công việc.") from None


def lambda_handler(event, context):
    request_context = event.get("requestContext") or {}
    request_id = request_context.get("requestId") or getattr(context, "aws_request_id", str(uuid4()))
    try:
        method = event.get("httpMethod")
        if method == "OPTIONS":
            return response(204)
        claims = (request_context.get("authorizer") or {}).get("claims") or {}
        user_id = claims.get("sub") if isinstance(claims, dict) else None
        if not isinstance(user_id, str) or not user_id:
            raise ApiError(401, "UNAUTHORIZED", "Vui lòng đăng nhập.")
        resource = event.get("resource")
        task_id = (event.get("pathParameters") or {}).get("taskId")
        table = tasks_table()
        if resource == "/tasks" and method == "GET":
            return response(200, list_tasks(table, user_id, event.get("queryStringParameters") or {}))
        if resource == "/tasks" and method == "POST":
            return response(201, create_task(table, user_id, parse_body(event)))
        if resource == "/tasks/{taskId}" and isinstance(task_id, str) and task_id:
            if method == "GET":
                return response(200, public_task(get_task(table, task_id, user_id)))
            if method == "PUT":
                return response(200, update_task(table, task_id, user_id, parse_body(event)))
            if method == "DELETE":
                delete_task(table, task_id, user_id)
                return response(204)
        raise ApiError(404, "NOT_FOUND", "Không tìm thấy endpoint.")
    except ApiError as error:
        return response(error.status, {"error": {"code": error.code, "message": str(error)}, "requestId": request_id})
    except Exception as error:
        log_event("api_failed", requestId=request_id, errorCode=error_code(error))
        return response(500, {"error": {"code": "INTERNAL_ERROR", "message": "Hệ thống đang gặp lỗi. Vui lòng thử lại sau."}, "requestId": request_id})
