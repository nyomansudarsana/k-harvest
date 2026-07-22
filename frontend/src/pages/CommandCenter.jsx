import { useState, useEffect, useRef } from 'react'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'
import { toast } from 'react-toastify'

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isOverdue(dueDate, isTerminal) {
  if (!dueDate || isTerminal) return false
  return new Date(dueDate + 'T00:00:00') < new Date(new Date().toDateString())
}

const AVATAR_COLORS = ['#1A5C28', '#0284C7', '#7C3AED', '#DC2626', '#EA580C', '#BE185D', '#0F766E', '#B45309']

function avatarColor(name) {
  if (!name) return '#6B7280'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name[0].toUpperCase()
}

function fmt_file_size(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

const PRI_COLORS = { Critical: '#DC2626', High: '#EA580C', Medium: '#D97706', Low: '#16A34A' }
const PRI_BG = { Critical: '#FEE2E2', High: '#FFEDD5', Medium: '#FEF3C7', Low: '#D1FAE5' }
const PRI_TEXT = { Critical: '#991B1B', High: '#9A3412', Medium: '#92400E', Low: '#065F46' }

const EMPTY_FORM = {
  title: '', description: '', category_id: '', priority_id: '',
  status_id: '', assigned_to: '', start_date: '', due_date: '',
  assignee_ids: [],
  client_id: '',
  related_inventory_id: '', related_batch_id: '', related_receiving_id: '',
}
const EMPTY_ATTACH = { file_name: '', external_url: '', source_type: 'url' }
const EMPTY_LOC = { name: '', latitude: '', longitude: '', maps_url: '' }
const EMPTY_REMIND = { remind_at: '', remind_type: 'custom' }

const SOURCE_ICONS = { local: '📄', drive: '🟢', dropbox: '📦', url: '🔗' }
const ACTION_LABELS = {
  created: t => 'Task created',
  assigned: t => `Assigned to ${t.new_value}`,
  status_changed: t => `Status: ${t.old_value || '—'} → ${t.new_value}`,
  commented: () => 'Added a comment',
  label_added: t => `Label added: ${t.new_value}`,
  label_removed: t => `Label removed: ${t.old_value}`,
  checklist_added: t => `Subtask added: "${t.new_value}"`,
  checklist_completed: t => `Subtask done: "${t.old_value}"`,
  checklist_unchecked: t => `Subtask unchecked: "${t.old_value}"`,
  attachment_added: t => `Attachment added: ${t.new_value}`,
  attachment_uploaded: t => `File uploaded: ${t.new_value}`,
  location_set: t => `Location set: ${t.new_value}`,
  reminder_set: () => 'Reminder added',
  deleted: () => 'Task deleted',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 26 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: avatarColor(name),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  )
}

function PriBadge({ name }) {
  if (!name) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: PRI_BG[name] || '#F3F4F6', color: PRI_TEXT[name] || '#374151',
    }}>
      {name.toUpperCase()}
    </span>
  )
}

function LabelPill({ label, onRemove }) {
  const bg = label.color + '22'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: bg, color: label.color, border: `1px solid ${label.color}40` }}>
      {label.name}
      {onRemove && <span style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => onRemove(label.id)}>×</span>}
    </span>
  )
}

// ── Task Form (must be defined outside CommandCenter to avoid remount on every keystroke) ──

const FILE_ICONS = {
  'application/pdf': '📄',
  'application/msword': '📝',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
  'application/vnd.ms-excel': '📊',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
  'application/vnd.ms-powerpoint': '📊',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📊',
  'application/zip': '📦',
  'text/plain': '📃',
}
function fileIcon(mime) {
  if (!mime) return '📎'
  if (mime.startsWith('image/')) return '🖼'
  return FILE_ICONS[mime] || '📎'
}

function TaskForm({ form, setForm, categories, priorities, statuses, users, clients, submitting, onSubmit, onCancel, isEdit, pendingAttachments, setPendingAttachments }) {
  const pendingRef = useRef(null)
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkInput, setLinkInput] = useState({ name: '', url: '' })
  const [invSearch, setInvSearch] = useState('')
  const [invAllItems, setInvAllItems] = useState([])
  const [invResults, setInvResults] = useState([])
  const [invLoading, setInvLoading] = useState(false)
  const [invOpen, setInvOpen] = useState(false)
  const invRef = useRef(null)

  async function loadInventory() {
    if (invAllItems.length > 0) { setInvOpen(true); return }
    setInvLoading(true)
    try {
      const { data } = await api.get('/command-center/inventory/search')
      setInvAllItems(data)
      setInvResults(data)
      setInvOpen(true)
    } catch { setInvAllItems([]) }
    finally { setInvLoading(false) }
  }

  function filterInventory(q) {
    if (!q.trim()) {
      setInvResults(invAllItems)
    } else {
      const lower = q.toLowerCase()
      setInvResults(invAllItems.filter(item =>
        item.product_name?.toLowerCase().includes(lower) ||
        item.batch_id?.toLowerCase().includes(lower) ||
        item.commodity_id?.toLowerCase().includes(lower) ||
        item.quality_grade?.toLowerCase().includes(lower) ||
        item.product_grade?.toLowerCase().includes(lower)
      ))
    }
  }

  function handleInvFocus() {
    loadInventory()
  }

  function handleInvChange(e) {
    setInvSearch(e.target.value)
    filterInventory(e.target.value)
    setInvOpen(true)
  }

  function selectInventory(item) {
    setForm(f => ({
      ...f,
      related_inventory_id: item.inventory_id,
      related_batch_id: item.batch_id,
    }))
    const grade = item.product_grade || item.quality_grade
    setInvSearch(`${item.batch_id} — ${item.product_name}${grade ? ` (${grade})` : ''}`)
    setInvOpen(false)
  }

  function clearInventory() {
    setForm(f => ({ ...f, related_inventory_id: '', related_batch_id: '', related_receiving_id: '' }))
    setInvSearch('')
    setInvOpen(false)
  }

  function handlePendingFile(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const added = files.map(f => ({ type: 'file', name: f.name, file: f, mime: f.type, size: f.size }))
    setPendingAttachments(prev => [...prev, ...added])
    e.target.value = ''
  }

  function addLink() {
    if (!linkInput.name.trim() || !linkInput.url.trim()) return
    setPendingAttachments(prev => [...prev, { type: 'link', name: linkInput.name.trim(), url: linkInput.url.trim() }])
    setLinkInput({ name: '', url: '' })
    setShowLinkInput(false)
  }

  function removePending(i) {
    setPendingAttachments(prev => prev.filter((_, idx) => idx !== i))
  }

  return (
    <form onSubmit={onSubmit}>
      <div className="mb-3">
        <label className="kh-form-label">Title <span style={{ color: '#DC2626' }}>*</span></label>
        <input
          className="form-control kh-input"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="What needs to be done?"
          required
        />
      </div>
      <div className="mb-3">
        <label className="kh-form-label">Description</label>
        <textarea
          className="form-control kh-input"
          rows={3}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Add more details…"
        />
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label className="kh-form-label">Category</label>
          <select className="form-select kh-input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">— None —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="col-6">
          <label className="kh-form-label">Priority</label>
          <select className="form-select kh-input" value={form.priority_id} onChange={e => setForm(f => ({ ...f, priority_id: e.target.value }))}>
            <option value="">— None —</option>
            {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label className="kh-form-label">Status</label>
          <select className="form-select kh-input" value={form.status_id} onChange={e => setForm(f => ({ ...f, status_id: e.target.value }))}>
            <option value="">— None —</option>
            {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="col-6">
          <label className="kh-form-label">Primary Assignee</label>
          <select className="form-select kh-input" value={form.assigned_to} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
            <option value="">— Unassigned —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
        </div>
      </div>
      <div className="mb-3">
        <label className="kh-form-label">Additional Assignees</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px', background: '#F8FAFC', border: '1px solid #D1D9E0', borderRadius: 8, maxHeight: 110, overflowY: 'auto' }}>
          {users.length === 0 && <span style={{ fontSize: 12, color: '#9CA3AF' }}>No users available</span>}
          {users.map(u => {
            const checked = (form.assignee_ids || []).includes(u.id)
            return (
              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 12, padding: '3px 8px', borderRadius: 20, background: checked ? '#1a527615' : '#fff', border: `1px solid ${checked ? '#1a5276' : '#E4E7EC'}`, color: checked ? '#1a5276' : '#374151', fontWeight: checked ? 600 : 400, userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => setForm(f => {
                    const ids = f.assignee_ids || []
                    return { ...f, assignee_ids: checked ? ids.filter(x => x !== u.id) : [...ids, u.id] }
                  })}
                  style={{ display: 'none' }}
                />
                <Avatar name={u.full_name} size={16} />
                {u.full_name}
              </label>
            )
          })}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>All selected users receive task notifications</div>
      </div>
      <div className="row g-2 mb-3">
        <div className="col-6">
          <label className="kh-form-label">Start Date</label>
          <input type="date" className="form-control kh-input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div className="col-6">
          <label className="kh-form-label">Due Date</label>
          <input type="date" className="form-control kh-input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
        </div>
      </div>

      {/* Client Link */}
      <div className="mb-3">
        <label className="kh-form-label"><i className="bi bi-building me-1" />Client</label>
        <select className="form-select kh-input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
          <option value="">— No Client —</option>
          {(clients || []).map(c => (
            <option key={c.client_id} value={c.client_id}>
              {c.client_name}{c.company_name ? ` (${c.company_name})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Inventory Reference */}
      <div className="mb-3">
        <label className="kh-form-label"><i className="bi bi-layers me-1" />Related Inventory</label>
        {form.related_inventory_id ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, fontSize: 12.5 }}>
            <i className="bi bi-check-circle-fill text-success" />
            <span style={{ flex: 1, fontWeight: 600, color: '#065F46' }}>{invSearch || `${form.related_batch_id || form.related_inventory_id}`}</span>
            <button type="button" onClick={clearInventory} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, lineHeight: 1 }}>×</button>
          </div>
        ) : (
          <div style={{ position: 'relative' }} ref={invRef}>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control kh-input"
                placeholder="Click or type to search inventory…"
                value={invSearch}
                onFocus={handleInvFocus}
                onChange={handleInvChange}
                onBlur={() => setTimeout(() => setInvOpen(false), 180)}
                style={{ paddingRight: 32 }}
              />
              <i className="bi bi-chevron-down" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9CA3AF', pointerEvents: 'none' }} />
              {invLoading && (
                <div style={{ position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%)' }}>
                  <div className="spinner-border spinner-border-sm text-secondary" style={{ width: 14, height: 14 }} />
                </div>
              )}
            </div>
            {invOpen && invResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1050, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.13)', maxHeight: 240, overflowY: 'auto' }}>
                {invResults.map(item => {
                  const grade = item.product_grade || item.quality_grade
                  return (
                    <div
                      key={item.inventory_id}
                      onMouseDown={() => selectInventory(item)}
                      style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #F3F4F6' }}
                      onMouseOver={e => e.currentTarget.style.background = '#F0FDF4'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#065F46', fontFamily: 'monospace' }}>{item.batch_id}</span>
                        {grade && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#DBEAFE', color: '#1D4ED8' }}>{grade}</span>
                        )}
                        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#1A5C28' }}>{item.available_qty?.toLocaleString()} avail</span>
                      </div>
                      <div style={{ fontSize: 11.5, color: '#374151', fontWeight: 500 }}>{item.product_name}</div>
                      <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 1 }}>{item.commodity_id} &nbsp;·&nbsp; {item.inventory_id}</div>
                    </div>
                  )
                })}
              </div>
            )}
            {invOpen && invResults.length === 0 && !invLoading && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1050, background: '#fff', border: '1px solid #D1D5DB', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.13)', padding: '14px 12px', textAlign: 'center', fontSize: 12, color: '#9CA3AF' }}>
                No inventory records found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attachment staging — only shown for new tasks */}
      {!isEdit && setPendingAttachments && (
        <div className="mb-3">
          <label className="kh-form-label">
            <i className="bi bi-paperclip me-1" />Attachments
          </label>
          <input
            type="file"
            ref={pendingRef}
            style={{ display: 'none' }}
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.zip,.txt,.csv"
            onChange={handlePendingFile}
          />

          {/* Staged list */}
          {pendingAttachments.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {pendingAttachments.map((att, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#F8FAFC', border: '1px solid #E4E7EC', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
                  <span>{att.type === 'link' ? '🔗' : fileIcon(att.mime)}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#374151', fontWeight: 500 }}>{att.name}</span>
                  {att.type === 'file' && att.size && (
                    <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{att.size < 1048576 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / 1048576).toFixed(1)} MB`}</span>
                  )}
                  <button type="button" onClick={() => removePending(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}

          {/* Add buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => pendingRef.current?.click()}>
              <i className="bi bi-upload me-1" />Upload File
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setShowLinkInput(v => !v)}>
              <i className="bi bi-link-45deg me-1" />Add Link
            </button>
          </div>

          {/* Inline link form */}
          {showLinkInput && (
            <div style={{ display: 'flex', gap: 6, marginTop: 7, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <input
                  className="form-control kh-input form-control-sm"
                  placeholder="Link name"
                  value={linkInput.name}
                  onChange={e => setLinkInput(v => ({ ...v, name: e.target.value }))}
                />
              </div>
              <div style={{ flex: 2 }}>
                <input
                  className="form-control kh-input form-control-sm"
                  placeholder="https://…"
                  value={linkInput.url}
                  onChange={e => setLinkInput(v => ({ ...v, url: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                />
              </div>
              <button type="button" className="btn btn-sm btn-kh-primary" style={{ fontSize: 11 }} onClick={addLink}>Add</button>
            </div>
          )}
        </div>
      )}

      <div className="d-flex justify-content-end gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-kh-primary" disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Task'}
        </button>
      </div>
    </form>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const { user: currentUser } = useAuth()

  const [tasks, setTasks] = useState([])
  const [statuses, setStatuses] = useState([])
  const [categories, setCategories] = useState([])
  const [priorities, setPriorities] = useState([])
  const [users, setUsers] = useState([])
  const [allLabels, setAllLabels] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('board')
  const [navSection, setNavSection] = useState('all')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterPri, setFilterPri] = useState('')
  const [filterClient, setFilterClient] = useState('')

  const [selectedTask, setSelectedTask] = useState(null)
  const [detailTab, setDetailTab] = useState('description')
  const [detailLoading, setDetailLoading] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  // Detail drawer state
  const [newComment, setNewComment] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [newChecklistItem, setNewChecklistItem] = useState('')
  const [attachForm, setAttachForm] = useState(EMPTY_ATTACH)
  const [showAttachForm, setShowAttachForm] = useState(false)
  const [locForm, setLocForm] = useState(EMPTY_LOC)
  const [showLocForm, setShowLocForm] = useState(false)
  const [remindForm, setRemindForm] = useState(EMPTY_REMIND)
  const [showRemindForm, setShowRemindForm] = useState(false)
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [newLabelForm, setNewLabelForm] = useState({ name: '', color: '#6B7280' })
  const [showNewLabel, setShowNewLabel] = useState(false)
  const fileInputRef = useRef(null)
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }
  })

  // Notifications
  const [notifCount, setNotifCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [showNotifPanel, setShowNotifPanel] = useState(false)

  // Pending attachments for the create-task form
  const [pendingAttachments, setPendingAttachments] = useState([])

  // ── Data Loading ─────────────────────────────────────────────────────────────

  async function loadMeta() {
    const [cats, pris, sts, usrs, lbls, clts] = await Promise.all([
      api.get('/command-center/categories').then(r => r.data),
      api.get('/command-center/priorities').then(r => r.data),
      api.get('/command-center/statuses').then(r => r.data),
      api.get('/command-center/users').then(r => r.data),
      api.get('/command-center/labels').then(r => r.data),
      api.get('/clients/all').then(r => r.data).catch(() => []),
    ])
    setCategories(cats)
    setPriorities(pris)
    setStatuses(sts)
    setUsers(usrs)
    setAllLabels(lbls)
    setClients(clts)
    return sts
  }

  async function loadTasks() {
    const params = new URLSearchParams({ size: 300 })
    if (search) params.set('search', search)
    if (filterCat) params.set('category_id', filterCat)
    if (filterPri) params.set('priority_id', filterPri)
    if (filterClient) params.set('client_id', filterClient)
    if (navSection.startsWith('cat-')) params.set('category_id', navSection.replace('cat-', ''))
    const { data } = await api.get(`/command-center/tasks?${params}`)
    return data.items
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      try {
        await loadMeta()
        const items = await loadTasks()
        setTasks(items)
      } catch {
        toast.error('Failed to load Command Center')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    if (!loading) loadTasks().then(setTasks).catch(() => {})
  }, [search, filterCat, filterPri, filterClient, navSection])

  useEffect(() => {
    function poll() {
      api.get('/command-center/notifications/unread-count').then(r => setNotifCount(r.data.count)).catch(() => {})
    }
    poll()
    const t = setInterval(poll, 60000)
    return () => clearInterval(t)
  }, [])

  async function loadNotifications() {
    try {
      const { data } = await api.get('/command-center/notifications?limit=30')
      setNotifications(data)
    } catch {}
  }

  async function markNotifRead(id) {
    try {
      await api.patch(`/command-center/notifications/${id}/read`)
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setNotifCount(prev => Math.max(0, prev - 1))
    } catch {}
  }

  async function markAllNotifRead() {
    try {
      await api.patch('/command-center/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setNotifCount(0)
    } catch {}
  }

  // ── Filtered Tasks ────────────────────────────────────────────────────────────

  function applyNavFilter(items) {
    if (!currentUser) return items
    const today = new Date(new Date().toDateString())
    if (navSection === 'mine') return items.filter(t => t.assigned_to === currentUser.id || (t.assignees || []).some(a => a.user_id === currentUser.id))
    if (navSection === 'created_by_me') return items.filter(t => t.created_by === currentUser.id)
    if (navSection === 'overdue') return items.filter(t => !t.is_terminal && t.due_date && new Date(t.due_date + 'T00:00:00') < today)
    if (navSection === 'critical') return items.filter(t => t.priority_name === 'Critical' && !t.is_terminal)
    if (navSection === 'completed') return items.filter(t => t.is_terminal)
    return items
  }

  const visibleTasks = applyNavFilter(tasks)
  const nonTerminalStatuses = statuses.filter(s => !s.is_terminal)
  const terminalStatuses = statuses.filter(s => s.is_terminal)

  function tasksByStatus(stId) { return visibleTasks.filter(t => t.status_id === stId) }
  function getPri(id) { return priorities.find(p => p.id === id) }
  function getCat(id) { return categories.find(c => c.id === id) }
  function getSt(id) { return statuses.find(s => s.id === id) }

  const overdueCount = tasks.filter(t => isOverdue(t.due_date, t.is_terminal)).length
  const criticalCount = tasks.filter(t => t.priority_name === 'Critical' && !t.is_terminal).length
  const mineCount = tasks.filter(t => !t.is_terminal && (t.assigned_to === currentUser?.id || (t.assignees || []).some(a => a.user_id === currentUser?.id))).length

  // ── Task Actions ──────────────────────────────────────────────────────────────

  async function openTask(taskId) {
    setDetailLoading(true)
    try {
      const { data } = await api.get(`/command-center/tasks/${taskId}`)
      setSelectedTask(data)
      setDetailTab('description')
      setShowLabelPicker(false)
      setShowAttachForm(false)
      setShowLocForm(false)
      setShowRemindForm(false)
      if (data.location) {
        setLocForm({ name: data.location.name || '', latitude: data.location.latitude || '', longitude: data.location.longitude || '', maps_url: data.location.maps_url || '' })
      } else {
        setLocForm(EMPTY_LOC)
      }
    } catch { toast.error('Failed to load task') }
    finally { setDetailLoading(false) }
  }

  function refreshSelected(data) {
    setSelectedTask(data)
    loadTasks().then(setTasks).catch(() => {})
  }

  function openCreate() {
    const firstSt = statuses.find(s => !s.is_terminal)
    setForm({ ...EMPTY_FORM, status_id: firstSt?.id || '' })
    setPendingAttachments([])
    setEditMode(false)
    setShowCreate(true)
  }

  function openEdit(task) {
    setForm({
      title: task.title,
      description: task.description || '',
      category_id: task.category_id || '',
      priority_id: task.priority_id || '',
      status_id: task.status_id || '',
      assigned_to: task.assigned_to || '',
      start_date: task.start_date || '',
      due_date: task.due_date || '',
      assignee_ids: (task.assignees || []).map(a => a.user_id),
      client_id: task.client_id || '',
      related_inventory_id: task.related_inventory_id || '',
      related_batch_id: task.related_batch_id || '',
      related_receiving_id: task.related_receiving_id || '',
    })
    setEditMode(true)
  }

  function buildPayload() {
    return {
      title: form.title,
      description: form.description || null,
      category_id: form.category_id ? Number(form.category_id) : null,
      priority_id: form.priority_id ? Number(form.priority_id) : null,
      status_id: form.status_id ? Number(form.status_id) : null,
      assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      start_date: form.start_date || null,
      due_date: form.due_date || null,
      assignee_ids: form.assignee_ids || [],
      client_id: form.client_id || null,
      related_inventory_id: form.related_inventory_id || null,
      related_batch_id: form.related_batch_id || null,
      related_receiving_id: form.related_receiving_id || null,
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    setSubmitting(true)
    try {
      const { data: created } = await api.post('/command-center/tasks', buildPayload())
      // Upload any staged attachments — failures never block task creation
      for (const att of pendingAttachments) {
        try {
          if (att.type === 'file') {
            const fd = new FormData()
            fd.append('file', att.file)
            await api.post(`/command-center/tasks/${created.task_id}/attachments/upload`, fd, {
              headers: { 'Content-Type': 'multipart/form-data' },
            })
          } else {
            await api.post(`/command-center/tasks/${created.task_id}/attachments`, {
              file_name: att.name, external_url: att.url, source_type: 'url',
            })
          }
        } catch {}
      }
      toast.success('Task created')
      setPendingAttachments([])
      setShowCreate(false)
      loadTasks().then(setTasks)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to create task')
    } finally { setSubmitting(false) }
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    setSubmitting(true)
    try {
      const { data } = await api.put(`/command-center/tasks/${selectedTask.task_id}`, buildPayload())
      toast.success('Task updated')
      setEditMode(false)
      refreshSelected(data)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to update task')
    } finally { setSubmitting(false) }
  }

  async function handleStatusChange(statusId) {
    try {
      const { data } = await api.patch(`/command-center/tasks/${selectedTask.task_id}/status`, { status_id: Number(statusId) })
      refreshSelected(data)
    } catch { toast.error('Failed to update status') }
  }

  async function handleDelete(taskId) {
    if (!window.confirm('Delete this task?')) return
    try {
      await api.delete(`/command-center/tasks/${taskId}`)
      toast.success('Task deleted')
      setSelectedTask(null)
      loadTasks().then(setTasks)
    } catch { toast.error('Failed to delete task') }
  }

  async function handleDuplicate(taskId) {
    try {
      const { data } = await api.post(`/command-center/tasks/${taskId}/duplicate`)
      toast.success(`Duplicated as ${data.task_id}`)
      loadTasks().then(setTasks)
    } catch { toast.error('Failed to duplicate task') }
  }

  // ── Comment Actions ───────────────────────────────────────────────────────────

  async function handleComment(e) {
    e.preventDefault()
    if (!newComment.trim()) return
    try {
      const payload = { comment: newComment }
      if (replyTo) payload.parent_id = replyTo.id
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/comments`, payload)
      setNewComment('')
      setReplyTo(null)
      refreshSelected(data)
    } catch { toast.error('Failed to post comment') }
  }

  async function handleDeleteComment(commentId) {
    try {
      const { data } = await api.delete(`/command-center/comments/${commentId}`)
      refreshSelected(data)
    } catch { toast.error('Failed to delete comment') }
  }

  // ── Checklist Actions ─────────────────────────────────────────────────────────

  async function handleAddChecklist(e) {
    e.preventDefault()
    if (!newChecklistItem.trim()) return
    try {
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/checklists`, { title: newChecklistItem })
      setNewChecklistItem('')
      refreshSelected(data)
    } catch { toast.error('Failed to add subtask') }
  }

  async function handleToggleChecklist(itemId) {
    try {
      const { data } = await api.patch(`/command-center/checklists/${itemId}/toggle`)
      refreshSelected(data)
    } catch { toast.error('Failed to update subtask') }
  }

  async function handleDeleteChecklist(itemId) {
    try {
      const { data } = await api.delete(`/command-center/checklists/${itemId}`)
      refreshSelected(data)
    } catch { toast.error('Failed to delete subtask') }
  }

  // ── Label Actions ─────────────────────────────────────────────────────────────

  async function handleAttachLabel(labelId) {
    try {
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/labels/${labelId}`)
      refreshSelected(data)
      setAllLabels(prev => prev) // labels are refreshed via task
    } catch { toast.error('Failed to add label') }
  }

  async function handleRemoveLabel(labelId) {
    try {
      const { data } = await api.delete(`/command-center/tasks/${selectedTask.task_id}/labels/${labelId}`)
      refreshSelected(data)
    } catch { toast.error('Failed to remove label') }
  }

  async function handleCreateLabel(e) {
    e.preventDefault()
    if (!newLabelForm.name.trim()) return
    try {
      const { data } = await api.post('/command-center/labels', newLabelForm)
      setAllLabels(prev => [...prev, data])
      setNewLabelForm({ name: '', color: '#6B7280' })
      setShowNewLabel(false)
    } catch { toast.error('Failed to create label') }
  }

  // ── Attachment Actions ────────────────────────────────────────────────────────

  async function handleAddAttachLink(e) {
    e.preventDefault()
    if (!attachForm.file_name.trim()) return toast.error('Name is required')
    try {
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/attachments`, attachForm)
      setAttachForm(EMPTY_ATTACH)
      setShowAttachForm(false)
      refreshSelected(data)
    } catch { toast.error('Failed to add attachment') }
  }

  async function handleUploadFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      refreshSelected(data)
      toast.success('File uploaded')
    } catch { toast.error('Failed to upload file') }
    e.target.value = ''
  }

  async function handleDeleteAttachment(attId) {
    try {
      const { data } = await api.delete(`/command-center/attachments/${attId}`)
      refreshSelected(data)
    } catch { toast.error('Failed to delete attachment') }
  }

  // ── Location Actions ──────────────────────────────────────────────────────────

  async function handleSaveLocation(e) {
    e.preventDefault()
    try {
      const { data } = await api.put(`/command-center/tasks/${selectedTask.task_id}/location`, {
        name: locForm.name || null,
        latitude: locForm.latitude ? parseFloat(locForm.latitude) : null,
        longitude: locForm.longitude ? parseFloat(locForm.longitude) : null,
        maps_url: locForm.maps_url || null,
      })
      setShowLocForm(false)
      refreshSelected(data)
    } catch { toast.error('Failed to save location') }
  }

  async function handleDeleteLocation() {
    try {
      const { data } = await api.delete(`/command-center/tasks/${selectedTask.task_id}/location`)
      setLocForm(EMPTY_LOC)
      refreshSelected(data)
    } catch { toast.error('Failed to remove location') }
  }

  // ── Reminder Actions ──────────────────────────────────────────────────────────

  async function handleAddReminder(e) {
    e.preventDefault()
    if (!remindForm.remind_at) return toast.error('Date/time is required')
    try {
      const { data } = await api.post(`/command-center/tasks/${selectedTask.task_id}/reminders`, {
        remind_at: new Date(remindForm.remind_at).toISOString(),
        remind_type: remindForm.remind_type,
      })
      setRemindForm(EMPTY_REMIND)
      setShowRemindForm(false)
      refreshSelected(data)
    } catch { toast.error('Failed to add reminder') }
  }

  async function handleDeleteReminder(remId) {
    try {
      const { data } = await api.delete(`/command-center/reminders/${remId}`)
      refreshSelected(data)
    } catch { toast.error('Failed to delete reminder') }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="cc-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner-border" style={{ color: '#1A5C28' }} />
      </div>
    )
  }

  // ── Nav Tab Data ──────────────────────────────────────────────────────────────

  const navTabs = [
    { id: 'all',           label: 'All Tasks',     icon: 'bi-grid-3x2-gap' },
    { id: 'mine',          label: 'My Tasks',      icon: 'bi-person-check' },
    { id: 'created_by_me', label: 'Created by Me', icon: 'bi-pencil-square' },
    { id: 'overdue',       label: 'Overdue',       icon: 'bi-exclamation-circle' },
    { id: 'critical',      label: 'High Priority', icon: 'bi-flag-fill' },
    { id: 'completed',     label: 'Completed',     icon: 'bi-check-circle' },
  ]

  // ── Task Card ─────────────────────────────────────────────────────────────────

  function TaskCard({ task }) {
    const pri = getPri(task.priority_id)
    const overdue = isOverdue(task.due_date, task.is_terminal)
    const borderColor = pri ? (PRI_COLORS[pri.name] || '#E4E7EC') : '#E4E7EC'
    const isSelected = selectedTask?.task_id === task.task_id

    return (
      <div
        className={`cc-task-card2${isSelected ? ' selected' : ''}`}
        style={{ borderLeft: `4px solid ${borderColor}` }}
        onClick={() => openTask(task.task_id)}
      >
        {/* Labels */}
        {task.labels?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 6 }}>
            {task.labels.map(l => <LabelPill key={l.id} label={l} />)}
          </div>
        )}

        {/* Title */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', lineHeight: 1.4, marginBottom: 6 }}>
          {task.title}
        </div>

        {/* Checklist progress */}
        {task.checklist_total > 0 && (
          <div style={{ marginBottom: 7 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6B7280', marginBottom: 2 }}>
              <span>Subtasks</span>
              <span>{task.checklist_done}/{task.checklist_total}</span>
            </div>
            <div style={{ height: 4, background: '#E4E7EC', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(task.checklist_done / task.checklist_total) * 100}%`, background: '#1A5C28', borderRadius: 2 }} />
            </div>
          </div>
        )}

        {/* Client badge */}
        {task.client_name && (
          <div style={{ marginBottom: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
              <i className="bi bi-building me-1" style={{ fontSize: 9 }} />{task.client_name}
            </span>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #F3F4F6', paddingTop: 7 }}>
          {/* Stacked assignee avatars */}
          {(task.assignees && task.assignees.length > 0) ? (
            <div style={{ display: 'flex', marginRight: 2 }}>
              {task.assignees.slice(0, 3).map((a, i) => (
                <div key={a.user_id} style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}>
                  <Avatar name={a.full_name || a.username} size={22} />
                </div>
              ))}
              {task.assignees.length > 3 && (
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#E4E7EC', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#6B7280', marginLeft: -6 }}>
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          ) : task.assigned_to_name ? (
            <Avatar name={task.assigned_to_name} size={22} />
          ) : (
            <div style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed #D1D5DB' }} />
          )}
          {pri && <PriBadge name={pri.name} />}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, color: '#9CA3AF', fontSize: 11 }}>
            {task.due_date && (
              <span style={{ color: overdue ? '#DC2626' : '#6B7280', fontWeight: overdue ? 700 : 400 }}>
                {overdue ? '⚠ ' : '📅 '}{fmtDate(task.due_date)}
              </span>
            )}
            {task.attachment_count > 0 && <span>📎 {task.attachment_count}</span>}
            {task.comment_count > 0 && <span>💬 {task.comment_count}</span>}
          </div>
        </div>
      </div>
    )
  }

  // ── Detail Drawer ─────────────────────────────────────────────────────────────

  function DetailDrawer() {
    if (!selectedTask) return null
    const t = selectedTask
    const overdue = isOverdue(t.due_date, t.is_terminal)
    const attached_labels_ids = new Set(t.labels?.map(l => l.id) || [])

    return (
      <div className="cc-detail-drawer">
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #E4E7EC', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#9CA3AF', letterSpacing: '.5px', marginBottom: 2 }}>{t.task_id}</div>
              {editMode ? (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>Edit Task</div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', lineHeight: 1.35 }}>{t.title}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              {!editMode && (
                <>
                  <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => openEdit(t)} title="Edit task">
                    <i className="bi bi-pencil" />
                  </button>
                  <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDuplicate(t.task_id)} title="Duplicate task">
                    <i className="bi bi-copy" />
                  </button>
                  <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 11, padding: '3px 8px' }} onClick={() => handleDelete(t.task_id)} title="Delete task">
                    <i className="bi bi-trash" />
                  </button>
                </>
              )}
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280', lineHeight: 1 }} onClick={() => { setSelectedTask(null); setEditMode(false) }}>×</button>
            </div>
          </div>

          {!editMode && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {t.priority_name && <PriBadge name={t.priority_name} />}
              {overdue && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#FEE2E2', color: '#991B1B' }}>⚠ OVERDUE</span>}
              {t.labels?.map(l => <LabelPill key={l.id} label={l} onRemove={handleRemoveLabel} />)}
              <span
                style={{ fontSize: 11, color: '#1A5C28', cursor: 'pointer', border: '1px dashed #D1D5DB', borderRadius: 4, padding: '2px 6px' }}
                onClick={() => setShowLabelPicker(p => !p)}
              >
                + Label
              </span>
            </div>
          )}
        </div>

        {/* Label picker */}
        {showLabelPicker && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #F3F4F6', background: '#FAFAFA' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>Apply Labels</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {allLabels.map(l => {
                const applied = attached_labels_ids.has(l.id)
                return (
                  <span
                    key={l.id}
                    style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, cursor: 'pointer', background: applied ? l.color : l.color + '22', color: applied ? '#fff' : l.color, border: `1px solid ${l.color}40` }}
                    onClick={() => applied ? handleRemoveLabel(l.id) : handleAttachLabel(l.id)}
                  >
                    {applied ? '✓ ' : ''}{l.name}
                  </span>
                )
              })}
              <span style={{ fontSize: 11, cursor: 'pointer', color: '#1A5C28', padding: '3px 8px', borderRadius: 4, border: '1px dashed #D1D5DB' }} onClick={() => setShowNewLabel(p => !p)}>+ New</span>
            </div>
            {showNewLabel && (
              <form onSubmit={handleCreateLabel} style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input className="form-control form-control-sm" placeholder="Label name" value={newLabelForm.name} onChange={e => setNewLabelForm(p => ({ ...p, name: e.target.value }))} style={{ flex: 1 }} />
                <input type="color" value={newLabelForm.color} onChange={e => setNewLabelForm(p => ({ ...p, color: e.target.value }))} style={{ width: 36, padding: 2, borderRadius: 4, border: '1px solid #D1D5DB' }} />
                <button type="submit" className="btn btn-sm btn-kh-primary">Add</button>
              </form>
            )}
          </div>
        )}

        {/* Edit form or tabbed detail */}
        {editMode ? (
          <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
            <TaskForm
              form={form} setForm={setForm}
              categories={categories} priorities={priorities}
              statuses={statuses} users={users} clients={clients}
              submitting={submitting}
              onSubmit={handleUpdate} onCancel={() => setEditMode(false)} isEdit={true}
            />
          </div>
        ) : (
          <>
            {/* Metadata sidebar (always visible) */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #E4E7EC', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', flexShrink: 0 }}>
              <div>
                <div className="cc-meta-label">Status</div>
                <select className="form-select form-select-sm" value={t.status_id || ''} onChange={e => handleStatusChange(e.target.value)} style={{ fontSize: 12, padding: '4px 8px', borderColor: t.status_color + '40', color: t.status_color }}>
                  {statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="cc-meta-label">Category</div>
                <div className="cc-meta-value">{t.category_name || '—'}</div>
              </div>
              <div>
                <div className="cc-meta-label">Assignees</div>
                {(t.assignees && t.assignees.length > 0) ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                    {t.assignees.map(a => (
                      <div key={a.user_id} title={a.full_name || a.username} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Avatar name={a.full_name || a.username} size={18} />
                        <span style={{ fontSize: 11, color: '#374151' }}>{(a.full_name || a.username)?.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {t.assigned_to_name ? <Avatar name={t.assigned_to_name} size={18} /> : null}
                    <span className="cc-meta-value" style={{ margin: 0 }}>{t.assigned_to_name || '—'}</span>
                  </div>
                )}
              </div>
              <div>
                <div className="cc-meta-label">Due Date</div>
                <div className="cc-meta-value" style={{ color: overdue ? '#DC2626' : undefined, fontWeight: overdue ? 600 : undefined }}>
                  {overdue ? '⚠ ' : ''}{fmtDate(t.due_date)}
                </div>
              </div>
              {t.start_date && (
                <div>
                  <div className="cc-meta-label">Start Date</div>
                  <div className="cc-meta-value">{fmtDate(t.start_date)}</div>
                </div>
              )}
              {t.related_module && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="cc-meta-label">Related Record</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#EEF2F7', color: '#1a5276', fontWeight: 600, textTransform: 'capitalize' }}>
                      {t.related_module.replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{t.related_record_number || t.related_record_id}</span>
                  </div>
                </div>
              )}
              {t.client_name && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="cc-meta-label">Client</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#EFF6FF', color: '#1D4ED8', fontWeight: 600 }}>
                      <i className="bi bi-building me-1" />{t.client_name}
                    </span>
                    {t.client_company && <span style={{ fontSize: 12, color: '#6B7280' }}>{t.client_company}</span>}
                  </div>
                </div>
              )}
              {t.inventory_info && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div className="cc-meta-label">Related Inventory</div>
                  <div style={{ marginTop: 2, padding: '6px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 12 }}>
                    <span style={{ fontWeight: 600, color: '#065F46' }}>{t.inventory_info.product_name}</span>
                    <span style={{ color: '#6B7280', marginLeft: 6 }}>Batch: {t.inventory_info.batch_id} · Qty: {t.inventory_info.available_qty}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #E4E7EC', flexShrink: 0 }}>
              {[
                { id: 'description', label: 'Details' },
                { id: 'checklist', label: `Subtasks${t.checklist_total > 0 ? ` (${t.checklist_done}/${t.checklist_total})` : ''}` },
                { id: 'attachments', label: `Files${t.attachment_count > 0 ? ` (${t.attachment_count})` : ''}` },
                { id: 'location', label: t.location ? '📍 Location' : 'Location' },
                { id: 'comments', label: `Comments${t.comment_count > 0 ? ` (${t.comment_count})` : ''}` },
                { id: 'activity', label: 'Activity' },
              ].map(tab => (
                <button
                  key={tab.id}
                  style={{ flex: 1, padding: '8px 4px', border: 'none', background: 'none', fontSize: 11, fontWeight: detailTab === tab.id ? 700 : 500, color: detailTab === tab.id ? '#1A5C28' : '#6B7280', borderBottom: `2px solid ${detailTab === tab.id ? '#1A5C28' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onClick={() => setDetailTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>

              {/* ── Description ── */}
              {detailTab === 'description' && (
                <div>
                  {t.description ? (
                    <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#101828', background: '#F9FAFB', borderRadius: 6, padding: '12px 14px', border: '1px solid #E4E7EC', whiteSpace: 'pre-wrap' }}>
                      {t.description}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', padding: '10px 0' }}>No description</div>
                  )}
                  {t.reminders?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div className="cc-meta-label" style={{ marginBottom: 6 }}>Reminders</div>
                      {t.reminders.map(r => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12.5, color: '#374151' }}>
                          <span>🔔</span>
                          <span>{fmtDateTime(r.remind_at)}</span>
                          <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9CA3AF' }} onClick={() => handleDeleteReminder(r.id)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    {showRemindForm ? (
                      <form onSubmit={handleAddReminder} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div>
                          <div className="cc-meta-label">Date & Time</div>
                          <input type="datetime-local" className="form-control form-control-sm" value={remindForm.remind_at} onChange={e => setRemindForm(p => ({ ...p, remind_at: e.target.value }))} />
                        </div>
                        <button type="submit" className="btn btn-sm btn-kh-primary">Add</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowRemindForm(false)}>Cancel</button>
                      </form>
                    ) : (
                      <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setShowRemindForm(true)}>🔔 Add Reminder</button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Checklist ── */}
              {detailTab === 'checklist' && (
                <div>
                  {t.checklist_total > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
                        <span>{t.checklist_done} of {t.checklist_total} completed</span>
                        <span style={{ fontWeight: 700 }}>{Math.round((t.checklist_done / t.checklist_total) * 100)}%</span>
                      </div>
                      <div style={{ height: 6, background: '#E4E7EC', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(t.checklist_done / t.checklist_total) * 100}%`, background: '#1A5C28', borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginBottom: 12 }}>
                    {t.checklists?.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #F3F4F6' }}>
                        <div
                          onClick={() => handleToggleChecklist(item.id)}
                          style={{ width: 17, height: 17, borderRadius: 4, border: item.is_done ? 'none' : '2px solid #D1D5DB', background: item.is_done ? '#1A5C28' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        >
                          {item.is_done && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{ flex: 1, fontSize: 13, color: item.is_done ? '#9CA3AF' : '#101828', textDecoration: item.is_done ? 'line-through' : 'none' }}>{item.title}</span>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14 }} onClick={() => handleDeleteChecklist(item.id)}>×</button>
                      </div>
                    ))}
                    {(!t.checklists || t.checklists.length === 0) && (
                      <div style={{ fontSize: 12.5, color: '#9CA3AF', padding: '8px 0', fontStyle: 'italic' }}>No subtasks yet</div>
                    )}
                  </div>
                  <form onSubmit={handleAddChecklist} style={{ display: 'flex', gap: 6 }}>
                    <input className="form-control form-control-sm" placeholder="Add a subtask…" value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} />
                    <button type="submit" className="btn btn-sm btn-kh-primary" disabled={!newChecklistItem.trim()}>Add</button>
                  </form>
                </div>
              )}

              {/* ── Attachments ── */}
              {detailTab === 'attachments' && (
                <div>
                  {t.attachments?.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #F3F4F6' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, background: a.source_type === 'local' ? '#EDE9FE' : '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                        {SOURCE_ICONS[a.source_type] || '📄'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.file_name}</div>
                        <div style={{ fontSize: 10.5, color: '#9CA3AF' }}>
                          {a.uploaded_by} · {fmt_file_size(a.file_size)} · {a.uploaded_at?.slice(0, 10)}
                        </div>
                      </div>
                      {(a.external_url || a.storage_path) && (
                        <a href={a.external_url || `/${a.storage_path?.replace(/\\/g, '/')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#1A5C28', textDecoration: 'none', flexShrink: 0 }}>Open</a>
                      )}
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 14, flexShrink: 0 }} onClick={() => handleDeleteAttachment(a.id)}>×</button>
                    </div>
                  ))}
                  {(!t.attachments || t.attachments.length === 0) && (
                    <div style={{ fontSize: 12.5, color: '#9CA3AF', padding: '8px 0', fontStyle: 'italic' }}>No attachments yet</div>
                  )}
                  <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => fileInputRef.current?.click()}>
                      📎 Upload File
                    </button>
                    <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setShowAttachForm(p => !p)}>
                      🔗 Add Link
                    </button>
                    <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleUploadFile} />
                  </div>
                  {showAttachForm && (
                    <form onSubmit={handleAddAttachLink} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <select className="form-select form-select-sm" value={attachForm.source_type} onChange={e => setAttachForm(p => ({ ...p, source_type: e.target.value }))}>
                        <option value="url">External URL</option>
                        <option value="drive">Google Drive</option>
                        <option value="dropbox">Dropbox</option>
                      </select>
                      <input className="form-control form-control-sm" placeholder="Display name" value={attachForm.file_name} onChange={e => setAttachForm(p => ({ ...p, file_name: e.target.value }))} required />
                      <input className="form-control form-control-sm" placeholder="URL (https://...)" value={attachForm.external_url} onChange={e => setAttachForm(p => ({ ...p, external_url: e.target.value }))} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="submit" className="btn btn-sm btn-kh-primary">Add Link</button>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowAttachForm(false)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── Location ── */}
              {detailTab === 'location' && (
                <div>
                  {t.location ? (
                    <div>
                      <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#92400E', marginBottom: 4 }}>📍 {t.location.name || 'Location'}</div>
                        {(t.location.latitude && t.location.longitude) && (
                          <div style={{ fontSize: 12, color: '#9A3412', marginBottom: 4 }}>{t.location.latitude}, {t.location.longitude}</div>
                        )}
                        {t.location.maps_url && (
                          <a href={t.location.maps_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#1A5C28', textDecoration: 'none' }}>🗺 View on Map</a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-outline-secondary" style={{ fontSize: 11 }} onClick={() => setShowLocForm(p => !p)}>Edit Location</button>
                        <button className="btn btn-sm btn-outline-danger" style={{ fontSize: 11 }} onClick={handleDeleteLocation}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: '#9CA3AF', marginBottom: 12, fontStyle: 'italic' }}>No location set</div>
                  )}
                  {(!t.location || showLocForm) && (
                    <form onSubmit={handleSaveLocation} style={{ marginTop: t.location ? 12 : 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <div className="cc-meta-label">Location Name</div>
                        <input className="form-control form-control-sm" placeholder="e.g. Warehouse Denpasar" value={locForm.name} onChange={e => setLocForm(p => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div className="cc-meta-label">Latitude</div>
                          <input className="form-control form-control-sm" type="number" step="any" placeholder="-8.538" value={locForm.latitude} onChange={e => setLocForm(p => ({ ...p, latitude: e.target.value }))} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="cc-meta-label">Longitude</div>
                          <input className="form-control form-control-sm" type="number" step="any" placeholder="115.135" value={locForm.longitude} onChange={e => setLocForm(p => ({ ...p, longitude: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <div className="cc-meta-label">Maps URL (optional)</div>
                        <input className="form-control form-control-sm" placeholder="https://maps.google.com/..." value={locForm.maps_url} onChange={e => setLocForm(p => ({ ...p, maps_url: e.target.value }))} />
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button type="submit" className="btn btn-sm btn-kh-primary">Save Location</button>
                        {t.location && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setShowLocForm(false)}>Cancel</button>}
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* ── Comments ── */}
              {detailTab === 'comments' && (
                <div>
                  {replyTo && (
                    <div style={{ marginBottom: 8, padding: '5px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ color: '#065F46' }}>↩ Replying to <strong>{replyTo.user_name}</strong></span>
                      <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13 }} onClick={() => setReplyTo(null)}>×</button>
                    </div>
                  )}
                  <div style={{ marginBottom: 14 }}>
                    {t.comments?.map(c => (
                      <div key={c.id} style={{ marginLeft: c.parent_id ? 20 : 0, display: 'flex', gap: 8, marginBottom: 10 }}>
                        <Avatar name={c.user_name} size={26} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>
                            <strong style={{ color: '#101828' }}>{c.user_name}</strong>
                            {' · '}{fmtDateTime(c.created_at)}
                            {c.edited_at && <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}> (edited)</span>}
                          </div>
                          <div style={{ fontSize: 13, background: '#F9FAFB', border: '1px solid #E4E7EC', borderRadius: '0 8px 8px 8px', padding: '8px 10px', lineHeight: 1.6 }}>
                            {c.parent_id && <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3, borderBottom: '1px solid #E4E7EC', paddingBottom: 3 }}>↩ Reply</div>}
                            {c.comment}
                          </div>
                          <div style={{ display: 'flex', gap: 10, marginTop: 3 }}>
                            <span style={{ fontSize: 11, color: '#1A5C28', cursor: 'pointer', fontWeight: 600 }} onClick={() => setReplyTo(c)}>Reply</span>
                            <span style={{ fontSize: 11, color: '#9CA3AF', cursor: 'pointer' }} onClick={() => handleDeleteComment(c.id)}>Delete</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!t.comments || t.comments.length === 0) && (
                      <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No comments yet</div>
                    )}
                  </div>
                  <form onSubmit={handleComment} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Avatar name={currentUser?.full_name || 'Me'} size={26} />
                    <textarea className="form-control form-control-sm" rows={2} placeholder="Write a comment…" value={newComment} onChange={e => setNewComment(e.target.value)} style={{ resize: 'none', fontSize: 12.5 }} />
                    <button type="submit" className="btn btn-sm btn-kh-primary" disabled={!newComment.trim()} style={{ flexShrink: 0 }}>Post</button>
                  </form>
                </div>
              )}

              {/* ── Activity ── */}
              {detailTab === 'activity' && (
                <div>
                  {t.activities?.length === 0 && (
                    <div style={{ fontSize: 12.5, color: '#9CA3AF', fontStyle: 'italic' }}>No activity recorded</div>
                  )}
                  {[...t.activities].reverse().map((a, i) => {
                    const label = ACTION_LABELS[a.action] ? ACTION_LABELS[a.action](a) : a.action
                    return (
                      <div key={a.id || i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #F9FAFB', fontSize: 12 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.action.includes('status') ? '#1A5C28' : a.action.includes('label') ? '#7C3AED' : '#D1D5DB', marginTop: 4, flexShrink: 0 }} />
                        <div style={{ flex: 1, color: '#475467' }}>
                          {label}
                          <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 1 }}>{a.created_by_name} · {fmtDateTime(a.created_at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>{/* end tab content */}
          </>
        )}
      </div>
    )
  }

  // ── Calendar View ─────────────────────────────────────────────────────────────

  function CalendarView() {
    const { year, month } = calMonth
    const firstDow = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const today = new Date().toISOString().slice(0, 10)
    const monthLabel = new Date(year, month, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    const byDate = {}
    visibleTasks.forEach(t => {
      if (t.due_date) {
        if (!byDate[t.due_date]) byDate[t.due_date] = []
        byDate[t.due_date].push(t)
      }
    })

    const cells = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    while (cells.length % 7 !== 0) cells.push(null)

    const btnStyle = { background: '#fff', border: '1px solid #E4E7EC', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontWeight: 600, color: '#374151', fontSize: 13 }

    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <button style={btnStyle} onClick={() => setCalMonth(p => {
            const d = new Date(p.year, p.month - 1, 1); return { year: d.getFullYear(), month: d.getMonth() }
          })}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#101828', minWidth: 190, textAlign: 'center' }}>{monthLabel}</span>
          <button style={btnStyle} onClick={() => setCalMonth(p => {
            const d = new Date(p.year, p.month + 1, 1); return { year: d.getFullYear(), month: d.getMonth() }
          })}>›</button>
          <button style={{ ...btnStyle, fontSize: 11, padding: '4px 10px' }} onClick={() => { const d = new Date(); setCalMonth({ year: d.getFullYear(), month: d.getMonth() }) }}>Today</button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6B7280' }}>{visibleTasks.filter(t => t.due_date).length} tasks with due dates</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {DOW.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6B7280', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.4px' }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ minHeight: 90, borderRadius: 6 }} />
            const mm = String(month + 1).padStart(2, '0')
            const dd = String(day).padStart(2, '0')
            const dateStr = `${year}-${mm}-${dd}`
            const dayTasks = byDate[dateStr] || []
            const isToday = dateStr === today
            return (
              <div key={i} style={{ minHeight: 90, background: '#fff', border: `1.5px solid ${isToday ? '#1A5C28' : '#E4E7EC'}`, borderRadius: 6, padding: '6px 8px', boxShadow: isToday ? '0 0 0 2px #1A5C2815' : '0 1px 2px rgba(0,0,0,.04)' }}>
                <div style={{ fontWeight: isToday ? 800 : 500, fontSize: 12, color: isToday ? '#1A5C28' : '#374151', marginBottom: 3 }}>{day}</div>
                {dayTasks.slice(0, 3).map(t => {
                  const pri = getPri(t.priority_id)
                  const col = pri ? (PRI_COLORS[pri.name] || '#6B7280') : '#6B7280'
                  return (
                    <div key={t.id} onClick={() => openTask(t.task_id)} title={t.title}
                      style={{ fontSize: 10, fontWeight: 600, padding: '2px 5px', borderRadius: 3, marginBottom: 2, background: col, color: '#fff', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                      {t.title}
                    </div>
                  )
                })}
                {dayTasks.length > 3 && (
                  <div style={{ fontSize: 10, color: '#6B7280' }}>+{dayTasks.length - 3} more</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Dashboard View ────────────────────────────────────────────────────────────

  function DashboardView() {
    const today = new Date()
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7)
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30)

    const byCat = categories.map(cat => ({
      name: cat.name, color: cat.color,
      total: tasks.filter(t => t.category_id === cat.id).length,
      open: tasks.filter(t => t.category_id === cat.id && !t.is_terminal).length,
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total)

    const bySt = statuses.map(st => ({
      name: st.name, color: st.color,
      count: tasks.filter(t => t.status_id === st.id).length,
    })).filter(s => s.count > 0).sort((a, b) => b.count - a.count)

    const upcoming = tasks.filter(t => {
      if (!t.due_date || t.is_terminal) return false
      const d = new Date(t.due_date + 'T00:00:00')
      return d >= today && d <= in30
    }).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 10)

    const overdueTasks = tasks.filter(t => isOverdue(t.due_date, t.is_terminal))
      .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 8)

    const maxCat = Math.max(...byCat.map(c => c.total), 1)
    const maxSt = Math.max(...bySt.map(s => s.count), 1)

    const cardStyle = { background: '#fff', border: '1px solid #E4E7EC', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }

    return (
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

          {/* Tasks by Category */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#101828', marginBottom: 14 }}>Tasks by Category</div>
            {byCat.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 12 }}>No category data</div>}
            {byCat.map(c => (
              <div key={c.name} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, color: '#374151' }}>{c.name}</span>
                  <span style={{ color: '#6B7280' }}>{c.open} open / {c.total} total</span>
                </div>
                <div style={{ height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(c.total / maxCat) * 100}%`, background: c.color, borderRadius: 3 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Tasks by Status */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#101828', marginBottom: 14 }}>Tasks by Status</div>
            {bySt.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 12 }}>No status data</div>}
            {bySt.map(s => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 20, background: s.color + '20', color: s.color, minWidth: 110, textAlign: 'center' }}>{s.name}</span>
                <div style={{ flex: 1, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(s.count / maxSt) * 100}%`, background: s.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151', minWidth: 20, textAlign: 'right' }}>{s.count}</span>
              </div>
            ))}
          </div>

          {/* Upcoming Deadlines */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#101828', marginBottom: 12 }}>Upcoming — Next 30 Days</div>
            {upcoming.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 12 }}>No upcoming deadlines</div>}
            {upcoming.map(t => {
              const pri = getPri(t.priority_id)
              return (
                <div key={t.id} onClick={() => openTask(t.task_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #F9FAFB', cursor: 'pointer' }}>
                  {pri && <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRI_COLORS[pri.name] || '#6B7280', flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: '#6B7280', whiteSpace: 'nowrap' }}>{fmtDate(t.due_date)}</span>
                </div>
              )
            })}
          </div>

          {/* Overdue Tasks */}
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#DC2626', marginBottom: 12 }}>⚠ Overdue Tasks ({overdueTasks.length})</div>
            {overdueTasks.length === 0 && <div style={{ color: '#9CA3AF', fontSize: 12 }}>No overdue tasks 🎉</div>}
            {overdueTasks.map(t => {
              const pri = getPri(t.priority_id)
              const daysOver = Math.round((today - new Date(t.due_date + 'T00:00:00')) / 86400000)
              return (
                <div key={t.id} onClick={() => openTask(t.task_id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #FEF2F2', cursor: 'pointer' }}>
                  {pri && <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRI_COLORS[pri.name] || '#6B7280', flexShrink: 0 }} />}
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  <span style={{ fontSize: 11, color: '#DC2626', whiteSpace: 'nowrap', fontWeight: 700 }}>{daysOver}d late</span>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="cc-root">

      {/* ── PAGE HEADER: Stats + Nav Tabs + Toolbar ───────────────────────────── */}
      <div className="cc-page-header">

        {/* Stats Row */}
        <div className="cc-stats-row">
          {[
            { id: 'all',       label: 'Open Tasks', count: tasks.filter(t => !t.is_terminal).length, icon: 'bi-grid-3x2-gap',      color: '#1A5C28' },
            { id: 'mine',      label: 'My Tasks',   count: mineCount,                                icon: 'bi-person-check',       color: '#0284C7' },
            { id: 'overdue',   label: 'Overdue',    count: overdueCount,                             icon: 'bi-exclamation-circle', color: '#DC2626' },
            { id: 'critical',  label: 'Critical',   count: criticalCount,                            icon: 'bi-flag-fill',          color: '#EA580C' },
            { id: 'completed', label: 'Completed',  count: tasks.filter(t => t.is_terminal).length,  icon: 'bi-check-circle',       color: '#059669' },
          ].map(card => {
            const isActive = navSection === card.id
            return (
              <div
                key={card.id}
                onClick={() => setNavSection(card.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px',
                  borderRadius: 8, border: `1.5px solid ${isActive ? card.color : '#E4E7EC'}`,
                  background: isActive ? card.color + '18' : '#F9FAFB',
                  cursor: 'pointer', transition: 'all .15s', flex: 1, minWidth: 110,
                }}
              >
                <i className={`bi ${card.icon}`} style={{ fontSize: 20, color: card.color }} />
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#101828', lineHeight: 1 }}>{card.count}</div>
                  <div style={{ fontSize: 10.5, color: '#6B7280', marginTop: 2 }}>{card.label}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Nav Tabs + Toolbar Row */}
        <div style={{ display: 'flex', alignItems: 'center', borderTop: '1px solid #F3F4F6' }}>

          {/* Nav Tabs */}
          <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
            {navTabs.map(tab => {
              const isActive = navSection === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setNavSection(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px',
                    border: 'none', background: 'none', whiteSpace: 'nowrap', cursor: 'pointer',
                    fontSize: 12.5, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#1A5C28' : '#6B7280',
                    borderBottom: `2.5px solid ${isActive ? '#1A5C28' : 'transparent'}`,
                  }}
                >
                  <i className={`bi ${tab.icon}`} style={{ fontSize: 12 }} />
                  {' '}{tab.label}
                  {tab.id === 'overdue' && overdueCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 10, background: '#FEE2E2', color: '#DC2626', marginLeft: 3 }}>{overdueCount}</span>
                  )}
                  {tab.id === 'critical' && criticalCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 10, background: '#FFEDD5', color: '#9A3412', marginLeft: 3 }}>{criticalCount}</span>
                  )}
                  {tab.id === 'mine' && mineCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 10, background: '#DBEAFE', color: '#1D4ED8', marginLeft: 3 }}>{mineCount}</span>
                  )}
                </button>
              )
            })}

            {/* Category as tab-style select */}
            <select
              value={navSection.startsWith('cat-') ? navSection : ''}
              onChange={e => setNavSection(e.target.value || 'all')}
              style={{
                fontSize: 12.5, fontWeight: navSection.startsWith('cat-') ? 700 : 500,
                color: navSection.startsWith('cat-') ? '#1A5C28' : '#6B7280',
                border: 'none', background: 'none', cursor: 'pointer', padding: '8px 10px',
                borderBottom: `2.5px solid ${navSection.startsWith('cat-') ? '#1A5C28' : 'transparent'}`,
                outline: 'none',
              }}
            >
              <option value="">Category…</option>
              {categories.map(c => <option key={c.id} value={`cat-${c.id}`}>{c.name}</option>)}
            </select>
          </div>

          {/* Right: View + Search + Priority + New Task */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '5px 0 5px 12px', flexShrink: 0 }}>
            <div style={{ display: 'flex', border: '1px solid #E4E7EC', borderRadius: 6, overflow: 'hidden' }}>
              {[
                { id: 'board',     icon: 'bi-kanban',        title: 'Board'     },
                { id: 'list',      icon: 'bi-list-ul',       title: 'List'      },
                { id: 'calendar',  icon: 'bi-calendar3',     title: 'Calendar'  },
                { id: 'dashboard', icon: 'bi-bar-chart-line', title: 'Dashboard' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  title={v.title}
                  style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', fontSize: 13, background: view === v.id ? '#1A5C28' : '#fff', color: view === v.id ? '#fff' : '#6B7280', borderLeft: v.id !== 'board' ? '1px solid #E4E7EC' : 'none' }}
                >
                  <i className={`bi ${v.icon}`} />
                </button>
              ))}
            </div>

            <input
              className="form-control form-control-sm"
              style={{ width: 170 }}
              placeholder="🔍 Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            <select className="form-select form-select-sm" style={{ width: 108 }} value={filterPri} onChange={e => setFilterPri(e.target.value)}>
              <option value="">Priority</option>
              {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select className="form-select form-select-sm" style={{ width: 130 }} value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">Client</option>
              {clients.map(c => <option key={c.client_id} value={c.client_id}>{c.client_name}</option>)}
            </select>

            {(search || filterPri || filterClient) && (
              <button className="btn btn-sm btn-outline-secondary" style={{ padding: '4px 8px' }} onClick={() => { setSearch(''); setFilterPri(''); setFilterClient('') }}>
                <i className="bi bi-x" />
              </button>
            )}

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-sm btn-outline-secondary"
                style={{ padding: '4px 9px', position: 'relative' }}
                title="Notifications"
                onClick={() => {
                  setShowNotifPanel(v => {
                    if (!v) loadNotifications()
                    return !v
                  })
                }}
              >
                <i className="bi bi-bell" style={{ fontSize: 14 }} />
                {notifCount > 0 && (
                  <span style={{ position: 'absolute', top: -4, right: -4, background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 10, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                    {notifCount > 99 ? '99+' : notifCount}
                  </span>
                )}
              </button>

              {showNotifPanel && (
                <div style={{ position: 'absolute', right: 0, top: 36, width: 340, background: '#fff', border: '1px solid #E4E7EC', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 9999, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #F3F4F6' }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#101828' }}>Notifications</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {notifCount > 0 && (
                        <button type="button" onClick={markAllNotifRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#1A5C28', fontWeight: 600 }}>Mark all read</button>
                      )}
                      <button type="button" onClick={() => setShowNotifPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6B7280', lineHeight: 1 }}>×</button>
                    </div>
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    {notifications.length === 0 && (
                      <div style={{ padding: '24px 14px', textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>
                        <i className="bi bi-bell-slash" style={{ fontSize: 22, display: 'block', marginBottom: 6 }} />
                        No notifications
                      </div>
                    )}
                    {notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.is_read) markNotifRead(n.id)
                          if (n.task_id) { openTask(n.task_id); setShowNotifPanel(false) }
                        }}
                        style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid #F9FAFB', cursor: n.task_id ? 'pointer' : 'default', background: n.is_read ? 'transparent' : '#EEF6F0' }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.is_read ? 'transparent' : '#1A5C28', flexShrink: 0, marginTop: 5 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: n.is_read ? 500 : 700, color: '#101828', marginBottom: 2 }}>{n.title}</div>
                          {n.message && <div style={{ fontSize: 11.5, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</div>}
                          <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3 }}>{new Date(n.created_at).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ whiteSpace: 'nowrap' }}>
              <i className="bi bi-plus-lg me-1" />New Task
            </button>
          </div>

        </div>
      </div>{/* end cc-page-header */}

      {/* ── BODY: Workspace + Detail Drawer ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <div className="cc-workspace">

          {/* Context breadcrumb */}
          <div style={{ padding: '6px 16px 0', fontSize: 11.5, color: '#9CA3AF', flexShrink: 0 }}>
            <strong style={{ color: '#374151' }}>
              {navTabs.find(n => n.id === navSection)?.label || categories.find(c => `cat-${c.id}` === navSection)?.name || 'All Tasks'}
            </strong>
            {' — '}{visibleTasks.length} task{visibleTasks.length !== 1 ? 's' : ''}
          </div>

          {/* Board View */}
          {view === 'board' && (
            <div className="cc-board-cols">
              {nonTerminalStatuses.map(st => {
                const colTasks = tasksByStatus(st.id)
                return (
                  <div key={st.id} className="cc-board-col-item">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                      <strong style={{ fontSize: 12, color: '#374151' }}>{st.name}</strong>
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#F3F4F6', color: '#6B7280' }}>{colTasks.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {colTasks.map(t => <TaskCard key={t.id} task={t} />)}
                      {colTasks.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#D1D5DB', fontSize: 12, padding: '20px 0', borderRadius: 8, border: '1.5px dashed #E4E7EC' }}>No tasks</div>
                      )}
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: '1.5px dashed #E4E7EC', borderRadius: 8, color: '#9CA3AF', cursor: 'pointer', fontSize: 12, fontWeight: 500, marginTop: 2 }}
                        onClick={() => { openCreate(); setForm(f => ({ ...f, status_id: st.id })) }}
                      >
                        + Add task
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Completed column */}
              {(navSection === 'all' || navSection === 'completed') && (
                <div className="cc-board-col-item" style={{ opacity: 0.65 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '0 2px' }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669', flexShrink: 0 }} />
                    <strong style={{ fontSize: 12, color: '#374151' }}>Completed</strong>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#D1FAE5', color: '#065F46' }}>
                      {visibleTasks.filter(t => t.is_terminal).length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {visibleTasks.filter(t => t.is_terminal).slice(0, 5).map(t => <TaskCard key={t.id} task={t} />)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* List View */}
          {view === 'list' && (
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
              <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E4E7EC', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,.06)' }}>
                <table className="kh-table" style={{ marginBottom: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>ID</th>
                      <th style={{ width: 80 }}>Priority</th>
                      <th>Task</th>
                      <th>Labels</th>
                      <th>Assignee</th>
                      <th>Progress</th>
                      <th>Due</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTasks.length === 0 && (
                      <tr><td colSpan={8} style={{ textAlign: 'center', color: '#9CA3AF', padding: '24px 0', fontSize: 13 }}>No tasks found</td></tr>
                    )}
                    {visibleTasks.map(t => {
                      const pri = getPri(t.priority_id)
                      const st = getSt(t.status_id)
                      const overdue = isOverdue(t.due_date, st?.is_terminal)
                      return (
                        <tr key={t.id} style={{ cursor: 'pointer', background: selectedTask?.task_id === t.task_id ? '#F0FDF4' : undefined }} onClick={() => openTask(t.task_id)}>
                          <td style={{ fontSize: 11, color: '#9CA3AF' }}>{t.task_id}</td>
                          <td>{pri ? <PriBadge name={pri.name} /> : '—'}</td>
                          <td>
                            <div style={{ fontWeight: 600, fontSize: 13, color: '#101828' }}>{t.title}</div>
                            {t.category_name && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>{t.category_name}</div>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                              {t.labels?.slice(0, 3).map(l => <LabelPill key={l.id} label={l} />)}
                            </div>
                          </td>
                          <td>
                            {t.assigned_to_name ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Avatar name={t.assigned_to_name} size={20} />
                                <span style={{ fontSize: 12 }}>{t.assigned_to_name}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td>
                            {t.checklist_total > 0 ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 5, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden', minWidth: 50 }}>
                                  <div style={{ height: '100%', width: `${(t.checklist_done / t.checklist_total) * 100}%`, background: '#1A5C28', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 10.5, color: '#6B7280' }}>{t.checklist_done}/{t.checklist_total}</span>
                              </div>
                            ) : '—'}
                          </td>
                          <td style={{ fontSize: 12, color: overdue ? '#DC2626' : '#374151', fontWeight: overdue ? 700 : undefined, whiteSpace: 'nowrap' }}>
                            {t.due_date ? (overdue ? '⚠ ' : '') + fmtDate(t.due_date) : '—'}
                          </td>
                          <td>
                            {st ? (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: st.color + '20', color: st.color }}>
                                {st.name}
                              </span>
                            ) : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Calendar View */}
          {view === 'calendar' && <CalendarView />}

          {/* Dashboard View */}
          {view === 'dashboard' && <DashboardView />}

        </div>{/* end cc-workspace */}

        {/* Detail Drawer */}
        {detailLoading ? (
          <div className="cc-detail-drawer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="spinner-border spinner-border-sm" style={{ color: '#1A5C28' }} />
          </div>
        ) : (
          <DetailDrawer />
        )}

      </div>{/* end body */}

      {/* Create Modal */}
      {showCreate && (
        <div className="kh-modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="kh-modal" style={{ maxWidth: 560 }}>
            <div className="kh-modal-header">
              <h6 className="mb-0 fw-bold"><i className="bi bi-plus-circle me-2" />New Task</h6>
              <button className="btn-close" onClick={() => setShowCreate(false)} />
            </div>
            <div className="kh-modal-body">
              <TaskForm
                form={form} setForm={setForm}
                categories={categories} priorities={priorities}
                statuses={statuses} users={users} clients={clients}
                submitting={submitting}
                onSubmit={handleCreate} onCancel={() => setShowCreate(false)} isEdit={false}
                pendingAttachments={pendingAttachments} setPendingAttachments={setPendingAttachments}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
