import { createDemoTasks } from '../data/demoTasks'
import { validateTask } from '../taskUtils'

export const isDemo = import.meta.env.VITE_USE_MOCK !== 'false'
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const storageKey = 'task-manager-demo-v1'

// Keep API feedback in English, including responses from the existing backend.
const errorMessages = {
  VALIDATION_ERROR: 'Check the task details and try again.',
  INVALID_DEADLINE: 'The new deadline must be in the future.',
  REMINDER_TIME_PASSED: 'The reminder time must be in the future.',
  TASK_NOT_FOUND: 'Task not found. Refresh the list.',
  VERSION_CONFLICT:
    'This task was updated elsewhere. Refresh the list before editing.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  NOT_FOUND: 'The requested resource was not found.',
  INTERNAL_ERROR: 'Something went wrong. Please try again later.',
}

export async function apiRequest(path, { token, method = 'GET', body } = {}) {
  if (!baseUrl) throw new Error('Unable to connect. The API URL is not configured.')
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  let data
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const error = new Error(
      errorMessages[data?.error?.code] ||
        (response.status === 429
          ? 'Too many requests. Please wait a moment and try again.'
          : `Request failed (HTTP ${response.status}). Please try again.`),
    )
    error.status = response.status
    error.code = data?.error?.code
    throw error
  }
  if (response.status !== 204 && data === null) {
    throw new Error(
      'The server returned an invalid response. Refresh the task list to check the result.',
    )
  }
  return data
}

function readDemo() {
  const saved = localStorage.getItem(storageKey)
  if (saved !== null) return JSON.parse(saved)
  const tasks = createDemoTasks()
  writeDemo(tasks)
  return tasks
}

function writeDemo(tasks) {
  localStorage.setItem(storageKey, JSON.stringify(tasks))
}

export async function listTasks(token) {
  if (isDemo) return readDemo()
  const items = []
  const visited = new Set()
  let cursor = null
  do {
    const page = await apiRequest(
      `/tasks?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      { token },
    )
    if (!Array.isArray(page?.items))
      throw new Error('The server returned an invalid task list.')
    items.push(...page.items)
    cursor = page.nextCursor
    if (cursor && visited.has(cursor))
      throw new Error('The server returned a repeated page. Please try again.')
    visited.add(cursor)
  } while (cursor)
  return items
}

export async function getTask(taskId, token) {
  if (!isDemo)
    return apiRequest(`/tasks/${encodeURIComponent(taskId)}`, { token })
  const task = readDemo().find((item) => item.taskId === taskId)
  if (!task) {
    const error = new Error('This task has been deleted. Refresh the list.')
    error.status = 404
    throw error
  }
  return task
}

export async function saveTask(values, original, token) {
  const body = { ...values }
  if (original) body.expectedVersion = original.version
  else delete body.status // POST creates pending tasks; status is a server default.
  if (!isDemo) {
    try {
      return await apiRequest(
        original ? `/tasks/${encodeURIComponent(original.taskId)}` : '/tasks',
        { token, method: original ? 'PUT' : 'POST', body },
      )
    } catch (error) {
      if (!original && (!error.status || error.status >= 500)) {
        error.message =
          'The task may have been created. Close this form and refresh the list before trying again to avoid duplicates.'
      }
      throw error
    }
  }
  const tasks = readDemo()
  const current =
    original && tasks.find((task) => task.taskId === original.taskId)
  if (original && (!current || current.version !== original.version)) {
    const error = new Error(
      'This task was updated in another tab. Refresh the list before editing.',
    )
    error.status = current ? 409 : 404
    throw error
  }
  const validation = validateTask(values, current)
  if (validation) throw new Error(validation)
  const now = new Date().toISOString()
  const reminderChanged =
    !current ||
    current.dueAt !== values.dueAt ||
    current.reminderOption !== values.reminderOption ||
    (current.status === 'completed') !== (values.status === 'completed')
  const task = {
    ...current,
    ...values,
    taskId: current?.taskId || crypto.randomUUID(),
    createdAt: current?.createdAt || now,
    updatedAt: now,
    version: (current?.version || 0) + 1,
    reminderRevision:
      (current?.reminderRevision || 0) + Number(reminderChanged),
  }
  writeDemo(
    current
      ? tasks.map((item) => (item.taskId === task.taskId ? task : item))
      : [task, ...tasks],
  )
  return task
}

export async function deleteTask(taskId, token) {
  if (!isDemo)
    return apiRequest(`/tasks/${encodeURIComponent(taskId)}`, {
      token,
      method: 'DELETE',
    })
  writeDemo(readDemo().filter((task) => task.taskId !== taskId))
}
