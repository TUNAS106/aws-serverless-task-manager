export const STATUS = {
  pending: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
}
export const PRIORITY = { high: 'High', medium: 'Medium', low: 'Low' }
export const REMINDER = {
  none: 'No reminder',
  '1h': '1 hour before',
  '24h': '24 hours before',
}

export function isOverdue(task, now = Date.now()) {
  return task.status !== 'completed' && new Date(task.dueAt).getTime() < now
}

export function isUpcoming(task, now = Date.now()) {
  const remaining = new Date(task.dueAt).getTime() - now
  return task.status !== 'completed' && remaining >= 0 && remaining <= 86400000
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function toLocalInput(value) {
  const date = new Date(value)
  const pad = (number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function resolveDueAt(localValue, original) {
  if (original && localValue === toLocalInput(original)) return original
  const date = new Date(localValue)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

// Keep time validation in one place for the form and the local demo service.
export function validateTask(values, original, now = Date.now()) {
  if (!values.title.trim() || values.title.trim().length > 120)
    return 'Task title must be between 1 and 120 characters.'
  if (values.description.length > 1000)
    return 'Description must not exceed 1,000 characters.'
  if (
    !PRIORITY[values.priority] ||
    !STATUS[values.status] ||
    !REMINDER[values.reminderOption]
  )
    return 'Select a valid status, priority, and reminder option.'
  const due = new Date(values.dueAt).getTime()
  if (!Number.isFinite(due)) return 'Enter a valid date and time.'
  const dueChanged = !original || due !== new Date(original.dueAt).getTime()
  if (dueChanged && due <= now) return 'The new deadline must be in the future.'
  const reminderChanged =
    !original || dueChanged || values.reminderOption !== original.reminderOption
  const offset = { '1h': 3600000, '24h': 86400000 }[values.reminderOption]
  if (reminderChanged && offset && due - offset <= now)
    return 'The reminder time has passed. Choose a later deadline or a different reminder.'
  return ''
}

export function editableFields(task) {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    dueAt: task.dueAt,
    reminderOption: task.reminderOption,
  }
}
