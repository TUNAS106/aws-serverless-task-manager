"""Task rules shared by POST and PUT. No AWS calls in validation."""

from datetime import timedelta

from shared.time_utils import iso_utc, parse_timestamp

PRIORITIES = {"low", "medium", "high"}
STATUSES = {"pending", "in_progress", "completed"}
REMINDER_HOURS = {"none": 0, "1h": 1, "24h": 24}
EDITABLE_FIELDS = {"title", "description", "priority", "status", "dueAt", "reminderOption"}


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status = status
        self.code = code


def invalid(message):
    raise ApiError(400, "VALIDATION_ERROR", message)


def validate_payload(body, current, now):
    if not isinstance(body, dict):
        invalid("Body phải là một JSON object.")

    allowed = EDITABLE_FIELDS | {"expectedVersion"} if current else EDITABLE_FIELDS - {"status"}
    if body.keys() - allowed:
        invalid("Body chứa trường không được phép.")
    required = EDITABLE_FIELDS | {"expectedVersion"} if current else {"title", "dueAt"}
    if required - body.keys():
        invalid("Thiếu trường bắt buộc.")

    title = body.get("title")
    description = body.get("description", "")
    priority = body.get("priority", "medium")
    status = body.get("status", "pending")
    option = body.get("reminderOption", "none")
    if not isinstance(title, str) or not 1 <= len(title.strip()) <= 120:
        invalid("Tên công việc cần có từ 1 đến 120 ký tự.")
    if not isinstance(description, str) or len(description) > 1000:
        invalid("Mô tả phải là chuỗi tối đa 1.000 ký tự.")
    if not isinstance(priority, str) or priority not in PRIORITIES:
        invalid("Độ ưu tiên không hợp lệ.")
    if not isinstance(status, str) or status not in STATUSES:
        invalid("Trạng thái không hợp lệ.")
    if not isinstance(option, str) or option not in REMINDER_HOURS:
        invalid("Lựa chọn nhắc không hợp lệ.")
    if current:
        version = body.get("expectedVersion")
        if type(version) is not int or version < 1:
            invalid("expectedVersion phải là số nguyên dương.")

    try:
        due = parse_timestamp(body.get("dueAt"))
    except (ValueError, OverflowError):
        invalid("dueAt cần có ngày, giờ và múi giờ hợp lệ.")

    due_changed = current is None or due != parse_timestamp(current["dueAt"])
    if due_changed and due <= now:
        raise ApiError(422, "INVALID_DEADLINE", "Deadline mới phải nằm trong tương lai.")
    reminder = due - timedelta(hours=REMINDER_HOURS[option]) if option != "none" else None
    reminder_changed = due_changed or current is None or option != current["reminderOption"]
    if reminder_changed and reminder is not None and reminder <= now:
        raise ApiError(422, "REMINDER_TIME_PASSED", "Thời điểm nhắc mới phải nằm trong tương lai.")

    return {
        "title": title.strip(), "description": description, "priority": priority,
        "status": status, "dueAt": iso_utc(due), "reminderOption": option,
        "reminderAt": iso_utc(reminder) if reminder else None,
    }
