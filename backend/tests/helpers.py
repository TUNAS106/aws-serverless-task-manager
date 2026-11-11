"""Small in-memory fixtures; they model the conditions we use, not all DynamoDB."""

from copy import deepcopy
from decimal import Decimal

from botocore.exceptions import ClientError


def aws_error(code, operation="PutItem"):
    return ClientError({"Error": {"Code": code, "Message": "test failure"}}, operation)


def task(**changes):
    return {
        "taskId": "11111111-1111-4111-8111-111111111111", "userId": "user-a",
        "title": "Prepare demo", "description": "Architecture notes", "priority": "high",
        "status": "pending", "dueAt": "2030-01-02T10:00:00Z",
        "reminderOption": "1h", "reminderAt": "2030-01-02T09:00:00Z",
        "version": 1, "reminderRevision": 1,
        "createdAt": "2030-01-01T08:00:00Z", "updatedAt": "2030-01-01T08:00:00Z",
        **changes,
    }


def editable(item):
    return {key: item[key] for key in ("title", "description", "priority", "status", "dueAt", "reminderOption")}


def stream_image(item):
    result = {}
    for key, value in item.items():
        if value is None:
            result[key] = {"NULL": True}
        elif isinstance(value, (int, Decimal)):
            result[key] = {"N": str(value)}
        else:
            result[key] = {"S": value}
    return result


class MemoryTable:
    def __init__(self, items=(), key="taskId"):
        self.key = key
        self.items = {item[key]: deepcopy(item) for item in items}
        self.reads = []
        self.writes = []
        self.query_calls = []

    def get_item(self, **params):
        self.reads.append(params)
        item = self.items.get(params["Key"][self.key])
        return {"Item": deepcopy(item)} if item else {}

    def put_item(self, **params):
        self.writes.append(params)
        item = params["Item"]
        existing = self.items.get(item[self.key])
        values = params.get("ExpressionAttributeValues", {})
        condition = params.get("ConditionExpression", "")
        if "leaseUntil" in condition:
            allowed = not existing or (existing["state"] == "IN_PROGRESS" and existing["leaseUntil"] <= values[":now"])
        elif ":expected" in values:
            allowed = existing and existing["userId"] == values[":uid"] and existing["version"] == values[":expected"]
        else:
            allowed = not existing
        if not allowed:
            raise aws_error("ConditionalCheckFailedException")
        self.items[item[self.key]] = deepcopy(item)
        return {}

    def delete_item(self, **params):
        self.writes.append(params)
        key = params["Key"][self.key]
        existing = self.items.get(key)
        if not existing or existing["userId"] != params["ExpressionAttributeValues"][":uid"]:
            raise aws_error("ConditionalCheckFailedException", "DeleteItem")
        del self.items[key]
        return {}

    def update_item(self, **params):
        self.writes.append(params)
        item = self.items.get(params["Key"][self.key])
        values = params["ExpressionAttributeValues"]
        if not item or item["ownerToken"] != values[":owner"] or item["state"] != "IN_PROGRESS":
            raise aws_error("ConditionalCheckFailedException", "UpdateItem")
        if ":done" in values:
            item["state"] = values[":done"]
        if ":expired" in values:
            item["leaseUntil"] = values[":expired"]
        item["updatedAt"] = values[":updated"]
        return {}

    def query(self, **params):
        self.query_calls.append(params)
        items = sorted((deepcopy(item) for item in self.items.values()
                        if item["userId"] == params["ExpressionAttributeValues"][":uid"]),
                       key=lambda item: item["createdAt"], reverse=True)
        start = params.get("ExclusiveStartKey")
        if start:
            index = next(i for i, item in enumerate(items) if item["taskId"] == start["taskId"])
            items = items[index + 1:]
        page = items[:params["Limit"]]
        result = {"Items": page}
        if len(items) > len(page):
            result["LastEvaluatedKey"] = {key: page[-1][key] for key in ("taskId", "userId", "createdAt")}
        return result
