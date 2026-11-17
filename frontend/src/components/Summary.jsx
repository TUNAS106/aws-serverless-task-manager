import Icon from './Icon'

export default function Summary({
  total,
  completed,
  overdue,
  loading,
  onSelect,
}) {
  return (
    <section className="stats" aria-label="Task summary">
      {[
        ['all', 'Total tasks', total, 'book', 'All tasks in your workspace'],
        [
          'unfinished',
          'Incomplete',
          total - completed,
          'flag',
          'Not started or in progress',
        ],
        ['overdue', 'Overdue', overdue, 'clock', 'Past the deadline'],
        [
          'completed',
          'Completed',
          completed,
          'check',
          'Tasks marked as complete',
        ],
      ].map(([id, label, count, icon, caption]) => (
        <button
          key={id}
          className={`stat-card ${id}`}
          onClick={() => onSelect(id)}
        >
          <div className="stat-top">
            <span>{label}</span>
            <Icon name={icon} size={19} />
          </div>
          <strong>{loading ? '—' : String(count).padStart(2, '0')}</strong>
          <p>{caption}</p>
        </button>
      ))}
    </section>
  )
}
