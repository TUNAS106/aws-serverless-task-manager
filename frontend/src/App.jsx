import { useEffect, useState } from 'react'
import Icon from './components/Icon'
import Modal from './components/Modal'
import TaskForm from './components/TaskForm'
import TaskRow from './components/TaskRow'
import Summary from './components/Summary'
import FilterBar from './components/FilterBar'
import JourneyPanels from './components/JourneyPanels'
import {
  isDemo,
  listTasks,
  getTask,
  saveTask,
  deleteTask,
} from './services/api'
import { restoreSession, login, logout } from './auth/cognito'
import { isOverdue, isUpcoming, editableFields } from './taskUtils'
import './App.css'

const navigation = [
  { id: 'all', label: 'Tất cả công việc', icon: 'book' },
  { id: 'active', label: 'Đang thực hiện', icon: 'flag' },
  { id: 'upcoming', label: 'Sắp đến hạn', icon: 'clock' },
  { id: 'completed', label: 'Đã hoàn thành', icon: 'check' },
]
const emptyFilters = { search: '', status: '', priority: '', due: '' }

function Crest({ large = false }) {
  return (
    <div className={`crest ${large ? 'large' : ''}`} aria-hidden="true">
      <Icon name="shield" size={large ? 74 : 26} />
    </div>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(!isDemo)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(isDemo)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [view, setView] = useState('all')
  const [filters, setFilters] = useState(emptyFilters)
  const [sort, setSort] = useState('created')
  const [modal, setModal] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  const token = session?.id_token
  const canUseApp = isDemo || Boolean(session)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (isDemo) return
    let active = true
    restoreSession()
      .then((user) => {
        if (active) {
          setLoading(Boolean(user))
          setSession(user)
          if (user)
            setFeedback({
              type: 'success',
              message:
                'Đã đăng nhập. Nếu vừa đăng ký, hãy mở email từ AWS Notifications và bấm Confirm subscription để nhận thông báo công việc.',
            })
        }
      })
      .catch((error) => {
        if (active) setFeedback({ type: 'error', message: error.message })
      })
      .finally(() => {
        if (active) setAuthLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const remaining = session.expires_at * 1000 - Date.now()
    const timer = setTimeout(
      () => {
        setSession(null)
        setTasks([])
        setModal(null)
        setFeedback({
          type: 'error',
          message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
        })
      },
      Math.max(0, remaining),
    )
    return () => clearTimeout(timer)
  }, [session])

  function reportError(error) {
    if (error.status === 401) {
      setSession(null)
      setTasks([])
      setModal(null)
      setFeedback({
        type: 'error',
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      })
    } else {
      if (error.status === 409) setModal(null)
      setFeedback({
        type: 'error',
        message:
          error.status === 409
            ? 'Công việc đã thay đổi ở nơi khác. Bấm Tải lại, rồi mở lại công việc để sửa.'
            : error.message,
      })
    }
  }

  useEffect(() => {
    if (!canUseApp) return
    let active = true
    listTasks(token)
      .then((items) => {
        if (active) setTasks(items)
      })
      .catch((error) => {
        if (active) setFeedback({ type: 'error', message: error.message })
        if (active && error.status === 401) {
          setSession(null)
          setTasks([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, canUseApp])

  function selectSummary(id) {
    navigate(id === 'completed' ? 'completed' : 'all')
    if (id === 'overdue') setFilters({ ...emptyFilters, due: 'overdue' })
    if (id === 'unfinished')
      setFilters({ ...emptyFilters, status: 'unfinished' })
  }

  async function reload() {
    setLoading(true)
    setFeedback(null)
    try {
      setTasks(await listTasks(token))
    } catch (error) {
      reportError(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(values, original) {
    setBusy(true)
    try {
      const saved = await saveTask(values, original, token)
      setTasks((current) =>
        original
          ? current.map((task) => (task.taskId === saved.taskId ? saved : task))
          : [saved, ...current],
      )
      setModal(null)
      setFeedback({
        type: 'success',
        message: original
          ? 'Đã lưu thay đổi công việc.'
          : 'Đã thêm công việc vào nhật ký.',
      })
    } catch (error) {
      reportError(error)
      throw error
    } finally {
      setBusy(false)
    }
  }

  async function openTask(task) {
    if (busy || loading) return
    setBusy(true)
    try {
      const latest = await getTask(task.taskId, token)
      setTasks((current) =>
        current.map((item) => (item.taskId === latest.taskId ? latest : item)),
      )
      setModal({ type: 'form', task: latest })
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function toggleTask(task) {
    try {
      await handleSave(
        {
          ...editableFields(task),
          status: task.status === 'completed' ? 'pending' : 'completed',
        },
        task,
      )
    } catch {
      /* Feedback is displayed by handleSave. */
    }
  }

  async function confirmDelete() {
    setBusy(true)
    try {
      await deleteTask(modal.task.taskId, token)
      setTasks((current) =>
        current.filter((task) => task.taskId !== modal.task.taskId),
      )
      setModal(null)
      setFeedback({ type: 'success', message: 'Đã xóa công việc.' })
    } catch (error) {
      reportError(error)
    } finally {
      setBusy(false)
    }
  }

  async function authenticate(action) {
    try {
      await action()
    } catch (error) {
      reportError(error)
    }
  }

  function navigate(next) {
    setView(next)
    setFilters(emptyFilters)
  }
  const completed = tasks.filter((task) => task.status === 'completed').length
  const overdue = tasks.filter((task) => isOverdue(task, now)).length
  const upcoming = tasks.filter((task) => isUpcoming(task, now)).length
  const counts = {
    all: tasks.length,
    active: tasks.filter((task) => task.status === 'in_progress').length,
    upcoming,
    completed,
  }
  const progress = tasks.length
    ? Math.round((completed / tasks.length) * 100)
    : 0
  const visible = tasks
    .filter((task) => {
      if (view === 'active' && task.status !== 'in_progress') return false
      if (view === 'completed' && task.status !== 'completed') return false
      if (view === 'upcoming' && !isUpcoming(task, now)) return false
      if (
        filters.status === 'unfinished'
          ? task.status === 'completed'
          : filters.status && task.status !== filters.status
      )
        return false
      if (filters.priority && task.priority !== filters.priority) return false
      if (filters.due === 'overdue' && !isOverdue(task, now)) return false
      if (filters.due === 'upcoming' && !isUpcoming(task, now)) return false
      return `${task.title} ${task.description}`
        .toLocaleLowerCase('vi')
        .includes(filters.search.trim().toLocaleLowerCase('vi'))
    })
    .sort((a, b) =>
      sort === 'due'
        ? new Date(a.dueAt) - new Date(b.dueAt)
        : sort === 'priority'
          ? ['high', 'medium', 'low'].indexOf(a.priority) -
            ['high', 'medium', 'low'].indexOf(b.priority)
          : new Date(b.createdAt) - new Date(a.createdAt),
    )
  const nextTasks = tasks
    .filter(
      (task) =>
        task.status !== 'completed' && new Date(task.dueAt).getTime() > now,
    )
    .sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt))
    .slice(0, 3)
  const hasFilters = Object.values(filters).some(Boolean) || view !== 'all'
  const displayName = isDemo
    ? 'Nhà thám hiểm'
    : session?.profile?.name ||
      session?.profile?.email?.split('@')[0] ||
      'Nhà thám hiểm'
  const dateLabel = new Intl.DateTimeFormat('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="./" aria-label="Task Manager — trang chủ">
          <Crest />
          <span>
            TASK<span className="brand-second">MANAGER</span>
          </span>
        </a>
        <div className="sidebar-section-label">NHẬT KÝ CỦA BẠN</div>
        <nav aria-label="Danh mục công việc">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'selected' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
              <span className="nav-count">
                {canUseApp ? counts[item.id] : '—'}
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-quote">
          <span className="small-star">✧</span>
          <p>
            Hành trình vạn dặm
            <br />
            bắt đầu từ một bước chân.
          </p>
          <span className="quote-line" />
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => setModal({ type: 'help' })}
          >
            <Icon name="help" size={19} />
            Hướng dẫn sử dụng
          </button>
          <div className="profile">
            <div className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{displayName}</strong>
              <span>
                {isDemo
                  ? 'Chế độ trải nghiệm'
                  : session?.profile?.email || 'Chưa đăng nhập'}
              </span>
            </div>
            {session && (
              <button
                className="icon-button"
                aria-label="Đăng xuất"
                onClick={() => authenticate(logout)}
              >
                <Icon name="logout" size={18} />
              </button>
            )}
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="grid" size={16} />
            <span>Không gian cá nhân</span>
            <span className="slash">/</span>
            <strong>Nhật ký công việc</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Hướng dẫn sử dụng"
              onClick={() => setModal({ type: 'help' })}
            >
              <Icon name="help" size={18} />
            </button>
            {session && (
              <button
                className="icon-button"
                aria-label="Đăng xuất tài khoản"
                onClick={() => authenticate(logout)}
              >
                <Icon name="logout" size={18} />
              </button>
            )}
            <span className={`mode-badge ${isDemo ? '' : 'live'}`}>
              <i />
              {isDemo ? 'BẢN DEMO' : 'CLOUD'}
            </span>
            {!isDemo && !session && (
              <button
                className="button secondary compact"
                onClick={() => authenticate(login)}
              >
                Đăng nhập
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MỖI NGÀY, MỘT BƯỚC TIẾN</p>
              <h1>
                Nhật ký công việc<span className="heading-star">✧</span>
              </h1>
              <p className="page-subtitle">
                Sắp xếp những điều cần làm. Dành tâm trí cho điều quan trọng.
              </p>
            </div>
            <div className="today">
              <Icon name="sun" size={18} />
              <span>{dateLabel}</span>
            </div>
          </div>

          {feedback && (
            <div
              className={`feedback ${feedback.type}`}
              role={feedback.type === 'error' ? 'alert' : 'status'}
            >
              <span>{feedback.message}</span>
              <div>
                {feedback.type === 'error' && canUseApp && (
                  <button onClick={reload} disabled={loading || busy}>
                    Tải lại
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Đóng thông báo"
                  onClick={() => setFeedback(null)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          )}

          {!canUseApp ? (
            <section className="welcome panel">
              <Crest large />
              <p className="eyebrow">HÀNH TRÌNH CỦA RIÊNG BẠN</p>
              <h2>Một nơi cho mọi công việc.</h2>
              <p>
                Đăng nhập để quản lý công việc, theo dõi deadline và nhận nhắc
                nhở qua email.
              </p>
              <button
                className="button primary"
                disabled={authLoading}
                onClick={() => authenticate(login)}
              >
                <Icon name="shield" />
                {authLoading ? 'Đang kiểm tra phiên…' : 'Đăng nhập / Đăng ký'}
              </button>
              <p className="muted">
                Tài khoản được quản lý qua Amazon Cognito.
              </p>
            </section>
          ) : (
            <>
              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="eyebrow">CHƯƠNG MỚI ĐANG CHỜ BẠN</span>
                  <h2>
                    Từng việc nhỏ.
                    <br />
                    <em>Thành tựu lớn.</em>
                  </h2>
                  <p>
                    {overdue
                      ? `Có ${overdue} công việc cần bạn quay lại. Chọn một việc và tiếp tục hành trình.`
                      : 'Một mục tiêu rõ ràng là khởi đầu của một ngày ý nghĩa.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'form' })}
                  >
                    <Icon name="plus" size={18} />
                    Thêm công việc
                    <Icon name="arrow" size={17} />
                  </button>
                </div>
                <div className="hero-emblem" aria-hidden="true">
                  <span className="orbit orbit-one" />
                  <span className="orbit orbit-two" />
                  <span className="emblem-star star-one">✦</span>
                  <span className="emblem-star star-two">✧</span>
                  <span className="emblem-star star-three">✧</span>
                  <Crest large />
                  <span className="emblem-caption">
                    FOCUS · PURPOSE · PROGRESS
                  </span>
                </div>
                <div className="hero-corner">I</div>
              </section>

              <Summary
                total={tasks.length}
                completed={completed}
                overdue={overdue}
                loading={loading}
                onSelect={selectSummary}
              />

              <div className="content-grid">
                <section className="task-panel panel" aria-busy={loading}>
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">CUỐN SỔ HÀNH TRÌNH</span>
                      <h2>
                        {navigation.find((item) => item.id === view)?.label}
                        <span className="count-badge">{visible.length}</span>
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      title="Tải lại danh sách"
                      aria-label="Tải lại danh sách"
                      onClick={reload}
                      disabled={loading || busy}
                    >
                      <Icon name="refresh" size={18} />
                    </button>
                  </div>
                  <FilterBar filters={filters} onChange={setFilters} />
                  <div className="list-toolbar">
                    <span>
                      {loading
                        ? 'Đang tải nhật ký…'
                        : `${visible.length} công việc`}
                      {hasFilters && (
                        <button
                          className="text-button"
                          onClick={() => navigate('all')}
                        >
                          Xóa bộ lọc
                        </button>
                      )}
                    </span>
                    <label>
                      Sắp xếp:
                      <select
                        aria-label="Sắp xếp công việc"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="created">Mới nhất</option>
                        <option value="due">Deadline gần nhất</option>
                        <option value="priority">Ưu tiên cao</option>
                      </select>
                    </label>
                  </div>
                  {loading ? (
                    <div className="loading-state" role="status">
                      <span className="loader" />
                      Đang mở cuốn sổ của bạn…
                    </div>
                  ) : visible.length ? (
                    <div className="task-list">
                      {visible.map((task) => (
                        <TaskRow
                          key={task.taskId}
                          task={task}
                          now={now}
                          busy={busy}
                          onEdit={openTask}
                          onDelete={(task) =>
                            setModal({ type: 'delete', task })
                          }
                          onToggle={toggleTask}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Icon name="book" size={36} />
                      <h3>
                        {hasFilters
                          ? 'Chưa tìm thấy công việc'
                          : 'Một trang mới đang chờ'}
                      </h3>
                      <p>
                        {hasFilters
                          ? 'Thử đổi từ khóa hoặc bỏ bớt bộ lọc.'
                          : 'Thêm công việc đầu tiên để bắt đầu hành trình.'}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          hasFilters
                            ? navigate('all')
                            : setModal({ type: 'form' })
                        }
                      >
                        {hasFilters ? 'Xóa bộ lọc' : 'Thêm công việc'}
                      </button>
                    </div>
                  )}
                  <div className="list-footer">
                    <span className="small-star">✧</span>
                    <span>Mỗi dấu tích là một bước tiến.</span>
                    <span className="small-star">✧</span>
                  </div>
                </section>

                <JourneyPanels
                  total={tasks.length}
                  completed={completed}
                  progress={progress}
                  nextTasks={nextTasks}
                  isDemo={isDemo}
                  onEdit={openTask}
                  onViewDeadlines={() => {
                    navigate('all')
                    setSort('due')
                  }}
                />
              </div>
            </>
          )}
          <footer className="page-footer">
            <span>TASK MANAGER</span>
            <span>Một chút ngăn nắp. Nhiều khoảng thảnh thơi.</span>
            <span>✧</span>
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal.type === 'form'
              ? modal.task
                ? 'Chi tiết công việc'
                : 'Thêm công việc mới'
              : modal.type === 'delete'
                ? 'Xóa công việc?'
                : 'Hướng dẫn sử dụng'
          }
          onClose={() => setModal(null)}
          busy={busy}
        >
          {modal.type === 'form' && (
            <TaskForm
              task={modal.task}
              now={now}
              onSave={handleSave}
              onClose={() => setModal(null)}
              busy={busy}
            />
          )}
          {modal.type === 'delete' && (
            <>
              <p className="delete-message">
                Bạn sắp xóa <strong>“{modal.task.title}”</strong>. Thao tác này
                không thể hoàn tác.
                {!isDemo && ' Hệ thống sẽ xử lý hủy lịch nhắc liên quan.'}
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Giữ lại
                </button>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={confirmDelete}
                >
                  <Icon name="trash" size={17} />
                  {busy ? 'Đang xóa…' : 'Xóa công việc'}
                </button>
              </div>
            </>
          )}
          {modal.type === 'help' && (
            <div className="help-content">
              <p>
                Ghi lại công việc cùng deadline, độ ưu tiên và lựa chọn nhắc qua
                email.
              </p>
              <ol>
                <li>
                  Bấm <strong>Thêm công việc</strong> để tạo một mục mới.
                </li>
                <li>
                  Bấm tên công việc hoặc biểu tượng bút để xem và chỉnh sửa.
                </li>
                <li>Đánh dấu ô vuông để hoàn thành; bấm lại để mở lại.</li>
                <li>
                  Kết hợp tìm kiếm, trạng thái, độ ưu tiên và deadline để lọc
                  danh sách.
                </li>
              </ol>
              <p>
                “Sắp đến hạn” là các công việc chưa hoàn thành trong{' '}
                <strong>24 giờ tới</strong>. Giờ hiển thị theo múi giờ trình
                duyệt.
              </p>
              <p>
                {isDemo
                  ? 'Dữ liệu demo được lưu riêng trong trình duyệt này. Email và lịch nhắc AWS chưa được kích hoạt ở chế độ demo.'
                  : 'Thông báo email cần xác nhận đăng ký SNS. Email là thông báo bất đồng bộ và có thể đến chậm.'}
              </p>
              <button className="button primary" onClick={() => setModal(null)}>
                Đã hiểu
                <Icon name="check" size={17} />
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

export default App
