import Icon from './Icon'
import { formatDate } from '../taskUtils'

export default function JourneyPanels({
  total,
  completed,
  progress,
  nextTasks,
  isDemo,
  onEdit,
  onViewDeadlines,
}) {
  return (
    <aside className="right-column">
      <section className="progress-panel panel">
        <span className="eyebrow">COMPLETION RATE</span>
        <h2>Task progress</h2>
        <div
          className="progress-ring"
          style={{ '--progress': `${progress * 3.6}deg` }}
          role="img"
          aria-label={`${progress}% complete`}
        >
          <div>
            <strong>
              {progress}
              <small>%</small>
            </strong>
            <span>COMPLETE</span>
          </div>
        </div>
        <p>
          <strong>{completed}</strong> of <strong>{total}</strong> tasks
          completed
        </p>
        <div className="progress-note">
          <Icon name="flag" size={16} />
          <span>
            {progress === 100 && total
              ? 'All tasks completed.'
              : `${total - completed} ${total - completed === 1 ? 'task remaining' : 'tasks remaining'}.`}
          </span>
        </div>
      </section>
      <section className="deadline-panel panel">
        <div className="section-heading">
          <h2>
            <Icon name="clock" size={18} />
            Upcoming deadlines
          </h2>
        </div>
        {nextTasks.length ? (
          nextTasks.map((task, index) => (
            <button
              className="deadline-item"
              key={task.taskId}
              onClick={() => onEdit(task)}
            >
              <span className="deadline-number">0{index + 1}</span>
              <span>
                <strong>{task.title}</strong>
                <small>{formatDate(task.dueAt)}</small>
              </span>
              <i className={`deadline-dot ${task.priority}`} />
            </button>
          ))
        ) : (
          <p className="muted">No upcoming deadlines.</p>
        )}
        <button
          className="text-button deadline-link"
          onClick={() => onViewDeadlines()}
        >
          View all tasks
          <Icon name="arrow" size={15} />
        </button>
      </section>
      <div className="email-note">
        <Icon name="bell" size={19} />
        <p>
          {isDemo
            ? 'Demo data is stored in this browser. Email reminders are disabled.'
            : 'Confirm your email subscription to receive task notifications and reminders.'}
        </p>
      </div>
    </aside>
  )
}
