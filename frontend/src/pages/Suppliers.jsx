import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, exportToExcel, debounce } from '../utils/helpers'

const INIT = { supplier_name: '', contact_number: '', contact_email: '', location: '' }

export default function Suppliers() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/suppliers', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }
  const openCreate = () => { setForm(INIT); setModal({ show: true, mode: 'create', item: null }) }
  const openEdit = (item) => { setForm({ supplier_name: item.supplier_name, contact_number: item.contact_number || '', contact_email: item.contact_email || '', location: item.location || '' }); setModal({ show: true, mode: 'edit', item }) }

  const handleSave = async () => {
    if (!form.supplier_name) { toast.warning('Supplier Name is required'); return }
    setSaving(true)
    try {
      if (modal.mode === 'create') { await api.post('/suppliers', form); toast.success('Supplier created') }
      else { await api.put(`/suppliers/${modal.item.supplier_id}`, form); toast.success('Supplier updated') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.delete(`/suppliers/${deleteModal.supplier_id}`)
    toast.success('Supplier deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const handleExport = async () => {
    const res = await api.get('/suppliers/all')
    exportToExcel(res.data.map(s => ({ 'Supplier ID': s.supplier_id, 'Supplier Name': s.supplier_name, 'Contact Number': s.contact_number, 'Email': s.contact_email, 'Location': s.location })), 'suppliers')
  }

  const columns = [
    { key: 'supplier_id', label: 'ID', width: 100, sortable: true },
    { key: 'supplier_name', label: 'Supplier Name', sortable: true },
    { key: 'contact_number', label: 'Phone' },
    { key: 'contact_email', label: 'Email' },
    { key: 'location', label: 'Location' },
    { key: 'created_at', label: 'Created', width: 120, render: (v) => formatDate(v) },
    {
      key: 'actions', label: '', width: 100,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
          <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
        </div>
      )
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-0">Supplier Master</h5>
          <small className="text-muted">Manage supplier records</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-success" onClick={handleExport} style={{ borderRadius: 8 }}><i className="bi bi-file-excel me-1" />Export</button>
          <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />Add Supplier</button>
        </div>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by name, ID, location..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'Add New Supplier' : 'Edit Supplier'}
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save</button></>}>
        <div className="row g-3">
          {[
            { label: 'Supplier Name *', key: 'supplier_name', placeholder: 'Company name' },
            { label: 'Contact Number', key: 'contact_number', placeholder: '+1 234 567 890' },
            { label: 'Contact Email', key: 'contact_email', placeholder: 'email@example.com' },
          ].map(f => (
            <div key={f.key} className="col-md-6">
              <label className="kh-form-label">{f.label}</label>
              <input className="form-control kh-input" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div className="col-12">
            <label className="kh-form-label">Location</label>
            <input className="form-control kh-input" placeholder="City, Country" value={form.location} onChange={e => setForm(fm => ({ ...fm, location: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Delete supplier <strong>{deleteModal?.supplier_name}</strong>?</p>
      </Modal>
    </div>
  )
}
