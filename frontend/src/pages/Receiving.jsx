import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatDate, formatNumber, debounce } from '../utils/helpers'

const EXTRA_COST_TYPES = ['Handling Labor', 'Truck Rental', 'Packaging', 'Storage', 'Fuel', 'Inspection Cost', 'Other']

const INIT = {
  date_received: new Date().toISOString().split('T')[0],
  commodity_id: '', product_name: '', supplier_id: '', supplier_name: '',
  quantity: '', harvest_date: '', expired_date: '',
  purchase_price: '', delivery_cost: '', remarks: '',
}

const INIT_EXTRA = { cost_type: 'Handling Labor', amount: '' }

export default function Receiving() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [extraCosts, setExtraCosts] = useState([])
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

  const loadMasters = () => {
    api.get('/products/all').then(r => {
      if (Array.isArray(r.data))
        setProducts(r.data.map(p => ({ value: p.commodity_id, label: `${p.commodity_id} — ${p.product_name}`, product: p })))
    }).catch(() => { })
    api.get('/suppliers/all').then(r => {
      if (Array.isArray(r.data))
        setSuppliers(r.data.map(s => ({ value: s.supplier_id, label: `${s.supplier_id} — ${s.supplier_name}`, supplier: s })))
    }).catch(() => { })
  }

  useEffect(() => { fetchData(1); loadMasters() }, [])
  useEffect(() => { if (modal.show) loadMasters() }, [modal.show])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const openCreate = () => {
    setForm(INIT); setExtraCosts([]); setModal({ show: true, mode: 'create', item: null })
  }

  const openEdit = (item) => {
    setForm({
      date_received: item.date_received || new Date().toISOString().split('T')[0],
      commodity_id: item.commodity_id, product_name: item.product_name,
      supplier_id: item.supplier_id, supplier_name: item.supplier_name,
      quantity: item.quantity, harvest_date: item.harvest_date || '',
      expired_date: item.expired_date || '', purchase_price: item.purchase_price || '',
      delivery_cost: item.delivery_cost || '', remarks: item.remarks || '',
    })
    setExtraCosts((item.extra_costs || []).map(e => ({ ...e, _id: e.id })))
    setModal({ show: true, mode: 'edit', item })
  }

  const handleProductChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, commodity_id: '', product_name: '' })); return }
    setForm(f => ({ ...f, commodity_id: opt.product.commodity_id, product_name: opt.product.product_name }))
  }

  const handleSupplierChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, supplier_id: '', supplier_name: '' })); return }
    setForm(f => ({ ...f, supplier_id: opt.supplier.supplier_id, supplier_name: opt.supplier.supplier_name }))
  }

  const addExtraCost = () => setExtraCosts(c => [...c, { ...INIT_EXTRA, _tempId: Date.now() }])
  const removeExtraCost = (idx) => setExtraCosts(c => c.filter((_, i) => i !== idx))
  const updateExtraCost = (idx, field, val) =>
    setExtraCosts(c => c.map((e, i) => i === idx ? { ...e, [field]: val } : e))

  const totalCostBasis = () => {
    const base = (Number(form.purchase_price) || 0) + (Number(form.delivery_cost) || 0)
    const extra = extraCosts.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return base + extra
  }

  const handleSave = async () => {
    if (!form.commodity_id || !form.supplier_id || !form.quantity || !form.date_received) {
      toast.warning('Please fill all required fields'); return
    }
    if (Number(form.quantity) <= 0) { toast.warning('Quantity must be > 0'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity),
        purchase_price: Number(form.purchase_price) || 0,
        delivery_cost: Number(form.delivery_cost) || 0,
        harvest_date: form.harvest_date || null,
        expired_date: form.expired_date || null,
      }

      let receivingId
      if (modal.mode === 'create') {
        const res = await api.post('/receiving', payload)
        receivingId = res.data.receiving_id
        toast.success('Receiving saved — inventory updated')
      } else {
        receivingId = modal.item.receiving_id
        await api.put(`/receiving/${receivingId}`, payload)
        toast.success('Receiving updated')
      }

      // Sync extra costs: delete removed ones, add new ones
      const existingIds = new Set((modal.item?.extra_costs || []).map(e => e.id))
      const keptIds = new Set(extraCosts.filter(e => e._id).map(e => e._id))
      for (const id of existingIds) {
        if (!keptIds.has(id)) {
          await api.delete(`/receiving/${receivingId}/extra-costs/${id}`).catch(() => { })
        }
      }
      for (const cost of extraCosts) {
        if (!cost._id && Number(cost.amount) > 0) {
          await api.post(`/receiving/${receivingId}/extra-costs`, {
            cost_type: cost.cost_type, amount: Number(cost.amount),
          }).catch(() => { })
        }
      }

      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    await api.delete(`/receiving/${deleteModal.receiving_id}`)
    toast.success('Record deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const expiryClass = (exp) => {
    if (!exp) return ''
    const days = Math.ceil((new Date(exp) - new Date()) / 86400000)
    if (days < 0) return 'text-danger fw-bold'
    if (days <= 7) return 'text-danger'
    if (days <= 14) return 'text-warning fw-semibold'
    if (days <= 30) return 'text-warning'
    return ''
  }

  const columns = [
    { key: 'batch_id', label: 'Batch ID', width: 160 },
    { key: 'date_received', label: 'Date', width: 110, render: (v) => formatDate(v) },
    { key: 'commodity_id', label: 'Comm. ID', width: 100 },
    { key: 'product_name', label: 'Product' },
    { key: 'supplier_name', label: 'Supplier' },
    { key: 'quantity', label: 'Qty', width: 80, render: (v) => formatNumber(v, 0) },
    { key: 'total_cost_basis', label: 'Total Cost/Unit', width: 130, render: (v) => `IDR ${formatNumber(v)}` },
    {
      key: 'expired_date', label: 'Expiry', width: 120,
      render: (v) => <span className={expiryClass(v)}>{formatDate(v)}</span>,
    },
    {
      key: 'actions', label: '', width: 100,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
          <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
        </div>
      ),
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
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by batch, product, supplier..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        show={modal.show} onClose={() => setModal({ show: false })}
        title={modal.mode === 'create' ? 'New Receiving' : `Edit Receiving — ${modal.item?.batch_id}`}
        size="lg"
        footer={
          <>
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              {modal.mode === 'create' ? 'Save & Update Stock' : 'Update'}
            </button>
          </>
        }>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="kh-form-label">Date Received *</label>
            <input type="date" className="form-control kh-input" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Product *</label>
            {modal.mode === 'create'
              ? <SearchableSelect options={products} value={form.commodity_id} onChange={handleProductChange} placeholder="Select product..." />
              : <input className="form-control kh-input" value={`${form.commodity_id} — ${form.product_name}`} readOnly style={{ background: '#f8fafc' }} />
            }
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Supplier *</label>
            {modal.mode === 'create'
              ? <SearchableSelect options={suppliers} value={form.supplier_id} onChange={handleSupplierChange} placeholder="Select supplier..." />
              : <input className="form-control kh-input" value={`${form.supplier_id} — ${form.supplier_name}`} readOnly style={{ background: '#f8fafc' }} />
            }
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Quantity *</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Purchase Price (IDR/unit)</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0" step="0.01" value={form.purchase_price} onChange={e => setForm(f => ({ ...f, purchase_price: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Delivery Cost (IDR/unit)</label>
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

          {/* Extra Costs */}
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="kh-form-label mb-0">Additional Costs</label>
              <button type="button" className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 6 }} onClick={addExtraCost}>
                <i className="bi bi-plus me-1" />Add Cost
              </button>
            </div>
            {extraCosts.length === 0
              ? <div className="text-muted small" style={{ padding: '8px 0' }}>No additional costs. Click "Add Cost" to add.</div>
              : extraCosts.map((cost, idx) => (
                <div key={cost._id || cost._tempId || idx} className="d-flex gap-2 mb-2 align-items-center">
                  <select className="form-select kh-input" style={{ maxWidth: 200 }} value={cost.cost_type} onChange={e => updateExtraCost(idx, 'cost_type', e.target.value)}>
                    {EXTRA_COST_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <div className="input-group" style={{ maxWidth: 160 }}>
                    <span className="input-group-text" style={{ background: '#f8fafc', fontSize: '0.8rem' }}>IDR</span>
                    <input type="number" className="form-control kh-input" placeholder="0" min="0" step="0.01" value={cost.amount} onChange={e => updateExtraCost(idx, 'amount', e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6 }} onClick={() => removeExtraCost(idx)}>
                    <i className="bi bi-x" />
                  </button>
                </div>
              ))}

            {/* Total Cost Summary */}
            <div className="mt-3 p-3 rounded" style={{ background: '#f0f7f0', border: '1px solid #c3e6cb' }}>
              <div className="d-flex justify-content-between" style={{ fontSize: '0.85rem' }}>
                <span>Purchase Price</span>
                <span>IDR {formatNumber(Number(form.purchase_price) || 0)}</span>
              </div>
              <div className="d-flex justify-content-between" style={{ fontSize: '0.85rem' }}>
                <span>Delivery Cost</span>
                <span>IDR {formatNumber(Number(form.delivery_cost) || 0)}</span>
              </div>
              {extraCosts.map((c, i) => (
                <div key={i} className="d-flex justify-content-between" style={{ fontSize: '0.85rem' }}>
                  <span>{c.cost_type}</span>
                  <span>IDR {formatNumber(Number(c.amount) || 0)}</span>
                </div>
              ))}
              <hr className="my-1" />
              <div className="d-flex justify-content-between fw-semibold" style={{ fontSize: '0.9rem', color: '#1A5C28' }}>
                <span>Total Cost Basis / Unit</span>
                <span>IDR {formatNumber(totalCostBasis())}</span>
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Delete batch <strong>{deleteModal?.batch_id}</strong>?</p>
        <div className="alert alert-warning mt-2"><i className="bi bi-exclamation-triangle me-2" />Deleting a receiving record does not automatically reverse inventory. Adjust stock manually if needed.</div>
      </Modal>
    </div>
  )
}
