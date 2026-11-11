import Icon from './Icon'
import { STATUS, PRIORITY } from '../taskUtils'

export default function FilterBar({ filters, onChange }) {
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Icon name="search" size={17} />
        <input
          aria-label="Tìm công việc"
          placeholder="Tìm trong nhật ký…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
      <div className="filter-selects">
        <select
          aria-label="Lọc trạng thái"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
        >
          <option value="">Trạng thái</option>
          <option value="unfinished">Chưa hoàn thành</option>
          {Object.entries(STATUS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc độ ưu tiên"
          value={filters.priority}
          onChange={(e) => onChange({ ...filters, priority: e.target.value })}
        >
          <option value="">Độ ưu tiên</option>
          {Object.entries(PRIORITY).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc deadline"
          value={filters.due}
          onChange={(e) => onChange({ ...filters, due: e.target.value })}
        >
          <option value="">Deadline</option>
          <option value="overdue">Quá hạn</option>
          <option value="upcoming">Trong 24 giờ</option>
        </select>
      </div>
    </div>
  )
}
