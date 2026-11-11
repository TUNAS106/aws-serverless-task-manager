import { createDemoTasks } from '../data/demoTasks'
import { validateTask } from '../taskUtils'

export const isDemo = import.meta.env.VITE_USE_MOCK !== 'false'
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const storageKey = 'task-manager-demo-v1'

export async function apiRequest(path, { token, method = 'GET', body } = {}) {
  if (!baseUrl) throw new Error('Chưa cấu hình VITE_API_BASE_URL.')
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
      data?.error?.message ||
        data?.message ||
        `Yêu cầu thất bại (HTTP ${response.status}).`,
    )
    error.status = response.status
    error.code = data?.error?.code
    throw error
  }
  if (response.status !== 204 && data === null) {
    throw new Error(
      'API trả về dữ liệu không hợp lệ. Hãy tải lại danh sách để kiểm tra kết quả.',
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
      throw new Error('API trả về danh sách không hợp lệ.')
    items.push(...page.items)
    cursor = page.nextCursor
    if (cursor && visited.has(cursor))
      throw new Error('API trả về cursor lặp. Vui lòng thử lại.')
    visited.add(cursor)
  } while (cursor)
  return items
}

export async function getTask(taskId, token) {
  if (!isDemo)
    return apiRequest(`/tasks/${encodeURIComponent(taskId)}`, { token })
  const task = readDemo().find((item) => item.taskId === taskId)
  if (!task) {
    const error = new Error('Công việc đã bị xóa. Hãy tải lại danh sách.')
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
          'Chưa xác định được công việc đã tạo thành công hay chưa. Đóng form và tải lại danh sách trước khi tạo lại để tránh trùng.'
      }
      throw error
    }
  }
  const tasks = readDemo()
  const current =
    original && tasks.find((task) => task.taskId === original.taskId)
  if (original && (!current || current.version !== original.version)) {
    const error = new Error(
      'Công việc đã thay đổi ở tab khác. Hãy tải lại trước khi sửa.',
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
