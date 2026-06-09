import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatDate, formatNumber, exportToExcel, debounce } from '../utils/helpers'

const INIT = { date_received: new Date().toISOString().split('T')[0], commodity_id: '', product_name: '', supplier_id: '', supplier_name: '', quantity: '', harvest_date: '', expired_date: '', purchase_price: '', delivery_cost: '', remarks: '' }

export default function Receiving() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [deleteModal, setDeleteModal] = useState(null)

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/receiving', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    fetchData(1)
    api.get('/products/all')
      .then(r => {
        console.log("Products API Response:", r.data);
        const mapped = r.data.map(p => ({ value: p.commodity_id, label: `${p.commodity_id} - ${p.product_name}`, product: p }))
        console.log("Mapped products:", mapped);
        setProducts(mapped)
      })
      .catch(err => {
        console.error("Products API Error:", err);
        toast.error(`Failed to load products: ${err.message}`)
      })
    api.get('/suppliers/all')
      .then(r => {
        console.log("Suppliers API Response:", r.data);
        const mapped = r.data.map(s => ({ value: s.supplier_id, label: `${s.supplier_id} - ${s.supplier_name}`, supplier: s }))
        console.log("Mapped suppliers:", mapped);
        setSuppliers(mapped)
      })
      .catch(err => {
        console.error("Suppliers API Error:", err);
        toast.error(`Failed to load suppliers: ${err.message}`)
      })
  }, [])

  useEffect(() => {
    if (modal.show) {
      api.get('/products/all')
        .then(r => {
          console.log("Products refresh on modal open:", r.data);
          if (!Array.isArray(r.data)) return
          setProducts(r.data.map(p => ({ value: p.commodity_id, label: `${p.commodity_id} - ${p.product_name}`, product: p })))
        })
        .catch(err => console.error("Products refresh error:", err))
      api.get('/suppliers/all')
        .then(r => {
          console.log("Suppliers refresh on modal open:", r.data);
          if (!Array.isArray(r.data)) return
          setSuppliers(r.data.map(s => ({ value: s.supplier_id, label: `${s.supplier_id} - ${s.supplier_name}`, supplier: s })))
        })
        .catch(err => console.error("Suppliers refresh error:", err))
    }
  }, [modal.show])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }
  const openCreate = () => { setForm(INIT); setModal({ show: true, mode: 'create', item: null }) }

  const handleProductChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, commodity_id: '', product_name: '' })); return }
    setForm(f => ({ ...f, commodity_id: opt.product.commodity_id, product_name: opt.product.product_name }))
  }

  const handleSupplierChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, supplier_id: '', supplier_name: '' })); return }
    setForm(f => ({ ...f, supplier_id: opt.supplier.supplier_id, supplier_name: opt.supplier.supplier_name }))
  }

  const handleSave = async () => {
    if (!form.commodity_id || !form.supplier_id || !form.quantity || !form.date_received) {
      toast.warning('Please fill all required fields'); return
    }
    if (Number(form.quantity) <= 0) { toast.warning('Quantity must be > 0'); return }
    setSaving(true)
    try {
      await api.post('/receiving', { ...form, quantity: Number(form.quantity), purchase_price: Number(form.purchase_price) || 0, delivery_cost: Number(form.delivery_cost) || 0, harvest_date: form.harvest_date || null, expired_date: form.expired_date || null })
      toast.success('Receiving saved — inventory updated'); setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.delete(`/receiving/${deleteModal.receiving_id}`)
    toast.success('Record deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const columns = [
    { key: 'receiving_id', label: 'ID', width: 100 },
    { key: 'date_received', label: 'Date', width: 110, render: (v) => formatDate(v) },
    { key: 'commodity_id', label: 'Comm. ID', width: 100 },
    { key: 'product_name', label: 'Product' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'quantity', label: 'Qty', width: 90, render: (v) => formatNumber(v, 0) },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'purchase_price', label: 'Price', width: 90, render: (v) => `$${formatNumber(v)}` },
    { key: 'expired_date', label: 'Exp. Date', width: 110, render: (v) => formatDate(v) },
    {
      key: 'actions', label: '', width: 80,
      render: (_, row) => (
        <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
      )
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Receiving</h5><small className="text-muted">Record incoming harvest products</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />New Receiving</button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by product, batch, supplier..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      <Modal show={modal.show} onClose={() => setModal({ show: false })} title="New Receiving" size="lg"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save & Update Stock</button></>}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="kh-form-label">Date Received *</label>
            <input type="date" className="form-control kh-input" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Product *</label>
            <SearchableSelect options={products} value={form.commodity_id} onChange={handleProductChange} placeholder="Select product..." />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Supplier *</label>
            <SearchableSelect options={suppliers} value={form.supplier_id} onChange={handleSupplierChange} placeholder="Select supplier..." />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Quantity *</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Purchase Price (IDR)</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0" step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Delivery Cost Per Unit (IDR)</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0" step="0.01" value={form.delivery_cost} onChange={e => setForm(f => ({ ...f, delivery_cost: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Harvest Date</label>
            <input type="date" className="form-control kh-input" value={form.harvest_date} onChange={e => setForm(f => ({ ...f, harvest_date: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Expiry Date</label>
            <input type="date" className="form-control kh-input" value={form.expired_date} onChange={e => setForm(f => ({ ...f, expired_date: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Remarks</label>
            <textarea className="form-control kh-input" rows={2} placeholder="Optional notes..." value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Delete receiving record <strong>{deleteModal?.receiving_id}</strong> for batch <strong>{deleteModal?.batch_id}</strong>?</p>
        <div className="alert alert-warning mt-2"><i className="bi bi-exclamation-triangle me-2" />Note: Deleting a receiving record does not automatically reverse the inventory. Please adjust stock manually if needed.</div>
      </Modal>
    </div>
  )
}
