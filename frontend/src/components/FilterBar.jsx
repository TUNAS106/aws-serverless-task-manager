import Icon from './Icon'
import { STATUS, PRIORITY } from '../taskUtils'

export default function FilterBar({ filters, onChange }) {
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Icon name="search" size={17} />
        <input
          aria-label="Search tasks"
          placeholder="Search tasks…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
        />
      </label>
      <div className="filter-selects">
        <select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => onChange({ ...filters, status: e.target.value })}
        >
          <option value="">All statuses</option>
          <option value="unfinished">Incomplete</option>
          {Object.entries(STATUS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by priority"
          value={filters.priority}
          onChange={(e) => onChange({ ...filters, priority: e.target.value })}
        >
          <option value="">All priorities</option>
          {Object.entries(PRIORITY).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by deadline"
          value={filters.due}
          onChange={(e) => onChange({ ...filters, due: e.target.value })}
        >
          <option value="">All deadlines</option>
          <option value="overdue">Overdue</option>
          <option value="upcoming">Next 24 hours</option>
        </select>
      </div>
    </div>
  )
}
