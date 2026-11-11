import Icon from './Icon'

export default function Summary({
  total,
  completed,
  overdue,
  loading,
  onSelect,
}) {
  return (
    <section className="stats" aria-label="Tổng quan công việc">
      {[
        ['all', 'Tổng công việc', total, 'book', 'Mọi hành trình của bạn'],
        [
          'unfinished',
          'Chưa hoàn thành',
          total - completed,
          'flag',
          'Từng bước tiến về phía trước',
        ],
        ['overdue', 'Đã quá hạn', overdue, 'clock', 'Cần một chút chú ý'],
        [
          'completed',
          'Đã hoàn thành',
          completed,
          'check',
          'Những dấu mốc đã chinh phục',
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
