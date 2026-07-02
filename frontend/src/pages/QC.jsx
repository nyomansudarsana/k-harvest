import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, statusBadgeClass, debounce } from '../utils/helpers'

const PRODUCT_GRADES = ['Gourmet', 'Grade A', 'Grade B', 'Grade C', 'Reject']
const DRAFT_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected']

const INIT = {
  batch_id: '', commodity_id: '', product_name: '',
  moisture_content: '', quality_grade: 'A', inspection_date: new Date().toISOString().split('T')[0],
  qc_status: 'Pending', remarks: '',
  product_grade: '', draft_status: 'Submitted',
  passed_qty: '', failed_qty: '',
}

// Simple async searchable batch dropdown
function BatchSelect({ value, onChange }) {
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const search = useCallback(debounce(async (q) => {
    setLoading(true)
    try {
      const res = await api.get('/qc/available-batches', { params: { search: q || undefined } })
      setOptions(Array.isArray(res.data) ? res.data : [])
    } finally { setLoading(false) }
  }, 300), [])

  useEffect(() => {
    if (open) search(query)
  }, [query, open])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (opt) => {
    setQuery(`${opt.batch_id} — ${opt.product_name}`)
    setOpen(false)
    onChange(opt)
  }

  const handleClear = () => {
    setQuery(''); setOpen(false); onChange(null)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="input-group">
        <input
          className="form-control kh-input"
          placeholder="Search batch ID or product..."
          value={query}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
        />
        {value && <button type="button" className="btn btn-outline-secondary" style={{ borderRadius: '0 8px 8px 0' }} onClick={handleClear}><i className="bi bi-x" /></button>}
      </div>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1050, background: '#fff', border: '1px solid #d1d9e0', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto' }}>
          {loading && <div className="text-center text-muted py-2" style={{ fontSize: '0.8rem' }}>Searching...</div>}
          {!loading && options.length === 0 && <div className="text-center text-muted py-2" style={{ fontSize: '0.8rem' }}>No available batches</div>}
          {options.map(opt => (
            <div key={opt.batch_id} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', fontSize: '0.85rem' }}
              onMouseDown={() => handleSelect(opt)}
              onMouseEnter={e => e.currentTarget.style.background = '#f0f7f0'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <div className="fw-semibold">{opt.batch_id}</div>
              <div className="text-muted" style={{ fontSize: '0.78rem' }}>{opt.product_name} · {opt.commodity_id} · Qty: {opt.available_qty}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function QC() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/qc', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])
  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const openCreate = () => { setForm(INIT); setModal({ show: true, mode: 'create', item: null }) }
  const openEdit = (item) => {
    setForm({
      batch_id: item.batch_id, commodity_id: item.commodity_id || '',
      product_name: item.product_name || '',
      moisture_content: item.moisture_content || '',
      quality_grade: item.quality_grade || 'A',
      inspection_date: item.inspection_date || '',
      qc_status: item.qc_status,
      remarks: item.remarks || '',
      product_grade: item.product_grade || '',
      draft_status: item.draft_status || 'Submitted',
      passed_qty: item.passed_qty || '',
      failed_qty: item.failed_qty || '',
    })
    setModal({ show: true, mode: 'edit', item })
  }

  const handleBatchSelect = (opt) => {
    if (!opt) { setForm(f => ({ ...f, batch_id: '', commodity_id: '', product_name: '' })); return }
    setForm(f => ({
      ...f,
      batch_id: opt.batch_id,
      commodity_id: opt.commodity_id,
      product_name: opt.product_name,
    }))
  }

  const buildPayload = (draftOverride) => ({
    batch_id: form.batch_id,
    commodity_id: form.commodity_id || null,
    product_name: form.product_name || null,
    moisture_content: form.moisture_content ? Number(form.moisture_content) : null,
    quality_grade: form.quality_grade,
    inspection_date: form.inspection_date || null,
    qc_status: form.qc_status,
    remarks: form.remarks,
    product_grade: form.product_grade || null,
    draft_status: draftOverride ?? form.draft_status,
    passed_qty: form.passed_qty !== '' ? Number(form.passed_qty) : null,
    failed_qty: form.failed_qty !== '' ? Number(form.failed_qty) : null,
  })

  const handleSaveDraft = async () => {
    if (!form.batch_id) { toast.warning('Batch ID is required even for Draft'); return }
    setSaving(true)
    try {
      const payload = buildPayload('Draft')
      if (modal.mode === 'create') { await api.post('/qc', payload); toast.success('QC saved as Draft') }
      else { await api.put(`/qc/${modal.item.qc_id}`, { ...payload, draft_status: 'Draft' }); toast.success('QC updated as Draft') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleSave = async () => {
    if (!form.batch_id) { toast.warning('Batch ID is required'); return }
    if (form.draft_status !== 'Draft' && !form.commodity_id) { toast.warning('Commodity ID is required for non-Draft QC'); return }
    setSaving(true)
    try {
      const payload = buildPayload(form.draft_status)
      if (modal.mode === 'create') { await api.post('/qc', payload); toast.success('QC record created') }
      else { await api.put(`/qc/${modal.item.qc_id}`, payload); toast.success('QC record updated') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const draftBadge = (ds) => {
    const map = { Draft: 'badge-draft', Submitted: 'badge-pending', Approved: 'badge-passed', Rejected: 'badge-failed' }
    return map[ds] || 'badge-draft'
  }
  const qcBadge = (s) => ({ Pending: 'badge-pending', Passed: 'badge-passed', Failed: 'badge-failed' }[s] || 'badge-draft')

  const columns = [
    { key: 'qc_id', label: 'QC ID', width: 100 },
    { key: 'batch_id', label: 'Batch ID', width: 140 },
    { key: 'commodity_id', label: 'Comm. ID', width: 100 },
    { key: 'moisture_content', label: 'Moisture %', width: 100, render: (v) => v ? `${v}%` : '-' },
    { key: 'quality_grade', label: 'Grade', width: 70 },
    { key: 'product_grade', label: 'Product Grade', width: 110 },
    {
      key: 'passed_qty', label: 'Pass / Fail', width: 110,
      render: (v, row) => (
        <span style={{ fontSize: '0.82rem' }}>
          <span className="text-success fw-semibold">{row.passed_qty ?? '-'}</span>
          <span className="text-muted mx-1">/</span>
          <span className="text-danger fw-semibold">{row.failed_qty ?? '-'}</span>
        </span>
      ),
    },
    { key: 'inspection_date', label: 'Insp. Date', width: 110, render: (v) => formatDate(v) },
    { key: 'qc_status', label: 'QC Status', width: 90, render: (v) => <span className={`status-badge ${qcBadge(v)}`}>{v}</span> },
    { key: 'draft_status', label: 'Record Status', width: 110, render: (v) => <span className={`status-badge ${draftBadge(v)}`}>{v || 'Submitted'}</span> },
    {
      key: 'actions', label: '', width: 80,
      render: (_, row) => (
        <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}>
          <i className="bi bi-pencil" />
        </button>
      ),
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-0">Quality Control</h5>
          <small className="text-muted">QC inspection and grade records</small>
        </div>
        <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />Add QC Record</button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by Batch ID or QC ID..." value={search} onChange={handleSearch} />
              </div>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      <Modal
        show={modal.show} onClose={() => setModal({ show: false })}
        title={modal.mode === 'create' ? 'New QC Record' : `Edit QC — ${modal.item?.qc_id}`}
        size="lg"
        footer={
          <div className="d-flex gap-2 w-100 justify-content-end">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={handleSaveDraft} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}Save as Draft
            </button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}Save
            </button>
          </div>
        }>
        <div className="row g-3">
          {/* Batch — searchable dropdown on create, read-only on edit */}
          <div className="col-md-6">
            <label className="kh-form-label">Batch ID *</label>
            {modal.mode === 'create'
              ? <BatchSelect value={form.batch_id} onChange={handleBatchSelect} />
              : <input className="form-control kh-input" value={form.batch_id} readOnly style={{ background: '#f8fafc' }} />
            }
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Commodity ID {form.draft_status !== 'Draft' && '*'}</label>
            <input
              className="form-control kh-input"
              placeholder={form.draft_status === 'Draft' ? 'Optional for Draft' : 'e.g. KH00001'}
              value={form.commodity_id}
              onChange={e => setForm(f => ({ ...f, commodity_id: e.target.value }))}
            />
          </div>

          <div className="col-md-6">
            <label className="kh-form-label">Record Status</label>
            <select className="form-select kh-input" value={form.draft_status} onChange={e => setForm(f => ({ ...f, draft_status: e.target.value }))}>
              {DRAFT_STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">QC Status</label>
            <select className="form-select kh-input" value={form.qc_status} onChange={e => setForm(f => ({ ...f, qc_status: e.target.value }))}>
              {['Pending', 'Passed', 'Failed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          <div className="col-md-6">
            <label className="kh-form-label">Moisture Content (%)</label>
            <input type="number" className="form-control kh-input" placeholder="0.0" min="0" max="100" step="0.1" value={form.moisture_content} onChange={e => setForm(f => ({ ...f, moisture_content: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Quality Grade</label>
            <select className="form-select kh-input" value={form.quality_grade} onChange={e => setForm(f => ({ ...f, quality_grade: e.target.value }))}>
              {['A', 'B', 'C', 'Reject'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          <div className="col-md-6">
            <label className="kh-form-label">Product Grade</label>
            <select className="form-select kh-input" value={form.product_grade} onChange={e => setForm(f => ({ ...f, product_grade: e.target.value }))}>
              <option value="">— Select grade —</option>
              {PRODUCT_GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Inspection Date</label>
            <input type="date" className="form-control kh-input" value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))} />
          </div>

          {/* Passed / Failed Quantity */}
          <div className="col-12">
            <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#4a5568', borderBottom: '1px solid #edf2f7', paddingBottom: 6 }}>
              Quantity Breakdown
            </div>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Passed Qty</label>
            <div className="input-group">
              <span className="input-group-text" style={{ background: '#f0fff4', borderColor: '#c6f6d5', color: '#276749' }}><i className="bi bi-check-circle" /></span>
              <input type="number" className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="0.00" min="0" step="0.01" value={form.passed_qty} onChange={e => setForm(f => ({ ...f, passed_qty: e.target.value }))} />
            </div>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Failed Qty</label>
            <div className="input-group">
              <span className="input-group-text" style={{ background: '#fff5f5', borderColor: '#fed7d7', color: '#9b2335' }}><i className="bi bi-x-circle" /></span>
              <input type="number" className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="0.00" min="0" step="0.01" value={form.failed_qty} onChange={e => setForm(f => ({ ...f, failed_qty: e.target.value }))} />
            </div>
          </div>
          {form.failed_qty > 0 && (
            <div className="col-12">
              <div className="alert alert-warning d-flex align-items-center gap-2" style={{ fontSize: '0.82rem', padding: '8px 12px' }}>
                <i className="bi bi-exclamation-triangle-fill" />
                <span>Failed quantity of <strong>{form.failed_qty}</strong> will be deducted from inventory and recorded in QC Failed stock.</span>
              </div>
            </div>
          )}

          <div className="col-12">
            <label className="kh-form-label">Remarks</label>
            <textarea className="form-control kh-input" rows={2} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
