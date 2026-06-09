import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatDate, formatNumber, debounce } from '../utils/helpers'

const INIT = { opname_date: new Date().toISOString().split('T')[0], commodity_id: '', product_name: '', batch_id: '', physical_qty: '', remarks: '' }

export default function StockOpname() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(INIT)
  const [systemQty, setSystemQty] = useState(null)
  const [saving, setSaving] = useState(false)
  const [batches, setBatches] = useState([])
  const [loadingQty, setLoadingQty] = useState(false)

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/stock-opname', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => {
    fetchData(1)
    api.get('/receiving/batches')
      .then(r => {
        console.log("StockOpname Batches API Response:", r.data);
        if (!Array.isArray(r.data)) return
        const mapped = r.data.map(b => ({ value: b.batch_id, label: `${b.batch_id} - ${b.product_name} (${formatNumber(b.available_qty, 0)} avail)`, data: b }))
        console.log("Mapped StockOpname batches:", mapped);
        setBatches(mapped)
      })
      .catch(err => {
        console.error("StockOpname Batches API Error:", err);
        toast.error(`Failed to load batches: ${err.message}`)
      })
  }, [])

  useEffect(() => {
    if (modal) {
      api.get('/receiving/batches')
        .then(r => {
          console.log("StockOpname Batches refresh on modal open:", r.data);
          if (!Array.isArray(r.data)) return
          const mapped = r.data.map(b => ({ value: b.batch_id, label: `${b.batch_id} - ${b.product_name} (${formatNumber(b.available_qty, 0)} avail)`, data: b }))
          setBatches(mapped)
        })
        .catch(err => console.error("StockOpname Batches refresh error:", err))
    }
  }, [modal])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const handleBatchChange = async (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, batch_id: '', commodity_id: '', product_name: '' })); setSystemQty(null); return }
    setForm(f => ({ ...f, batch_id: opt.data.batch_id, commodity_id: opt.data.commodity_id, product_name: opt.data.product_name }))
    setLoadingQty(true)
    try {
      const res = await api.get(`/stock-opname/system-qty/${opt.data.batch_id}`)
      setSystemQty(res.data.system_qty)
    } catch { setSystemQty(null) }
    finally { setLoadingQty(false) }
  }

  const difference = systemQty !== null && form.physical_qty !== '' ? Number(form.physical_qty) - systemQty : null

  const handleSave = async () => {
    if (!form.batch_id || !form.opname_date || form.physical_qty === '') { toast.warning('Fill all required fields'); return }
    if (Number(form.physical_qty) < 0) { toast.warning('Physical quantity cannot be negative'); return }
    setSaving(true)
    try {
      await api.post('/stock-opname', { ...form, physical_qty: Number(form.physical_qty) })
      toast.success('Stock opname saved — inventory adjusted'); setModal(false); setForm(INIT); setSystemQty(null); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const columns = [
    { key: 'opname_id', label: 'ID', width: 100 },
    { key: 'opname_date', label: 'Date', width: 110, render: (v) => formatDate(v) },
    { key: 'product_name', label: 'Product' },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'system_qty', label: 'System Qty', width: 110, render: (v) => formatNumber(v, 0) },
    { key: 'physical_qty', label: 'Physical Qty', width: 110, render: (v) => formatNumber(v, 0) },
    { key: 'difference', label: 'Difference', width: 110, render: (v) => <span className={`fw-semibold ${v > 0 ? 'text-success' : v < 0 ? 'text-danger' : ''}`}>{v > 0 ? '+' : ''}{formatNumber(v, 0)}</span> },
    { key: 'remarks', label: 'Remarks' },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Stock Opname</h5><small className="text-muted">Physical stock count and adjustment</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={() => { setForm(INIT); setSystemQty(null); setModal(true) }} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />New Opname</button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by batch or product..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      <Modal show={modal} onClose={() => setModal(false)} title="New Stock Opname" size="md"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal(false)}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save & Adjust</button></>}>
        <div className="row g-3">
          <div className="col-12">
            <label className="kh-form-label">Opname Date *</label>
            <input type="date" className="form-control kh-input" value={form.opname_date} onChange={e => setForm(f => ({ ...f, opname_date: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Select Batch *</label>
            <SearchableSelect options={batches} value={form.batch_id} onChange={handleBatchChange} placeholder="Select batch from inventory..." />
          </div>

          {form.batch_id && (
            <>
              <div className="col-md-6">
                <label className="kh-form-label">Commodity ID</label>
                <input className="form-control kh-input" value={form.commodity_id} readOnly style={{ background: '#f8fafc' }} />
              </div>
              <div className="col-md-6">
                <label className="kh-form-label">System Quantity</label>
                <input className="form-control kh-input" value={loadingQty ? 'Loading...' : (systemQty !== null ? formatNumber(systemQty, 0) : '-')} readOnly style={{ background: '#f0f7ff', fontWeight: 600 }} />
              </div>
              <div className="col-md-6">
                <label className="kh-form-label">Physical Quantity *</label>
                <input type="number" className="form-control kh-input" placeholder="Enter counted qty" min="0" step="0.01" value={form.physical_qty} onChange={e => setForm(f => ({ ...f, physical_qty: e.target.value }))} />
              </div>
              {difference !== null && (
                <div className="col-md-6">
                  <label className="kh-form-label">Difference</label>
                  <input className="form-control kh-input" value={`${difference > 0 ? '+' : ''}${formatNumber(difference, 0)}`} readOnly style={{ background: difference < 0 ? '#fff0f0' : difference > 0 ? '#f0fff4' : '#f8fafc', fontWeight: 700, color: difference < 0 ? '#dc3545' : difference > 0 ? '#28a745' : '#333' }} />
                </div>
              )}
            </>
          )}
          <div className="col-12">
            <label className="kh-form-label">Remarks</label>
            <textarea className="form-control kh-input" rows={2} placeholder="Optional notes..." value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
