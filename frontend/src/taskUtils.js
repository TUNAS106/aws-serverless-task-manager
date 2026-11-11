export const STATUS = {
  pending: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  completed: 'Hoàn thành',
}
export const PRIORITY = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
export const REMINDER = {
  none: 'Không nhắc',
  '1h': 'Trước 1 giờ',
  '24h': 'Trước 24 giờ',
}

export function isOverdue(task, now = Date.now()) {
  return task.status !== 'completed' && new Date(task.dueAt).getTime() < now
}

export function isUpcoming(task, now = Date.now()) {
  const remaining = new Date(task.dueAt).getTime() - now
  return task.status !== 'completed' && remaining >= 0 && remaining <= 86400000
}

export function formatDate(value) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
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
    return 'Tên công việc cần có từ 1 đến 120 ký tự.'
  if (values.description.length > 1000)
    return 'Mô tả không được vượt quá 1.000 ký tự.'
  if (
    !PRIORITY[values.priority] ||
    !STATUS[values.status] ||
    !REMINDER[values.reminderOption]
  )
    return 'Lựa chọn không hợp lệ.'
  const due = new Date(values.dueAt).getTime()
  if (!Number.isFinite(due)) return 'Vui lòng nhập ngày và giờ hợp lệ.'
  const dueChanged = !original || due !== new Date(original.dueAt).getTime()
  if (dueChanged && due <= now) return 'Deadline mới phải nằm trong tương lai.'
  const reminderChanged =
    !original || dueChanged || values.reminderOption !== original.reminderOption
  const offset = { '1h': 3600000, '24h': 86400000 }[values.reminderOption]
  if (reminderChanged && offset && due - offset <= now)
    return 'Giờ nhắc đã qua. Hãy chọn deadline xa hơn hoặc thay lựa chọn nhắc.'
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
