"""All persistent timestamps use UTC, to the nearest second."""

from datetime import datetime, timezone


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def parse_timestamp(value):
    if not isinstance(value, str) or "T" not in value:
        raise ValueError("Timestamp must include date, time and timezone")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("Timestamp must include timezone")
    return parsed.astimezone(timezone.utc).replace(microsecond=0)


def iso_utc(value):
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
