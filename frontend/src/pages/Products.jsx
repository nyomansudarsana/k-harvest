import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, statusBadgeClass, exportToExcel, debounce } from '../utils/helpers'

const UNITS = ['Kg', 'Liter', 'Piece', 'Box', 'Other']
const INIT = { commodity: '', origin: '', categories: '', product_name: '', unit: 'Kg', status: 'Active' }

export default function Products() {
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
      const res = await api.get('/products', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])

  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const openCreate = () => { setForm(INIT); setModal({ show: true, mode: 'create', item: null }) }
  const openEdit = (item) => { setForm({ commodity: item.commodity, origin: item.origin || '', categories: item.categories || '', product_name: item.product_name, unit: item.unit, status: item.status }); setModal({ show: true, mode: 'edit', item }) }

  const handleSave = async () => {
    if (!form.commodity || !form.product_name) { toast.warning('Commodity and Product Name are required'); return }
    setSaving(true)
    try {
      if (modal.mode === 'create') { await api.post('/products', form); toast.success('Product created') }
      else { await api.put(`/products/${modal.item.commodity_id}`, form); toast.success('Product updated') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.delete(`/products/${deleteModal.commodity_id}`)
    toast.success('Product deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const handleExport = async () => {
    const res = await api.get('/products/all')
    exportToExcel(res.data.map(p => ({ 'Commodity ID': p.commodity_id, 'Commodity': p.commodity, 'Origin': p.origin, 'Category': p.categories, 'Product Name': p.product_name, 'Unit': p.unit, 'Status': p.status })), 'products')
  }

  const columns = [
    { key: 'commodity_id', label: 'ID', width: 100, sortable: true },
    { key: 'commodity', label: 'Commodity', sortable: true },
    { key: 'origin', label: 'Origin' },
    { key: 'categories', label: 'Category' },
    { key: 'product_name', label: 'Product Name', sortable: true },
    { key: 'unit', label: 'Unit', width: 80 },
    { key: 'status', label: 'Status', width: 90, render: (v) => <span className={`status-badge ${statusBadgeClass(v)}`}>{v}</span> },
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
          <h5 className="fw-bold mb-0">Product Master</h5>
          <small className="text-muted">Manage commodity and product records</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-success" onClick={handleExport} style={{ borderRadius: 8 }}><i className="bi bi-file-excel me-1" />Export</button>
          <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />Add Product</button>
        </div>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by ID, name, commodity..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'Add New Product' : 'Edit Product'}
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving ? <span className="spinner-border spinner-border-sm me-1" /> : null}Save</button></>}>
        <div className="row g-3">
          {[
            { label: 'Commodity *', key: 'commodity', type: 'text', placeholder: 'e.g. Coffee Arabica' },
            { label: 'Product Name *', key: 'product_name', type: 'text', placeholder: 'Full product name' },
            { label: 'Origin', key: 'origin', type: 'text', placeholder: 'e.g. Ethiopia' },
            { label: 'Category', key: 'categories', type: 'text', placeholder: 'e.g. Coffee' },
          ].map(f => (
            <div key={f.key} className="col-md-6">
              <label className="kh-form-label">{f.label}</label>
              <input className="form-control kh-input" type={f.type} placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div className="col-md-6">
            <label className="kh-form-label">Unit *</label>
            <select className="form-select kh-input" value={form.unit} onChange={e => setForm(fm => ({ ...fm, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
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

      {/* Delete Confirm */}
      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Are you sure you want to delete <strong>{deleteModal?.product_name}</strong>? This action cannot be undone.</p>
      </Modal>
    </div>
  )
}
