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
  { id: 'all', label: 'All tasks', icon: 'book' },
  { id: 'active', label: 'In progress', icon: 'flag' },
  { id: 'upcoming', label: 'Due soon', icon: 'clock' },
  { id: 'completed', label: 'Completed', icon: 'check' },
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
                'Signed in. If you just registered, open the AWS Notifications email and select Confirm subscription to enable task notifications.',
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
          message: 'Your session has expired. Please sign in again.',
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
        message: 'Your session has expired. Please sign in again.',
      })
    } else {
      if (error.status === 409) setModal(null)
      setFeedback({
        type: 'error',
        message:
          error.status === 409
            ? 'This task was updated elsewhere. Refresh the list, then reopen the task to edit it.'
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
          ? 'Task updated.'
          : 'Task created.',
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
      setFeedback({ type: 'success', message: 'Task deleted.' })
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
        .toLocaleLowerCase('en')
        .includes(filters.search.trim().toLocaleLowerCase('en'))
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
    ? 'Demo user'
    : session?.profile?.name ||
      session?.profile?.email?.split('@')[0] ||
      'Guest'
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="./" aria-label="Task Manager home">
          <Crest />
          <span>
            TASK<span className="brand-second">MANAGER</span>
          </span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Task navigation">
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
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => setModal({ type: 'help' })}
          >
            <Icon name="help" size={19} />
            Help
          </button>
          <div className="profile">
            <div className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{displayName}</strong>
              <span>
                {isDemo
                  ? 'Demo mode'
                  : session?.profile?.email || 'Not signed in'}
              </span>
            </div>
            {session && (
              <button
                className="icon-button"
                aria-label="Sign out"
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
            <span>Personal workspace</span>
            <span className="slash">/</span>
            <strong>Tasks</strong>
          </div>
          <div className="topbar-right">
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setModal({ type: 'help' })}
            >
              <Icon name="help" size={18} />
            </button>
            {session && (
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => authenticate(logout)}
              >
                <Icon name="logout" size={18} />
              </button>
            )}
            <span className={`mode-badge ${isDemo ? '' : 'live'}`}>
              <i />
              {isDemo ? 'DEMO' : 'CLOUD'}
            </span>
            {!isDemo && !session && (
              <button
                className="button secondary compact"
                onClick={() => authenticate(login)}
              >
                Sign in
              </button>
            )}
          </div>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <h1>Task overview</h1>
              <p className="page-subtitle">
                Manage tasks, deadlines, and email reminders.
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
                    Refresh
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label="Dismiss notification"
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
              <p className="eyebrow">PERSONAL WORKSPACE</p>
              <h2>Manage your tasks</h2>
              <p>
                Sign in to manage tasks, track deadlines, and receive email
                reminders.
              </p>
              <button
                className="button primary"
                disabled={authLoading}
                onClick={() => authenticate(login)}
              >
                <Icon name="shield" />
                {authLoading ? 'Checking session…' : 'Sign in / Sign up'}
              </button>
              <p className="muted">
                Secure sign-in with Amazon Cognito.
              </p>
            </section>
          ) : (
            <>
              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="eyebrow">WORKSPACE OVERVIEW</span>
                  <h2>Tasks and deadlines</h2>
                  <p>
                    {overdue
                      ? `${overdue} overdue ${overdue === 1 ? 'task' : 'tasks'}. Review deadlines and update task status.`
                      : 'Create a task, set a deadline, and track its status.'}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setModal({ type: 'form' })}
                  >
                    <Icon name="plus" size={18} />
                    New task
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
                    TASKS · DEADLINES · REMINDERS
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
                      <span className="eyebrow">TASK LIST</span>
                      <h2>
                        {navigation.find((item) => item.id === view)?.label}
                        <span className="count-badge">{visible.length}</span>
                      </h2>
                    </div>
                    <button
                      className="icon-button"
                      title="Refresh tasks"
                      aria-label="Refresh tasks"
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
                        ? 'Loading tasks…'
                        : `${visible.length} ${visible.length === 1 ? 'task' : 'tasks'}`}
                      {hasFilters && (
                        <button
                          className="text-button"
                          onClick={() => navigate('all')}
                        >
                          Clear filters
                        </button>
                      )}
                    </span>
                    <label>
                      Sort by:
                      <select
                        aria-label="Sort tasks"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="created">Newest first</option>
                        <option value="due">Earliest deadline</option>
                        <option value="priority">Highest priority</option>
                      </select>
                    </label>
                  </div>
                  {loading ? (
                    <div className="loading-state" role="status">
                      <span className="loader" />
                      Loading tasks…
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
                          ? 'No matching tasks'
                          : 'No tasks yet'}
                      </h3>
                      <p>
                        {hasFilters
                          ? 'Try a different search or clear the filters.'
                          : 'Create your first task to get started.'}
                      </p>
                      <button
                        className="button secondary"
                        onClick={() =>
                          hasFilters
                            ? navigate('all')
                            : setModal({ type: 'form' })
                        }
                      >
                        {hasFilters ? 'Clear filters' : 'New task'}
                      </button>
                    </div>
                  )}
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
          </footer>
        </main>
      </div>
      {modal && (
        <Modal
          title={
            modal.type === 'form'
              ? modal.task
                ? 'Task details'
                : 'New task'
              : modal.type === 'delete'
                ? 'Delete task?'
                : 'Help'
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
                Delete <strong>“{modal.task.title}”</strong>? This action cannot
                be undone.
                {!isDemo && ' Any associated reminder will be cancelled.'}
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="button destructive"
                  disabled={busy}
                  onClick={confirmDelete}
                >
                  <Icon name="trash" size={17} />
                  {busy ? 'Deleting…' : 'Delete task'}
                </button>
              </div>
            </>
          )}
          {modal.type === 'help' && (
            <div className="help-content">
              <p>
                Create tasks with a deadline, priority, and optional email
                reminder.
              </p>
              <ol>
                <li>
                  Select <strong>New task</strong> to create a task.
                </li>
                <li>
                  Select a task title or the edit icon to view and edit it.
                </li>
                <li>
                  Select the checkbox to complete a task; select it again to reopen.
                </li>
                <li>
                  Filter tasks by search, status, priority, and deadline.
                </li>
              </ol>
              <p>
                “Due soon” shows incomplete tasks due within the next{' '}
                <strong>24 hours</strong>. Dates and times use your browser’s
                time zone.
              </p>
              <p>
                {isDemo
                  ? 'Demo data is stored in this browser. Email notifications and scheduled reminders are unavailable in demo mode.'
                  : 'Confirm your email subscription to receive notifications. Email delivery is asynchronous and may be delayed.'}
              </p>
              <button className="button primary" onClick={() => setModal(null)}>
                Got it
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
