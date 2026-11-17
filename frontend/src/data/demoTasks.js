export function createDemoTasks() {
  const now = Date.now()
  const examples = [
    [
      'Complete the Task Manager interface',
      'Review responsive layouts, test filters, and finish the task form.',
      'high',
      'in_progress',
      6,
      '1h',
    ],
    [
      'Create the AWS architecture diagram',
      'Document task management, change notifications, and scheduled reminders.',
      'high',
      'pending',
      20,
      '1h',
    ],
    [
      'Review DynamoDB Streams documentation',
      'Document retry behaviour and duplicate event handling.',
      'medium',
      'in_progress',
      -3,
      'none',
    ],
    [
      'Configure the Cognito user pool',
      'Create a public app client and configure the local callback URL.',
      'medium',
      'pending',
      48,
      '24h',
    ],
    [
      'Write the repository README',
      'Document local setup and key technical decisions.',
      'low',
      'pending',
      72,
      '24h',
    ],
    [
      'Set up React and Vite',
      'Prepare the frontend directory structure and environment variables.',
      'medium',
      'completed',
      -24,
      'none',
    ],
    [
      'Define the API contract',
      'Agree on schemas, HTTP status codes, and optimistic concurrency.',
      'high',
      'completed',
      -48,
      'none',
    ],
  ]
  return examples.map(
    ([title, description, priority, status, hours, reminderOption], index) => ({
      taskId: `demo-${index + 1}`,
      title,
      description,
      priority,
      status,
      reminderOption,
      dueAt: new Date(now + hours * 3600000).toISOString(),
      createdAt: new Date(now - index * 3600000).toISOString(),
      updatedAt: new Date(now).toISOString(),
      version: 1,
      reminderRevision: 1,
    }),
  )
}
