import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, statusBadgeClass, debounce } from '../utils/helpers'

const INIT = { batch_id: '', commodity_id: '', moisture_content: '', quality_grade: 'A', inspection_date: new Date().toISOString().split('T')[0], qc_status: 'Pending', remarks: '' }

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
    setForm({ batch_id: item.batch_id, commodity_id: item.commodity_id, moisture_content: item.moisture_content || '', quality_grade: item.quality_grade || 'A', inspection_date: item.inspection_date || '', qc_status: item.qc_status, remarks: item.remarks || '' })
    setModal({ show: true, mode: 'edit', item })
  }

  const handleSave = async () => {
    if (!form.batch_id || !form.commodity_id) { toast.warning('Batch ID and Commodity ID are required'); return }
    setSaving(true)
    try {
      const payload = { ...form, moisture_content: form.moisture_content ? Number(form.moisture_content) : null, inspection_date: form.inspection_date || null }
      if (modal.mode === 'create') { await api.post('/qc', payload); toast.success('QC record created') }
      else { await api.put(`/qc/${modal.item.qc_id}`, payload); toast.success('QC record updated') }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const qcBadge = (s) => ({ Pending: 'badge-pending', Passed: 'badge-passed', Failed: 'badge-failed' }[s] || 'badge-draft')

  const columns = [
    { key: 'qc_id', label: 'QC ID', width: 100 },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'commodity_id', label: 'Commodity ID', width: 120 },
    { key: 'moisture_content', label: 'Moisture %', width: 110, render: (v) => v ? `${v}%` : '-' },
    { key: 'quality_grade', label: 'Grade', width: 80 },
    { key: 'inspection_date', label: 'Insp. Date', width: 120, render: (v) => formatDate(v) },
    { key: 'qc_status', label: 'Status', width: 100, render: (v) => <span className={`status-badge ${qcBadge(v)}`}>{v}</span> },
    { key: 'remarks', label: 'Remarks' },
    {
      key: 'actions', label: '', width: 80,
      render: (_, row) => <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
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

      <div className="alert alert-info d-flex align-items-center gap-2 mb-4" style={{ borderRadius: 10, fontSize: '0.875rem' }}>
        <i className="bi bi-info-circle-fill" />
        <span>QC business logic will be fully integrated in a future release. This module supports data entry only.</span>
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

      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'New QC Record' : 'Edit QC Record'}
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save</button></>}>
        <div className="row g-3">
          <div className="col-md-6">
            <label className="kh-form-label">Batch ID *</label>
            <input className="form-control kh-input" placeholder="Batch ID from receiving" value={form.batch_id} onChange={e => setForm(f => ({ ...f, batch_id: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Commodity ID *</label>
            <input className="form-control kh-input" placeholder="e.g. KH00001" value={form.commodity_id} onChange={e => setForm(f => ({ ...f, commodity_id: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Moisture Content (%)</label>
            <input type="number" className="form-control kh-input" placeholder="0.00" min="0" max="100" step="0.1" value={form.moisture_content} onChange={e => setForm(f => ({ ...f, moisture_content: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Quality Grade</label>
            <select className="form-select kh-input" value={form.quality_grade} onChange={e => setForm(f => ({ ...f, quality_grade: e.target.value }))}>
              {['A', 'B', 'C', 'Reject'].map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Inspection Date</label>
            <input type="date" className="form-control kh-input" value={form.inspection_date} onChange={e => setForm(f => ({ ...f, inspection_date: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">QC Status</label>
            <select className="form-select kh-input" value={form.qc_status} onChange={e => setForm(f => ({ ...f, qc_status: e.target.value }))}>
              {['Pending', 'Passed', 'Failed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-12">
            <label className="kh-form-label">Remarks</label>
            <textarea className="form-control kh-input" rows={2} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
