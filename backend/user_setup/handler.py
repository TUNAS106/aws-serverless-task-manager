"""Cognito PostConfirmation; SNS setup failures must not block account confirmation."""

from shared.aws import error_code, get_client, log_event
from shared.notifications import PROJECT_TAGS, topic_name


def ensure_subscription(sns, topic, email, context):
    next_token = None
    while True:
        if context and context.get_remaining_time_in_millis() < 650:
            raise TimeoutError("Not enough time to finish SNS setup")
        params = {"TopicArn": topic}
        if next_token:
            params["NextToken"] = next_token
        page = sns.list_subscriptions_by_topic(**params)
        for subscription in page.get("Subscriptions", []):
            if subscription["Protocol"] == "email" and subscription["Endpoint"] == email:
                # PendingConfirmation counts as existing: don't request another one.
                return
        next_token = page.get("NextToken")
        if not next_token:
            break
    if context and context.get_remaining_time_in_millis() < 650:
        raise TimeoutError("Not enough time to subscribe")
    sns.subscribe(TopicArn=topic, Protocol="email", Endpoint=email, ReturnSubscriptionArn=True)


def lambda_handler(event, context):
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event
    attributes = event.get("request", {}).get("userAttributes", {})
    user_id = attributes.get("sub")
    email = attributes.get("email")
    if attributes.get("email_verified") not in (True, "true") or not user_id or not email:
        log_event("user_setup_skipped", reason="missing_verified_attributes")
        return event
    try:
        sns = get_client("sns", short=True)
        result = sns.create_topic(Name=topic_name(user_id), Tags=PROJECT_TAGS)
        ensure_subscription(sns, result["TopicArn"], email, context)
        log_event("user_setup_done", userId=user_id)
    except Exception as error:
        # Never log the exception message: it can contain the email endpoint.
        log_event("user_setup_failed", userId=user_id, errorCode=error_code(error))
    return event
