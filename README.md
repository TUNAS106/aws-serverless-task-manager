# AWS Serverless Task Manager

A serverless task management application with secure authentication, deadline tracking, and automated email reminders. Built with React, Python, and AWS.

[Live Demo](https://d2bbysp6jac78g.cloudfront.net/) · [Architecture](#architecture) · [Getting Started](#getting-started)

![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)
![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)
![AWS Serverless](https://img.shields.io/badge/AWS-Serverless-FF9900)

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

## Getting Started

### Run the frontend locally

Prerequisite: Node.js 24 and npm.

```bash
git clone https://github.com/TUNAS106/aws-serverless-task-manager.git
cd aws-serverless-task-manager/frontend
npm ci
npm run dev
```

Without a local environment override, the frontend uses browser-only demo data. This mode lets you explore the interface without AWS credentials and does not send email.

To connect to your AWS deployment, copy `frontend/.env.example` to `frontend/.env.local`, enter the public API and Cognito settings, and set `VITE_USE_MOCK=false`. Keep `.env.local` out of Git.

### Backend and deployment

The backend contains four Python 3.12 Lambda functions: **Task API**, **UserSetup**, **Stream Processor**, and **Reminder**. Deployment uses the AWS Console. Open `backend/build_packages.py` in VS Code and select **Run Python File** to generate the Lambda ZIP packages under `build/`.

- [Frontend configuration and Cognito integration](frontend/README.md)
- [Backend setup, IAM, deployment, and tests](backend/README.md)

## Current Limitations & Roadmap

- Notifications are asynchronous. The ledger reduces duplicates but cannot guarantee exactly-once delivery across SNS and DynamoDB.
- Expired sessions require signing in again; automatic token refresh is not implemented.
- CloudWatch dashboards and alarms, infrastructure as code, CI/CD, and a dead-letter queue are planned improvements.

Deployment notes, cost estimates, and local verification reports remain under the ignored `docs/` directory. Credentials, local environment files, dependencies, and build packages are excluded from Git.
