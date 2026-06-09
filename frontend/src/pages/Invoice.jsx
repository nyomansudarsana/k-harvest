import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatDate, formatNumber, statusBadgeClass, debounce } from '../utils/helpers'

const INIT_FROM_QT = { quotation_id: '', customer_name: '', customer_email: '', customer_address: '', quantity: '', invoice_date: new Date().toISOString().split('T')[0], notes: '' }

// ─── Invoice Preview Document ──────────────────────────────────────────────────
function InvoicePreviewDoc({ item, settings }) {
  if (!item) return null
  const currency = item.currency_code || 'IDR'
  const rate = parseFloat(item.exchange_rate) || 1
  const taxPct = parseFloat(item.tax_percentage) ?? 0
  const qty = parseFloat(item.quantity) || 0
  const unitPrice = parseFloat(item.unit_price) || 0
  const totalIDR = parseFloat(item.total_amount) || unitPrice * qty
  const taxAmt = parseFloat(item.tax_amount) || (taxPct > 0 ? totalIDR * taxPct / 100 : 0)
  const grandTotalIDR = parseFloat(item.grand_total) || (taxPct > 0 ? totalIDR + taxAmt : totalIDR)
  const toDisplay = v => currency !== 'IDR' ? v / rate : v
  const fmt = (v, d = 2) => formatNumber(v, d)
  const company = settings?.company_name || 'Kopernik Harvest'
  const address = settings?.company_address || ''
  const invDate = item.invoice_date ? new Date(item.invoice_date) : new Date()
  const fmtDate = d => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: '#222', lineHeight: 1.5, maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <img src="/logo.svg" alt="Kopernik Harvest" style={{ height: 60, marginBottom: 6 }} />
          {address && <div style={{ fontSize: 11, color: '#555' }}>{address}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1A5C28', letterSpacing: 1 }}>INVOICE</div>
          <div style={{ fontSize: 11, color: '#555' }}>No: <strong>{item.invoice_id}</strong></div>
          <div style={{ fontSize: 11, color: '#555' }}>Date: {fmtDate(invDate)}</div>
          <div style={{ fontSize: 11, color: '#555' }}>Quotation Ref: {item.quotation_id}</div>
          <div style={{ marginTop: 6 }}>
            <span style={{ background: item.invoice_status === 'Paid' ? '#1A5C28' : item.invoice_status === 'Issued' ? '#1a5276' : item.invoice_status === 'Cancelled' ? '#c0392b' : '#888', color: '#fff', borderRadius: 4, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {item.invoice_status}
            </span>
          </div>
        </div>
      </div>
      <div style={{ height: 2, background: '#1A5C28', marginBottom: 12 }} />

      {/* Meta + Customer */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: 11 }}>
          <div><strong>Currency:</strong> {currency}</div>
          {currency !== 'IDR' ? (
            <div><strong>Exchange Rate:</strong> 1 {currency} = IDR {fmt(rate, 0)}</div>
          ) : <div style={{ color: '#888' }}>Base Currency</div>}
        </div>
        <div style={{ flex: 1, background: '#f0faf0', borderRadius: 8, padding: '10px 14px', fontSize: 11, borderLeft: '3px solid #1A5C28' }}>
          <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontWeight: 600 }}>{item.customer_name || '—'}</div>
          {item.customer_email && <div style={{ color: '#555' }}>{item.customer_email}</div>}
          {item.customer_address && <div style={{ color: '#555' }}>{item.customer_address}</div>}
        </div>
      </div>

      {/* Line items table */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 6, fontSize: 12 }}>Invoice Items</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: '#1A5C28', color: '#fff' }}>
              {['#', 'Product', 'Batch ID', 'Qty', `Unit Price (${currency})`, `Amount (${currency})`].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === '#' ? 'center' : 'left', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: '#E8F5E9' }}>
              <td style={{ padding: '6px 8px', textAlign: 'center' }}>1</td>
              <td style={{ padding: '6px 8px' }}>{item.product_name}</td>
              <td style={{ padding: '6px 8px' }}>{item.batch_id}</td>
              <td style={{ padding: '6px 8px' }}>{fmt(qty, 0)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(unitPrice))}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(totalIDR))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <table style={{ width: 240, borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            <tr><td style={{ padding: '5px 8px' }}>Subtotal</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(totalIDR))}</td></tr>
            {taxPct > 0 ? (
              <>
                <tr style={{ background: '#f9f9f9' }}><td style={{ padding: '5px 8px' }}>Tax ({fmt(taxPct, 0)}%)</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(taxAmt))}</td></tr>
                <tr style={{ background: '#1A5C28', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                  <td style={{ padding: '7px 8px' }}>Grand Total</td>
                  <td style={{ padding: '7px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(grandTotalIDR))}</td>
                </tr>
              </>
            ) : (
              <tr style={{ background: '#1A5C28', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                <td style={{ padding: '7px 8px' }}>Total</td>
                <td style={{ padding: '7px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(totalIDR))}</td>
              </tr>
            )}
            {currency !== 'IDR' && (
              <tr style={{ background: '#E8F5E9' }}>
                <td style={{ padding: '4px 8px', fontSize: 10, color: '#555' }}>≈ IDR equivalent</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, color: '#555' }}>IDR {fmt(grandTotalIDR)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {item.notes && (
        <div style={{ marginBottom: 12, fontSize: 11 }}>
          <strong>Notes:</strong> {item.notes}
        </div>
      )}

      {/* Payment instructions */}
      <div style={{ background: '#f0faf0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 11, border: '1px solid #c8e6c9' }}>
        <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 4 }}>Payment Information</div>
        <div>Please arrange payment upon receipt of this invoice.</div>
        <div style={{ color: '#888', marginTop: 2 }}>Contact: <span style={{ color: '#1A5C28' }}>{company}</span></div>
      </div>

      {/* Footer */}
      <div style={{ height: 1, background: '#ccc', margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10, color: '#888' }}>
          <div>Terms & Conditions:</div>
          <div>1. Payment due upon receipt.</div>
          <div>2. Late payments subject to applicable charges.</div>
        </div>
        <div style={{ textAlign: 'center', minWidth: 130 }}>
          <div style={{ borderTop: '1px solid #888', paddingTop: 4, fontSize: 10, color: '#555' }}>
            Authorized Signature<br />{company}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Invoice Page ─────────────────────────────────────────────────────────
export default function Invoice() {
  const [searchParams] = useSearchParams()
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState({ show: false, item: null })
  const [fromQtModal, setFromQtModal] = useState(false)
  const [form, setForm] = useState(INIT_FROM_QT)
  const [quotation, setQuotation] = useState(null)
  const [saving, setSaving] = useState(false)
  const [viewModal, setViewModal] = useState(null)
  const [statusModal, setStatusModal] = useState(null)
  const [newStatus, setNewStatus] = useState('')
  const [quotations, setQuotations] = useState([])
  const [appSettings, setAppSettings] = useState({})

  const fetchData = useCallback(async (page = 1, q = search, sf = statusFilter) => {
    setLoading(true)
    try {
      const res = await api.get('/invoices', { params: { page, size: 20, search: q || undefined, invoice_status: sf || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => {
    fetchData(1)
    const fromQt = searchParams.get('from')
    if (fromQt) { setForm(f => ({ ...f, quotation_id: fromQt })); loadQuotation(fromQt); setFromQtModal(true) }
    api.get('/settings').then(r => {
      if (r.data?.settings) {
        const s = {}
        r.data.settings.forEach(x => { s[x.key] = x.value })
        setAppSettings(s)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (fromQtModal) {
      api.get('/quotations/all')
        .then(r => {
          if (!Array.isArray(r.data)) return
          setQuotations(r.data.map(q => ({ value: q.quotation_id, label: `${q.quotation_id} — ${q.product_name}`, data: q })))
        })
        .catch(() => toast.error('Failed to load quotations'))
    }
  }, [fromQtModal])

  const loadQuotation = async (qtId) => {
    try {
      const res = await api.get(`/quotations/${qtId}`)
      setQuotation(res.data)
      setForm(f => ({ ...f, quotation_id: qtId, quantity: String(res.data.available_qty), customer_name: res.data.customer_name || '', customer_email: res.data.customer_email || '' }))
    } catch { toast.error('Quotation not found') }
  }

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const handleQuotationChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, quotation_id: '' })); setQuotation(null); return }
    setForm(f => ({ ...f, quotation_id: opt.data.quotation_id }))
    loadQuotation(opt.data.quotation_id)
  }

  const handleCreateFromQuotation = async () => {
    if (!form.quotation_id || !form.customer_name || !form.quantity) { toast.warning('Fill required fields'); return }
    setSaving(true)
    try {
      await api.post('/invoices/from-quotation', { ...form, quantity: Number(form.quantity) })
      toast.success('Invoice created from quotation'); setFromQtModal(false); setQuotation(null); setForm(INIT_FROM_QT); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const handleUpdateStatus = async () => {
    try {
      await api.put(`/invoices/${statusModal.invoice_id}`, { invoice_status: newStatus })
      toast.success(`Invoice ${newStatus === 'Issued' ? 'issued — stock deducted' : 'status updated'}`); setStatusModal(null); fetchData(data.page)
    } catch { /* error toast handled globally */ }
  }

  const handleDownloadPDF = async (inv) => {
    try {
      const res = await api.get(`/invoices/${inv.invoice_id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `${inv.invoice_id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* error toast handled globally */ }
  }

  const statusFlow = (s) => ({ Draft: ['Issued', 'Cancelled'], Issued: ['Paid', 'Cancelled'], Paid: [], Cancelled: [] }[s] || [])

  const columns = [
    { key: 'invoice_id', label: 'Invoice ID', width: 120 },
    { key: 'invoice_date', label: 'Date', width: 110, render: (v) => formatDate(v) },
    { key: 'customer_name', label: 'Customer' },
    { key: 'product_name', label: 'Product' },
    { key: 'quantity', label: 'Qty', width: 80, render: (v) => formatNumber(v, 0) },
    {
      key: 'unit_price', label: 'Unit Price', width: 120,
      render: (v, row) => {
        const cur = row.currency_code || 'IDR'
        const rate = parseFloat(row.exchange_rate) || 1
        const disp = cur !== 'IDR' ? v / rate : v
        return `${cur} ${formatNumber(disp)}`
      }
    },
    {
      key: 'grand_total', label: 'Grand Total', width: 130,
      render: (v, row) => {
        const cur = row.currency_code || 'IDR'
        const rate = parseFloat(row.exchange_rate) || 1
        const total = v || row.total_amount
        const disp = cur !== 'IDR' ? total / rate : total
        return <span className="fw-semibold text-success">{cur} {formatNumber(disp)}</span>
      }
    },
    { key: 'invoice_status', label: 'Status', width: 100, render: (v) => <span className={`status-badge ${statusBadgeClass(v)}`}>{v}</span> },
    {
      key: 'actions', label: '', width: 160,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-info" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setViewModal(row)} title="Preview"><i className="bi bi-eye" /></button>
          <button className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => handleDownloadPDF(row)} title="PDF"><i className="bi bi-file-pdf" /></button>
          {statusFlow(row.invoice_status).length > 0 && (
            <button className="btn btn-sm btn-outline-success" style={{ borderRadius: 6, padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => { setStatusModal(row); setNewStatus(statusFlow(row.invoice_status)[0]) }} title="Update Status"><i className="bi bi-arrow-repeat" /></button>
          )}
        </div>
      )
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Invoice</h5><small className="text-muted">Manage customer invoices</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={() => { setForm(INIT_FROM_QT); setQuotation(null); setFromQtModal(true) }} style={{ borderRadius: 8 }}><i className="bi bi-plus-lg me-1" />New Invoice</button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-5">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by invoice ID, customer, product..." value={search} onChange={handleSearch} />
              </div>
            </div>
            <div className="col-md-3">
              <select className="form-select kh-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); fetchData(1, search, e.target.value) }}>
                <option value="">All Status</option>
                {['Draft', 'Issued', 'Paid', 'Cancelled'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      {/* Create from Quotation */}
      <Modal show={fromQtModal} onClose={() => setFromQtModal(false)} title="Create Invoice from Quotation" size="md"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setFromQtModal(false)}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleCreateFromQuotation} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Create Invoice</button></>}>
        <div className="row g-3">
          <div className="col-12">
            <label className="kh-form-label">Quotation *</label>
            <SearchableSelect options={quotations} value={form.quotation_id} onChange={handleQuotationChange} placeholder="Select quotation..." />
          </div>
          {quotation && (
            <div className="col-12">
              <div className="p-3 rounded" style={{ background: '#f0faf0', border: '1px solid #c8e6c9' }}>
                <div className="row g-2">
                  {[['Product', quotation.product_name], ['Batch', quotation.batch_id], ['Avail Qty', formatNumber(quotation.available_qty, 0)], ['Quote Price', `IDR ${formatNumber(quotation.quote_price)}`], ['Currency', quotation.currency_code || 'IDR'], ['Grand Total', `IDR ${formatNumber(quotation.grand_total || quotation.quote_price * quotation.available_qty * 1.1)}`]].map(([l, v]) => (
                    <div key={l} className="col-6"><span style={{ fontSize: '0.72rem', color: '#6c757d' }}>{l}</span><div className="fw-semibold" style={{ fontSize: '0.875rem' }}>{v}</div></div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="col-md-6">
            <label className="kh-form-label">Invoice Date *</label>
            <input type="date" className="form-control kh-input" value={form.invoice_date} onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Quantity *</label>
            <input type="number" className="form-control kh-input" placeholder="0" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Name *</label>
            <input className="form-control kh-input" placeholder="Customer name" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Email</label>
            <input type="email" className="form-control kh-input" placeholder="email@example.com" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Customer Address</label>
            <textarea className="form-control kh-input" rows={2} value={form.customer_address} onChange={e => setForm(f => ({ ...f, customer_address: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Notes</label>
            <textarea className="form-control kh-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          {quotation && form.quantity && (
            <div className="col-12">
              <div className="calc-box">
                <div className="calc-total"><span>Estimated Total (IDR)</span><span>IDR {formatNumber(Number(form.quantity) * quotation.quote_price)}</span></div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Invoice Preview Modal */}
      <Modal
        show={!!viewModal}
        onClose={() => setViewModal(null)}
        title={`Invoice Preview — ${viewModal?.invoice_id}`}
        size="xl"
        footer={
          <div className="d-flex gap-2">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setViewModal(null)}>Close</button>
            {statusFlow(viewModal?.invoice_status || '').length > 0 && (
              <button className="btn btn-outline-success" style={{ borderRadius: 8 }} onClick={() => { setStatusModal(viewModal); setNewStatus(statusFlow(viewModal.invoice_status)[0]); setViewModal(null) }}>
                <i className="bi bi-arrow-repeat me-1" />Update Status
              </button>
            )}
            <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={() => handleDownloadPDF(viewModal)}>
              <i className="bi bi-download me-1" />Download PDF
            </button>
          </div>
        }
      >
        <div style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
          <InvoicePreviewDoc item={viewModal} settings={appSettings} />
        </div>
      </Modal>

      {/* Update Status Modal */}
      <Modal show={!!statusModal} onClose={() => setStatusModal(null)} title="Update Invoice Status"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setStatusModal(null)}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleUpdateStatus}>Confirm</button></>}>
        {statusModal && (
          <div>
            <p>Change status of <strong>{statusModal.invoice_id}</strong> from <strong>{statusModal.invoice_status}</strong> to:</p>
            <select className="form-select kh-input" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
              {statusFlow(statusModal.invoice_status).map(s => <option key={s}>{s}</option>)}
            </select>
            {newStatus === 'Issued' && <div className="alert alert-info mt-3"><i className="bi bi-info-circle me-2" />Issuing this invoice will automatically deduct <strong>{formatNumber(statusModal.quantity, 0)}</strong> units from batch <strong>{statusModal.batch_id}</strong>.</div>}
          </div>
        )}
      </Modal>
    </div>
  )
}
