import test from 'node:test'
import assert from 'node:assert/strict'
import {
  validateTask,
  isOverdue,
  isUpcoming,
  toLocalInput,
  resolveDueAt,
} from '../src/taskUtils.js'

const now = Date.parse('2026-11-10T10:00:00Z')
const task = {
  title: 'Viết README',
  description: '',
  priority: 'medium',
  status: 'pending',
  dueAt: '2026-11-10T12:00:37Z',
  reminderOption: '1h',
}

test('creation validates title length and enum values', () => {
  assert.equal(validateTask(task, null, now), '')
  for (const patch of [
    { title: '   ' },
    { title: 'x'.repeat(121) },
    { description: 'x'.repeat(1001) },
    { priority: 'urgent' },
    { status: 'overdue' },
    { reminderOption: '5m' },
  ]) {
    assert.ok(validateTask({ ...task, ...patch }, null, now))
  }
})

test('new deadlines and reminders must be strictly in the future', () => {
  for (const dueAt of [
    'invalid',
    '2026-11-10T10:00:00Z',
    '2026-11-09T10:00:00Z',
  ]) {
    assert.ok(validateTask({ ...task, dueAt }, null, now))
  }
  assert.ok(validateTask({ ...task, reminderOption: '24h' }, null, now))
  assert.ok(validateTask({ ...task, dueAt: '2026-11-10T11:00:00Z' }, null, now))
})

test('historical reminder allows content edits, completing and reopening', () => {
  const later = Date.parse('2026-11-11T10:00:00Z')
  for (const status of ['pending', 'in_progress', 'completed']) {
    assert.equal(
      validateTask({ ...task, title: 'Đổi tên', status }, task, later),
      '',
    )
  }
  assert.ok(validateTask({ ...task, reminderOption: '24h' }, task, later))
  assert.equal(
    validateTask({ ...task, reminderOption: 'none' }, task, later),
    '',
  )
})

test('upcoming means next 24 hours, excluding completed and overdue', () => {
  assert.equal(isUpcoming(task, now), true)
  assert.equal(
    isUpcoming({ ...task, dueAt: new Date(now + 86400000).toISOString() }, now),
    true,
  )
  assert.equal(
    isUpcoming({ ...task, dueAt: new Date(now + 86400001).toISOString() }, now),
    false,
  )
  assert.equal(
    isUpcoming({ ...task, dueAt: new Date(now - 1).toISOString() }, now),
    false,
  )
  assert.equal(isUpcoming({ ...task, status: 'completed' }, now), false)
})

test('overdue does not apply to completed tasks', () => {
  const later = Date.parse('2026-11-11T10:00:00Z')
  assert.equal(isOverdue(task, later), true)
  assert.equal(isOverdue({ ...task, status: 'completed' }, later), false)
})

test('local input follows timezone and preserves unedited deadline seconds', () => {
  const value = toLocalInput(task.dueAt)
  assert.equal(new Date(value).getHours(), new Date(task.dueAt).getHours())
  assert.equal(resolveDueAt(value, task.dueAt), task.dueAt)
  assert.equal(resolveDueAt(''), '')
  assert.equal(
    resolveDueAt('2026-11-12T16:00'),
    new Date('2026-11-12T16:00').toISOString(),
  )
})
