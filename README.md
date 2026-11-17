# AWS Serverless Task Manager

A personal task management application with deadlines, priorities, status tracking, and email reminders. Built with React + Vite and Python on AWS serverless services. The interface is in English.

[Live Demo](https://d2bbysp6jac78g.cloudfront.net/) · [Source Code](https://github.com/TUNAS106/aws-serverless-task-manager)

## Features and architecture

- Create, view, update, delete, complete, and reopen tasks; search, filter, sort, and review task progress.
- Host React on private Amazon S3 with CloudFront Origin Access Control (OAC).
- Sign in using Amazon Cognito Authorization Code + PKCE; protect API Gateway REST endpoints with a Cognito authorizer.
- Run four Python Lambda functions: Task API, UserSetup, Stream Processor, and Reminder. Store tasks and notification records in separate DynamoDB tables.
- Connect the Task API Lambda to a custom VPC with two private subnets, a private route table, a security group, and a DynamoDB Gateway Endpoint. Access DynamoDB without a NAT Gateway; use separate IAM execution roles.
- Process task changes with DynamoDB Streams, send email through per-user SNS topics, and reconcile reminders with EventBridge Scheduler. Check task ownership, versions, and reminder revisions; use a conditional ledger to reduce duplicate notifications during retries.

## Local development

Use Node.js 24. From the `frontend` folder:

```bash
npm ci
npm run dev
```

Without a local ENV override, the app uses browser-only demo data and does not send email. To connect AWS, copy `frontend/.env.example` to `frontend/.env.local`, enter your deployment settings, and set `VITE_USE_MOCK=false`. See the frontend guide for Cognito and CORS configuration.

The backend targets Lambda Python 3.12. Local test setup and deployment instructions are in the backend guide.

## Documentation

- [Frontend setup and AWS integration](frontend/README.md)
- [Backend setup, IAM, Console deployment, and tests](backend/README.md)

Deployment notes, example IAM policies, cost estimates, and verification reports are kept locally under `docs/` and excluded from this repository.

Open `backend/build_packages.py` in VS Code and select Run Python File to create four Lambda ZIPs under `build/`. Build outputs, local ENV files, credentials, dependencies, and ZIPs are excluded from Git. Deploy through AWS Console using the guides.

## Status and limitations

The application is deployed to AWS. Local verification reports document source checks; the latest source review does not re-run live AWS acceptance tests. CloudWatch dashboards, alarms, and further monitoring improvements are planned for a later phase.

Notifications are asynchronous. Confirm the SNS email subscription before testing email delivery. The ledger reduces duplicates but cannot guarantee exactly-once delivery across SNS and DynamoDB. The project does not yet include IaC, CI/CD, a DLQ, or automatic token refresh.
