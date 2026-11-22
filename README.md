# AWS Serverless Task Manager

A serverless task management application with secure authentication, deadline tracking, and automated email reminders. Built with React, Python, and AWS.

[Live Demo](https://d2bbysp6jac78g.cloudfront.net/) · [Architecture](#architecture)

![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![AWS Serverless](https://img.shields.io/badge/AWS-Serverless-FF9900)

<table>
<tr>
<td align="center"><img src="assets/service-icons/cf.svg" width="40" height="40" alt="CloudFront"><br><sub>CloudFront</sub></td>
<td align="center"><img src="assets/service-icons/s3.svg" width="40" height="40" alt="S3"><br><sub>S3</sub></td>
<td align="center"><img src="assets/service-icons/auth.svg" width="40" height="40" alt="Cognito"><br><sub>Cognito</sub></td>
<td align="center"><img src="assets/service-icons/api.svg" width="40" height="40" alt="API Gateway"><br><sub>API Gateway</sub></td>
<td align="center"><img src="assets/service-icons/task.svg" width="40" height="40" alt="Lambda"><br><sub>Lambda</sub></td>
</tr>
<tr>
<td align="center"><img src="assets/service-icons/ep.svg" width="40" height="40" alt="VPC Endpoint"><br><sub>VPC Endpoint</sub></td>
<td align="center"><img src="assets/service-icons/db.svg" width="40" height="40" alt="DynamoDB"><br><sub>DynamoDB</sub></td>
<td align="center"><img src="assets/service-icons/streamsrc.svg" width="40" height="40" alt="DynamoDB Streams"><br><sub>DynamoDB Streams</sub></td>
<td align="center"><img src="assets/service-icons/sched.svg" width="40" height="40" alt="EventBridge Scheduler"><br><sub>EventBridge Scheduler</sub></td>
<td align="center"><img src="assets/service-icons/sns.svg" width="40" height="40" alt="SNS"><br><sub>SNS</sub></td>
</tr>
</table>

## Application Preview

[Open the live application](https://d2bbysp6jac78g.cloudfront.net/) to explore the task dashboard. Registration and email verification are required to use the deployed application. Confirm the separate SNS email subscription to receive notifications.

<!-- Add a dashboard screenshot using English sample tasks at assets/preview/dashboard.png,
then replace this comment with:
![Task dashboard showing deadlines, priorities, and task status](assets/preview/dashboard.png)
Capture the actual application without personal email addresses or tokens.
-->

## Key Features

- Secure email registration and sign-in.
- Create, edit, complete, reopen, and delete tasks.
- Search, filter, and sort tasks.
- Track deadlines and task progress.
- Receive task updates and scheduled email reminders.

## Architecture

[![AWS Serverless Task Manager architecture](assets/architecture/task-manager-architecture.png)](assets/architecture/task-manager-architecture.svg)

[View full-size diagram](assets/architecture/task-manager-architecture.svg) · [Editable draw.io file](assets/architecture/task-manager-architecture.drawio)

- **Frontend delivery:** CloudFront serves the React build from a private S3 bucket using Origin Access Control (OAC).
- **Authentication and API:** Cognito handles Authorization Code + PKCE sign-in. API Gateway validates the ID token before invoking Task API Lambda, which checks task ownership.
- **Private data access:** Task API connects to a VPC with two private subnets, a security group, and a private route table. A DynamoDB Gateway Endpoint provides database access without a NAT Gateway.
- **Notifications and reminders:** DynamoDB Streams invokes Stream Processor to reconcile schedules and publish task updates. EventBridge Scheduler invokes Reminder at the scheduled time; both workers use a DynamoDB notification ledger before publishing to SNS. UserSetup provisions per-user topics after confirmed signup.

## Engineering Highlights

| Area | Implementation |
|---|---|
| Authentication & authorization | Cognito PKCE, a REST API authorizer, and task ownership checks protect user data. |
| Private connectivity | VPC-connected Task API uses private subnets and a DynamoDB Gateway Endpoint for database access. |
| Event-driven processing | DynamoDB Streams separates task writes from notification processing and schedule reconciliation. |
| Reminder consistency | Deterministic schedule names prevent multiple schedules per task; current-state and revision checks reject stale reminders. |
| Duplicate reduction | Conditional DynamoDB leases track processing; workers mark notifications DONE only after SNS publish succeeds. |
| Cost awareness | Serverless services and DynamoDB connectivity without a NAT Gateway keep the demo infrastructure small. |
