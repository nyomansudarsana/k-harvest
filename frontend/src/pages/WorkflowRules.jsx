import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const RULE_INIT = {
  module_name: 'quotation',
  event_name: 'created',
  task_title_template: '',
  category_id: null,
  priority_id: null,
  assign_to_role: '',
  is_active: true,
}

const MODULE_OPTIONS = [
  { value: 'quotation',    label: 'Quotation'    },
  { value: 'invoice',      label: 'Invoice'      },
  { value: 'receiving',    label: 'Receiving'    },
  { value: 'stock_opname', label: 'Stock Opname' },
]

const EVENT_OPTIONS = {
  quotation:    [{ value: 'created', label: 'Created' }],
  invoice:      [{ value: 'created', label: 'Created' }],
  receiving:    [{ value: 'created', label: 'Created' }],
  stock_opname: [
    { value: 'created',     label: 'Created'     },
    { value: 'discrepancy', label: 'Discrepancy' },
  ],
}

const PRIORITY_COLORS = {
  Critical: '#DC2626',
  High:     '#EA580C',
  Medium:   '#D97706',
  Low:      '#16A34A',
}

export default function WorkflowRules() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'Administrator'

  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(RULE_INIT)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)
  const [meta, setMeta] = useState({ categories: [], priorities: [], roles: [] })

  const fetchRules = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/workflow-rules')
      setRules(res.data)
    } finally { setLoading(false) }
  }, [])

  const fetchMeta = useCallback(async () => {
    try {
      const [metaRes, rolesRes] = await Promise.all([
        api.get('/workflow-rules/meta'),
        api.get('/rbac/roles'),
      ])
      setMeta({
        categories: metaRes.data.categories || [],
        priorities:  metaRes.data.priorities  || [],
        roles:        rolesRes.data.map(r => r.name),
      })
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchRules()
    fetchMeta()
  }, [])

  const openCreate = () => {
    setForm({ ...RULE_INIT, assign_to_role: meta.roles[0] || '' })
    setModal({ show: true, mode: 'create', item: null })
  }

  const openEdit = (rule) => {
    setForm({
      module_name:          rule.module_name,
      event_name:           rule.event_name,
      task_title_template:  rule.task_title_template,
      category_id:          rule.category_id,
      priority_id:          rule.priority_id,
      assign_to_role:       rule.assign_to_role || '',
      is_active:            rule.is_active,
    })
    setModal({ show: true, mode: 'edit', item: rule })
  }

  const handleSave = async () => {
    if (!form.task_title_template.trim()) { toast.warning('Task title template is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        category_id: form.category_id ? Number(form.category_id) : null,
        priority_id:  form.priority_id  ? Number(form.priority_id)  : null,
        assign_to_role: form.assign_to_role || null,
      }
      if (modal.mode === 'create') {
        await api.post('/workflow-rules', payload)
        toast.success('Workflow rule created')
      } else {
        await api.put(`/workflow-rules/${modal.item.id}`, payload)
        toast.success('Workflow rule updated')
      }
      setModal({ show: false })
      fetchRules()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save rule')
    } finally { setSaving(false) }
  }

  const handleToggle = async (rule) => {
    try {
      await api.patch(`/workflow-rules/${rule.id}/toggle`)
      fetchRules()
    } catch { toast.error('Failed to toggle rule') }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/workflow-rules/${deleteModal.id}`)
      toast.success('Rule deleted')
      setDeleteModal(null)
      fetchRules()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot delete rule')
    }
  }

  const moduleLabel = (v) => MODULE_OPTIONS.find(m => m.value === v)?.label || v
  const eventLabel  = (mod, ev) => (EVENT_OPTIONS[mod] || []).find(e => e.value === ev)?.label || ev

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="fw-bold mb-0">Workflow Rules</h5>
          <small className="text-muted">Auto-create Command Center tasks when ERP events occur</small>
        </div>
        {isAdmin && (
          <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}>
            <i className="bi bi-plus-lg me-1" />Add Rule
          </button>
        )}
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          {loading ? (
            <div className="d-flex justify-content-center py-5"><div className="spinner-border text-primary" /></div>
          ) : rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
              <i className="bi bi-diagram-3" style={{ fontSize: 40, display: 'block', marginBottom: 8 }} />
              <div>No workflow rules configured</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E4E7EC' }}>
                    {['Module', 'Event', 'Task Title Template', 'Category', 'Priority', 'Assign To', 'Status', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule, idx) => (
                    <tr key={rule.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFBFC', borderBottom: '1px solid #F0F2F5' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1e293b' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, background: '#EEF2F7', fontSize: 12 }}>
                          {moduleLabel(rule.module_name)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {eventLabel(rule.module_name, rule.event_name)}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#1e293b', maxWidth: 280 }}>
                        <span title={rule.task_title_template} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {rule.task_title_template}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {rule.category_name ? (
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: rule.category_color ? `${rule.category_color}22` : '#EEF2F7', color: rule.category_color || '#475569', fontSize: 12, fontWeight: 600 }}>
                            {rule.category_name}
                          </span>
                        ) : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {rule.priority_name ? (
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: `${PRIORITY_COLORS[rule.priority_name] || '#94a3b8'}22`, color: PRIORITY_COLORS[rule.priority_name] || '#475569', fontSize: 12, fontWeight: 600 }}>
                            {rule.priority_name}
                          </span>
                        ) : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#475569' }}>
                        {rule.assign_to_role || <span style={{ color: '#94a3b8' }}>Unassigned</span>}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {isAdmin ? (
                          <div
                            onClick={() => handleToggle(rule)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                              padding: '2px 10px', borderRadius: 20,
                              background: rule.is_active ? '#dcfce7' : '#f1f5f9',
                              color: rule.is_active ? '#166534' : '#64748b',
                              fontSize: 12, fontWeight: 600, userSelect: 'none',
                            }}
                            title={rule.is_active ? 'Click to disable' : 'Click to enable'}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: rule.is_active ? '#16a34a' : '#94a3b8' }} />
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </div>
                        ) : (
                          <span style={{ color: rule.is_active ? '#16a34a' : '#94a3b8', fontWeight: 600, fontSize: 12 }}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        {isAdmin && (
                          <div className="d-flex gap-1">
                            <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(rule)}>
                              <i className="bi bi-pencil" />
                            </button>
                            <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(rule)}>
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Template help */}
      <div className="kh-card mt-3" style={{ background: '#F8FAFC', borderColor: '#E4E7EC' }}>
        <div className="kh-card-body" style={{ padding: '12px 18px' }}>
          <div style={{ fontSize: 12, color: '#475569' }}>
            <strong style={{ color: '#1e293b' }}>Template variables:</strong>
            {' '}<code style={{ background: '#EEF2F7', padding: '1px 6px', borderRadius: 4 }}>{'{record_number}'}</code> — ERP record ID (e.g. QT00001){' · '}
            <code style={{ background: '#EEF2F7', padding: '1px 6px', borderRadius: 4 }}>{'{module}'}</code> — module name (e.g. Quotation)
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        show={modal.show}
        onClose={() => setModal({ show: false })}
        title={modal.mode === 'create' ? 'Add Workflow Rule' : 'Edit Workflow Rule'}
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}Save
            </button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-md-6">
            <label className="kh-form-label">Module *</label>
            <select
              className="form-select kh-input"
              value={form.module_name}
              onChange={e => setForm(f => ({ ...f, module_name: e.target.value, event_name: EVENT_OPTIONS[e.target.value]?.[0]?.value || 'created' }))}
            >
              {MODULE_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Event *</label>
            <select
              className="form-select kh-input"
              value={form.event_name}
              onChange={e => setForm(f => ({ ...f, event_name: e.target.value }))}
            >
              {(EVENT_OPTIONS[form.module_name] || []).map(ev => (
                <option key={ev.value} value={ev.value}>{ev.label}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="kh-form-label">Task Title Template *</label>
            <input
              className="form-control kh-input"
              value={form.task_title_template}
              onChange={e => setForm(f => ({ ...f, task_title_template: e.target.value }))}
              placeholder="e.g. Review Quotation {record_number}"
            />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Use <code>{'{record_number}'}</code> to insert the ERP record ID
            </div>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Category</label>
            <select
              className="form-select kh-input"
              value={form.category_id ?? ''}
              onChange={e => setForm(f => ({ ...f, category_id: e.target.value || null }))}
            >
              <option value="">— None —</option>
              {meta.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Priority</label>
            <select
              className="form-select kh-input"
              value={form.priority_id ?? ''}
              onChange={e => setForm(f => ({ ...f, priority_id: e.target.value || null }))}
            >
              <option value="">— None —</option>
              {meta.priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Assign To Role</label>
            <select
              className="form-select kh-input"
              value={form.assign_to_role}
              onChange={e => setForm(f => ({ ...f, assign_to_role: e.target.value }))}
            >
              <option value="">— Unassigned —</option>
              {meta.roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Status</label>
            <div className="d-flex align-items-center gap-2 mt-1">
              <div
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                style={{
                  width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                  background: form.is_active ? '#1a5276' : '#d1d9e0',
                  position: 'relative', transition: 'background 0.2s',
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, left: form.is_active ? 21 : 3,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </div>
              <span style={{ fontSize: 13, color: form.is_active ? '#166534' : '#64748b', fontWeight: 600 }}>
                {form.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        show={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Delete Workflow Rule"
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button>
          </>
        }
      >
        <p>Delete the rule <strong>{deleteModal?.task_title_template}</strong>? This cannot be undone.</p>
      </Modal>
    </div>
  )
}
