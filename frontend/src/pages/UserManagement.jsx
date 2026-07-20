import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, statusBadgeClass, debounce } from '../utils/helpers'
import { useAuth } from '../context/AuthContext'

const USER_INIT = { full_name: '', username: '', email: '', password: '', role: 'Staff', status: 'Active' }

const MENU_LABELS = {
  dashboard:      'Dashboard',
  command_center: 'Command Center',
  products:       'Product Master',
  suppliers:      'Supplier Master',
  users:          'User Management',
  receiving:      'Receiving',
  qc:             'QC Inspection',
  qc_failed:      'QC Failed',
  inventory:      'Stock Inventory',
  stock_opname:   'Stock Opname',
  quotation:      'Quotation',
  invoice:        'Invoice',
  settings:       'Settings',
}

const PERM_ACTIONS = [
  { key: 'can_view',   label: 'View'   },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit',   label: 'Edit'   },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_approve',label: 'Approve'},
  { key: 'can_export', label: 'Export' },
]

export default function UserManagement() {
  const { user: currentUser } = useAuth()
  const [activeTab, setActiveTab] = useState('users')

  // --- Users tab state ---
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(USER_INIT)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)
  const [resetModal, setResetModal] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [roles, setRoles] = useState([])

  // --- Roles tab state ---
  const [roleList, setRoleList] = useState([])
  const [roleLoading, setRoleLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving] = useState(false)
  const [roleModal, setRoleModal] = useState({ show: false, mode: 'create', item: null })
  const [roleForm, setRoleForm] = useState({ name: '', description: '', color: '#6B7280' })
  const [deleteRoleModal, setDeleteRoleModal] = useState(null)

  // Fetch users
  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/users', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  const fetchRoleList = useCallback(async () => {
    try {
      const res = await api.get('/rbac/roles')
      setRoleList(res.data)
      setRoles(res.data.map(r => r.name))
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    fetchData(1)
    fetchRoleList()
  }, [])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const openCreate = () => { setForm(USER_INIT); setModal({ show: true, mode: 'create', item: null }) }
  const openEdit = (item) => {
    setForm({ full_name: item.full_name, username: item.username, email: item.email || '', password: '', role: item.role, status: item.status })
    setModal({ show: true, mode: 'edit', item })
  }

  const handleSave = async () => {
    if (!form.full_name || !form.username) { toast.warning('Full name and username are required'); return }
    if (!form.email || !form.email.trim()) { toast.warning('Email address is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { toast.warning('Please enter a valid email address'); return }
    if (modal.mode === 'create' && !form.password) { toast.warning('Password is required'); return }
    setSaving(true)
    try {
      if (modal.mode === 'create') {
        await api.post('/users', form); toast.success('User created')
      } else {
        await api.put(`/users/${modal.item.user_id}`, { full_name: form.full_name, email: form.email, role: form.role, status: form.status })
        toast.success('User updated')
      }
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

  // --- Roles tab actions ---
  const loadPermissions = async (roleName) => {
    setSelectedRole(roleName)
    setPermLoading(true)
    try {
      const res = await api.get(`/rbac/roles/${roleName}/permissions`)
      setPermissions(res.data)
    } finally { setPermLoading(false) }
  }

  const handlePermChange = (menuCode, action, value) => {
    setPermissions(prev => prev.map(p =>
      p.menu_code === menuCode ? { ...p, [action]: value } : p
    ))
  }

  const handlePermToggleAll = (action, value) => {
    setPermissions(prev => prev.map(p => ({ ...p, [action]: value })))
  }

  const savePermissions = async () => {
    setPermSaving(true)
    try {
      await api.put(`/rbac/roles/${selectedRole}/permissions`, { permissions })
      toast.success('Permissions saved')
    } catch (e) {
      toast.error('Failed to save permissions')
    } finally { setPermSaving(false) }
  }

  const openCreateRole = () => {
    setRoleForm({ name: '', description: '', color: '#6B7280' })
    setRoleModal({ show: true, mode: 'create', item: null })
  }

  const openEditRole = (role) => {
    setRoleForm({ name: role.name, description: role.description || '', color: role.color })
    setRoleModal({ show: true, mode: 'edit', item: role })
  }

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) { toast.warning('Role name is required'); return }
    try {
      if (roleModal.mode === 'create') {
        await api.post('/rbac/roles', roleForm); toast.success('Role created')
      } else {
        await api.put(`/rbac/roles/${roleModal.item.name}`, roleForm); toast.success('Role updated')
      }
      setRoleModal({ show: false }); fetchRoleList()
      if (selectedRole === roleModal.item?.name && roleForm.name !== roleModal.item?.name) {
        setSelectedRole(roleForm.name)
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to save role')
    }
  }

  const handleDeleteRole = async () => {
    try {
      await api.delete(`/rbac/roles/${deleteRoleModal.name}`)
      toast.success('Role deleted')
      if (selectedRole === deleteRoleModal.name) { setSelectedRole(null); setPermissions([]) }
      setDeleteRoleModal(null); fetchRoleList()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Cannot delete role')
    }
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
      ),
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="fw-bold mb-0">User Management</h5>
          <small className="text-muted">Manage system users, roles, and permissions</small>
        </div>
        {activeTab === 'users' && (
          <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}>
            <i className="bi bi-plus-lg me-1" />Add User
          </button>
        )}
        {activeTab === 'roles' && (
          <button className="btn btn-sm btn-kh-primary" onClick={openCreateRole} style={{ borderRadius: 8 }}>
            <i className="bi bi-plus-lg me-1" />Add Role
          </button>
        )}
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-3" style={{ borderColor: '#E4E7EC' }}>
        {[
          { id: 'users', label: 'Users', icon: 'bi-people' },
          { id: 'roles', label: 'Roles & Permissions', icon: 'bi-shield-check' },
        ].map(t => (
          <li key={t.id} className="nav-item">
            <button
              className={`nav-link${activeTab === t.id ? ' active' : ''}`}
              style={{ color: activeTab === t.id ? '#1a5276' : '#6c757d', fontWeight: activeTab === t.id ? 700 : 400, borderColor: activeTab === t.id ? '#E4E7EC #E4E7EC #fff' : 'transparent', background: 'none', borderRadius: '8px 8px 0 0', padding: '8px 18px', fontSize: 13 }}
              onClick={() => setActiveTab(t.id)}
            >
              <i className={`bi ${t.icon} me-1`} />{t.label}
            </button>
          </li>
        ))}
      </ul>

      {/* Users Tab */}
      {activeTab === 'users' && (
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
      )}

      {/* Roles & Permissions Tab */}
      {activeTab === 'roles' && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Role list sidebar */}
          <div className="kh-card" style={{ width: 240, flexShrink: 0 }}>
            <div className="kh-card-body" style={{ padding: 0 }}>
              {roleList.length === 0 ? (
                <div style={{ padding: 20, color: '#6c757d', fontSize: 13 }}>No roles found</div>
              ) : roleList.map(role => (
                <div
                  key={role.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    cursor: 'pointer', borderBottom: '1px solid #f0f2f5',
                    background: selectedRole === role.name ? '#EEF2F7' : '#fff',
                    borderLeft: selectedRole === role.name ? `3px solid ${role.color}` : '3px solid transparent',
                    transition: 'background 0.1s',
                  }}
                  onClick={() => loadPermissions(role.name)}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: role.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{role.name}</div>
                    {role.description && <div style={{ fontSize: 11, color: '#94a3b8' }}>{role.description}</div>}
                  </div>
                  {!role.is_system && (
                    <div className="d-flex gap-1">
                      <button className="btn btn-sm" style={{ padding: '1px 5px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); openEditRole(role) }}>
                        <i className="bi bi-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger" style={{ padding: '1px 5px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setDeleteRoleModal(role) }}>
                        <i className="bi bi-trash" />
                      </button>
                    </div>
                  )}
                  {role.is_system && (
                    <span style={{ fontSize: 10, padding: '1px 5px', background: '#e2e8f0', borderRadius: 4, color: '#64748b' }}>System</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permission matrix */}
          <div className="kh-card" style={{ flex: 1 }}>
            <div className="kh-card-body">
              {!selectedRole ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                  <i className="bi bi-shield-check" style={{ fontSize: 36, display: 'block', marginBottom: 8 }} />
                  <div style={{ fontSize: 14 }}>Select a role to manage permissions</div>
                </div>
              ) : permLoading ? (
                <div className="d-flex justify-content-center py-5"><div className="spinner-border text-primary" /></div>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h6 className="fw-bold mb-0" style={{ color: '#1e293b' }}>
                        Permissions — <span style={{ color: '#1a5276' }}>{selectedRole}</span>
                      </h6>
                      <small className="text-muted">Toggle menu access for this role</small>
                    </div>
                    <button className="btn btn-sm btn-kh-primary" style={{ borderRadius: 8 }} onClick={savePermissions} disabled={permSaving}>
                      {permSaving && <span className="spinner-border spinner-border-sm me-1" />}
                      <i className="bi bi-check-lg me-1" />Save Permissions
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '2px solid #E4E7EC', width: 180 }}>Module</th>
                          {PERM_ACTIONS.map(a => (
                            <th key={a.key} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#374151', borderBottom: '2px solid #E4E7EC', width: 72 }}>
                              <div>{a.label}</div>
                              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
                                <button title="All On" onClick={() => handlePermToggleAll(a.key, true)} style={{ fontSize: 10, border: 'none', background: '#dcfce7', color: '#166534', borderRadius: 3, padding: '1px 4px', cursor: 'pointer' }}>✓</button>
                                <button title="All Off" onClick={() => handlePermToggleAll(a.key, false)} style={{ fontSize: 10, border: 'none', background: '#fee2e2', color: '#991b1b', borderRadius: 3, padding: '1px 4px', cursor: 'pointer' }}>✗</button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {permissions.map((perm, idx) => (
                          <tr key={perm.menu_code} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFBFC', borderBottom: '1px solid #F0F2F5' }}>
                            <td style={{ padding: '8px 14px', fontWeight: 500, color: '#1e293b' }}>
                              {MENU_LABELS[perm.menu_code] || perm.menu_code}
                            </td>
                            {PERM_ACTIONS.map(a => (
                              <td key={a.key} style={{ padding: '8px', textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(perm[a.key])}
                                  onChange={e => handlePermChange(perm.menu_code, a.key, e.target.checked)}
                                  style={{ width: 16, height: 16, accentColor: '#1a5276', cursor: 'pointer' }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit User Modal */}
      <Modal
        show={modal.show}
        onClose={() => setModal({ show: false })}
        title={modal.mode === 'create' ? 'Add New User' : 'Edit User'}
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
          {[
            { label: 'Full Name *', key: 'full_name', type: 'text' },
            { label: 'Username *', key: 'username', type: 'text', disabled: modal.mode === 'edit' },
            { label: 'Email *', key: 'email', type: 'email' },
          ].map(f => (
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
              {roles.length > 0
                ? roles.map(r => <option key={r}>{r}</option>)
                : <><option>Staff</option><option>Administrator</option></>
              }
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

      {/* Create/Edit Role Modal */}
      <Modal
        show={roleModal.show}
        onClose={() => setRoleModal({ show: false })}
        title={roleModal.mode === 'create' ? 'Create Role' : 'Edit Role'}
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setRoleModal({ show: false })}>Cancel</button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSaveRole}>Save</button>
          </>
        }
      >
        <div className="row g-3">
          <div className="col-12">
            <label className="kh-form-label">Role Name *</label>
            <input className="form-control kh-input" value={roleForm.name} onChange={e => setRoleForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Finance Manager" disabled={roleModal.item?.is_system} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Description</label>
            <input className="form-control kh-input" value={roleForm.description} onChange={e => setRoleForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of this role" />
          </div>
          <div className="col-6">
            <label className="kh-form-label">Color</label>
            <div className="d-flex align-items-center gap-2">
              <input type="color" className="form-control" style={{ width: 48, height: 36, padding: 2, borderRadius: 6 }} value={roleForm.color} onChange={e => setRoleForm(f => ({ ...f, color: e.target.value }))} />
              <input className="form-control kh-input" value={roleForm.color} onChange={e => setRoleForm(f => ({ ...f, color: e.target.value }))} style={{ fontFamily: 'monospace' }} />
            </div>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        show={!!resetModal}
        onClose={() => setResetModal(null)}
        title="Reset Password"
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setResetModal(null)}>Cancel</button>
            <button className="btn btn-warning" style={{ borderRadius: 8 }} onClick={handleResetPassword}><i className="bi bi-key me-1" />Reset</button>
          </>
        }
      >
        <p>Reset password for <strong>{resetModal?.full_name}</strong></p>
        <label className="kh-form-label">New Password</label>
        <input type="password" className="form-control kh-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 4 characters" />
      </Modal>

      {/* Delete User Modal */}
      <Modal
        show={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        title="Confirm Delete"
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button>
          </>
        }
      >
        <p>Delete user <strong>{deleteModal?.full_name}</strong> ({deleteModal?.username})?</p>
      </Modal>

      {/* Delete Role Modal */}
      <Modal
        show={!!deleteRoleModal}
        onClose={() => setDeleteRoleModal(null)}
        title="Delete Role"
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteRoleModal(null)}>Cancel</button>
            <button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDeleteRole}>Delete</button>
          </>
        }
      >
        <p>Delete role <strong>{deleteRoleModal?.name}</strong>? Users assigned to this role will retain the role name but lose their permissions.</p>
      </Modal>
    </div>
  )
}
