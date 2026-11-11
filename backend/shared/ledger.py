"""Lease before SNS, DONE after SNS. This reduces duplicates, not exactly-once."""

from uuid import uuid4

from botocore.exceptions import ClientError

from shared.aws import error_code
from shared.time_utils import iso_utc, utc_now

LEASE_SECONDS = 60
TTL_SECONDS = 7 * 86400


class LeaseBusy(Exception):
    """Must reach the event source as an error so it retries later."""


def acquire(table, event_key):
    now = utc_now()
    epoch = int(now.timestamp())
    owner = str(uuid4())
    try:
        table.put_item(
            Item={"eventKey": event_key, "state": "IN_PROGRESS", "ownerToken": owner,
                  "leaseUntil": epoch + LEASE_SECONDS, "ttl": epoch + TTL_SECONDS,
                  "updatedAt": iso_utc(now)},
            ConditionExpression="attribute_not_exists(eventKey) OR (#s = :progress AND leaseUntil <= :now)",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":progress": "IN_PROGRESS", ":now": epoch},
        )
        return owner
    except ClientError as error:
        if error_code(error) != "ConditionalCheckFailedException":
            raise
        item = table.get_item(Key={"eventKey": event_key}, ConsistentRead=True).get("Item")
        if item and item.get("state") == "DONE":
            return None
        raise LeaseBusy("Notification lease is busy; retry the original event") from None


def mark_done(table, event_key, owner):
    table.update_item(
        Key={"eventKey": event_key},
        UpdateExpression="SET #s = :done, updatedAt = :updated",
        ConditionExpression="#s = :progress AND ownerToken = :owner",
        ExpressionAttributeNames={"#s": "state"},
        ExpressionAttributeValues={":done": "DONE", ":progress": "IN_PROGRESS",
                                   ":owner": owner, ":updated": iso_utc(utc_now())},
    )


def release(table, event_key, owner):
    """Make a failed publish eligible for retry; never touch another owner's lease."""
    try:
        table.update_item(
            Key={"eventKey": event_key},
            UpdateExpression="SET leaseUntil = :expired, updatedAt = :updated",
            ConditionExpression="#s = :progress AND ownerToken = :owner",
            ExpressionAttributeNames={"#s": "state"},
            ExpressionAttributeValues={":expired": 0, ":progress": "IN_PROGRESS",
                                       ":owner": owner, ":updated": iso_utc(utc_now())},
        )
    except ClientError as error:
        if error_code(error) != "ConditionalCheckFailedException":
            raise
