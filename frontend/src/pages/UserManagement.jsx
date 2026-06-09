import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, statusBadgeClass, debounce } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

const INIT = { full_name: '', username: '', email: '', password: '', role: 'Staff', status: 'Active' }

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)
  const [resetModal, setResetModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/users', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])
  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }
  const openCreate = () => { setForm(INIT); setModal({ show: true, mode: 'create', item: null }) }
  const openEdit = (item) => { setForm({ full_name: item.full_name, username: item.username, email: item.email || '', password: '', role: item.role, status: item.status }); setModal({ show: true, mode: 'edit', item }) }

  const handleSave = async () => {
    if (!form.full_name || !form.username) { toast.warning('Full name and username are required'); return }
    if (modal.mode === 'create' && !form.password) { toast.warning('Password is required'); return }
    setSaving(true)
    try {
      if (modal.mode === 'create') { await api.post('/users', form); toast.success('User created') }
      else { await api.put(`/users/${modal.item.user_id}`, { full_name: form.full_name, email: form.email, role: form.role, status: form.status }); toast.success('User updated') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.delete(`/users/${deleteModal.user_id}`)
    toast.success('User deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 4) { toast.warning('New password must be at least 4 characters'); return }
    await api.post(`/users/${resetModal.user_id}/reset-password`, { new_password: newPassword })
    toast.success('Password reset'); setResetModal(null); setNewPassword('')
  }

  const roleBadge = (r) => r === 'Administrator' ? 'badge-issued' : 'badge-draft'

  const columns = [
    { key: 'user_id', label: 'User ID', width: 100 },
    { key: 'full_name', label: 'Full Name', sortable: true },
    { key: 'username', label: 'Username', sortable: true },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role', width: 130, render: (v) => <span className={`status-badge ${roleBadge(v)}`}>{v}</span> },
    { key: 'status', label: 'Status', width: 90, render: (v) => <span className={`status-badge ${statusBadgeClass(v)}`}>{v}</span> },
    { key: 'created_at', label: 'Created', width: 120, render: (v) => formatDate(v) },
    {
      key: 'actions', label: '', width: 140,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
          <button className="btn btn-sm btn-outline-warning" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => { setResetModal(row); setNewPassword('') }} title="Reset Password"><i className="bi bi-key" /></button>
          {row.user_id !== currentUser?.user_id && (
            <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
          )}
        </div>
      )
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">User Management</h5><small className="text-muted">Manage system users and roles</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />Add User</button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by name, username, email..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'Add New User' : 'Edit User'}
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save</button></>}>
        <div className="row g-3">
          {[{ label: 'Full Name *', key: 'full_name', type: 'text' }, { label: 'Username *', key: 'username', type: 'text', disabled: modal.mode === 'edit' }, { label: 'Email', key: 'email', type: 'email' }].map(f => (
            <div key={f.key} className="col-md-6">
              <label className="kh-form-label">{f.label}</label>
              <input className="form-control kh-input" type={f.type} disabled={f.disabled} value={form[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
            </div>
          ))}
          {modal.mode === 'create' && (
            <div className="col-md-6">
              <label className="kh-form-label">Password *</label>
              <input type="password" className="form-control kh-input" value={form.password} onChange={e => setForm(fm => ({ ...fm, password: e.target.value }))} />
            </div>
          )}
          <div className="col-md-6">
            <label className="kh-form-label">Role</label>
            <select className="form-select kh-input" value={form.role} onChange={e => setForm(fm => ({ ...fm, role: e.target.value }))}>
              <option>Staff</option><option>Administrator</option>
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Status</label>
            <select className="form-select kh-input" value={form.status} onChange={e => setForm(fm => ({ ...fm, status: e.target.value }))}>
              <option>Active</option><option>Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      <Modal show={!!resetModal} onClose={() => setResetModal(null)} title="Reset Password"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setResetModal(null)}>Cancel</button><button className="btn btn-warning" style={{ borderRadius: 8 }} onClick={handleResetPassword}><i className="bi bi-key me-1" />Reset</button></>}>
        <p>Reset password for <strong>{resetModal?.full_name}</strong></p>
        <label className="kh-form-label">New Password</label>
        <input type="password" className="form-control kh-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 4 characters" />
      </Modal>

      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Delete user <strong>{deleteModal?.full_name}</strong> ({deleteModal?.username})?</p>
      </Modal>
    </div>
  )
}
