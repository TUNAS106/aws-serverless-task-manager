import Icon from './Icon'
import { STATUS, PRIORITY, REMINDER, formatDate, isOverdue } from '../taskUtils'

export default function TaskRow({
  task,
  onEdit,
  onDelete,
  onToggle,
  busy,
  now,
}) {
  const overdue = isOverdue(task, now)
  return (
    <article
      className={`task-row ${task.status === 'completed' ? 'is-completed' : ''}`}
    >
      <button
        className={`task-check ${task.status === 'completed' ? 'checked' : ''}`}
        onClick={() => onToggle(task)}
        disabled={busy}
        aria-label={`${task.status === 'completed' ? 'Mở lại' : 'Hoàn thành'}: ${task.title}`}
      >
        {task.status === 'completed' && <Icon name="check" size={15} />}
      </button>
      <div className="task-content">
        <button
          className="task-title"
          onClick={() => onEdit(task)}
          disabled={busy}
        >
          {task.title}
        </button>
        <p>{task.description || 'Chưa có mô tả.'}</p>
        <div className="task-meta">
          <span className={overdue ? 'overdue-text' : ''}>
            <Icon name="clock" size={14} />
            {formatDate(task.dueAt)}
            {overdue && ' · Quá hạn'}
          </span>
          {task.reminderOption !== 'none' && (
            <span>
              <Icon name="bell" size={14} />
              {REMINDER[task.reminderOption]}
            </span>
          )}
        </div>
      </div>
      <div className="task-tags">
        <span className={`priority ${task.priority}`}>
          <i />
          {PRIORITY[task.priority]}
        </span>
        <span className={`status ${task.status}`}>{STATUS[task.status]}</span>
      </div>
      <div className="row-actions">
        <button
          className="icon-button"
          onClick={() => onEdit(task)}
          disabled={busy}
          aria-label={`Sửa: ${task.title}`}
        >
          <Icon name="edit" size={17} />
        </button>
        <button
          className="icon-button danger"
          onClick={() => onDelete(task)}
          disabled={busy}
          aria-label={`Xóa: ${task.title}`}
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
    </article>
  )
}
