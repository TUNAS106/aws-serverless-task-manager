"""Lazy SDK clients: reuse connections without calling AWS during imports."""

import json
import logging
import os
from functools import lru_cache

from botocore.config import Config

logger = logging.getLogger("task-manager")
logger.setLevel(logging.INFO)


def sdk_config(short=False):
    # No SDK retry loop: workers report failures to their event source for retry.
    return Config(
        connect_timeout=0.25 if short else 1,
        read_timeout=0.35 if short else 2,
        retries={"total_max_attempts": 1, "mode": "standard"},
    )


@lru_cache
def get_table(name):
    import boto3

    return boto3.resource("dynamodb", config=sdk_config()).Table(name)


@lru_cache
def get_client(service, short=False):
    import boto3

    return boto3.client(service, config=sdk_config(short))


def tasks_table():
    return get_table(os.environ["TASKS_TABLE"])


def ledger_table():
    return get_table(os.environ["NOTIFICATION_EVENTS_TABLE"])


def log_event(action, **fields):
    # Call sites provide identifiers/error codes, never JWT, email or task content.
    logger.info(json.dumps({"action": action, **fields}, ensure_ascii=False))


def error_code(error):
    return getattr(error, "response", {}).get("Error", {}).get("Code", type(error).__name__)
