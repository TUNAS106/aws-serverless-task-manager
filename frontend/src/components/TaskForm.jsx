import { useState } from 'react'
import {
  STATUS,
  PRIORITY,
  REMINDER,
  toLocalInput,
  resolveDueAt,
  validateTask,
  formatDate,
} from '../taskUtils'
import Icon from './Icon'

export default function TaskForm({ task, now, onSave, onClose, busy }) {
  const [values, setValues] = useState(() => ({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'medium',
    status: task?.status || 'pending',
    dueLocal: toLocalInput(task?.dueAt || now + 86400000),
    reminderOption: task?.reminderOption || 'none',
  }))
  const [error, setError] = useState('')
  function change(event) {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  async function submit(event) {
    event.preventDefault()
    // datetime-local shows minutes. Keep original seconds when the user did not edit it.
    const dueAt = resolveDueAt(values.dueLocal, task?.dueAt)
    const payload = {
      title: values.title.trim(),
      description: values.description,
      priority: values.priority,
      status: values.status,
      dueAt,
      reminderOption: values.reminderOption,
    }
    const message = validateTask(payload, task)
    if (message) {
      setError(message)
      return
    }
    try {
      await onSave(payload, task)
    } catch (err) {
      setError(err.message)
    }
  }
  const oldReminderPassed =
    task &&
    task.reminderOption !== 'none' &&
    new Date(task.dueAt).getTime() -
      { '1h': 3600000, '24h': 86400000 }[task.reminderOption] <=
      now
  return (
    <form onSubmit={submit} className="task-form">
      <fieldset disabled={busy}>
        <label>
          Task title <span className="required">*</span>
          <input
            name="title"
            value={values.title}
            onChange={change}
            maxLength={120}
            required
            placeholder="Enter a task title"
            autoFocus
          />
        </label>
        <label>
          Description
          <textarea
            name="description"
            value={values.description}
            onChange={change}
            maxLength={1000}
            rows={3}
            placeholder="Add details or notes…"
          />
          <span className="field-help">
            {values.description.length}/1,000 characters
          </span>
        </label>
        <div className="form-grid">
          <label>
            Priority
            <select name="priority" value={values.priority} onChange={change}>
              {Object.entries(PRIORITY).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {task && (
            <label>
              Status
              <select name="status" value={values.status} onChange={change}>
                {Object.entries(STATUS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <label>
          Deadline <span className="required">*</span>
          <input
            type="datetime-local"
            name="dueLocal"
            value={values.dueLocal}
            onChange={change}
            required
          />
          <span className="field-help">
            Time zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </span>
        </label>
        <label>
          Email reminder
          <select
            name="reminderOption"
            value={values.reminderOption}
            onChange={change}
          >
            {Object.entries(REMINDER).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {oldReminderPassed && (
          <p className="notice">
            The reminder time has passed. Change the deadline or reminder to
            schedule a new one. You can still edit task details and status.
          </p>
        )}
        {task && (
          <p className="field-help">
            Last updated: {formatDate(task.updatedAt)} · Version{' '}
            {task.version}
          </p>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="feedback error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          <Icon name="check" size={17} />
          {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </button>
      </div>
    </form>
  )
}
