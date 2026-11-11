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
        <span className="eyebrow">NHÌN LẠI HÀNH TRÌNH</span>
        <h2>Tiến độ của bạn</h2>
        <div
          className="progress-ring"
          style={{ '--progress': `${progress * 3.6}deg` }}
          role="img"
          aria-label={`Hoàn thành ${progress}%`}
        >
          <div>
            <strong>
              {progress}
              <small>%</small>
            </strong>
            <span>HOÀN THÀNH</span>
          </div>
        </div>
        <p>
          <strong>{completed}</strong> trên <strong>{total}</strong> công việc
          đã hoàn thành
        </p>
        <div className="progress-note">
          <Icon name="flag" size={16} />
          <span>
            {progress === 100 && total
              ? 'Một hành trình trọn vẹn. Làm tốt lắm!'
              : 'Cứ tiến lên, theo nhịp của bạn.'}
          </span>
        </div>
      </section>
      <section className="deadline-panel panel">
        <div className="section-heading">
          <h2>
            <Icon name="clock" size={18} />
            Deadline gần nhất
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
          <p className="muted">Không có deadline nào phía trước.</p>
        )}
        <button
          className="text-button deadline-link"
          onClick={() => onViewDeadlines()}
        >
          Xem nhật ký công việc
          <Icon name="arrow" size={15} />
        </button>
      </section>
      <div className="email-note">
        <Icon name="bell" size={19} />
        <p>
          {isDemo
            ? 'Bạn đang dùng dữ liệu demo trên trình duyệt. Chế độ này không gửi email.'
            : 'Đừng quên xác nhận email đăng ký SNS để nhận thông báo và lời nhắc.'}
        </p>
      </div>
    </aside>
  )
}
