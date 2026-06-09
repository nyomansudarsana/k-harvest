import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatNumber, statusBadgeClass, debounce, formatDate } from '../utils/helpers'

const CURRENCIES = ['IDR', 'USD', 'EUR', 'AUD', 'SGD', 'JPY', 'GBP', 'MYR', 'THB']

const INIT = {
  commodity_id: '', product_name: '', batch_id: '', available_qty: 0,
  purchase_price: 0, delivery_cost: 0,
  manpower_percent: 0, management_percent: 0, margin_percent: 0,
  customer_name: '', customer_email: '', notes: '',
  currency_code: 'IDR', exchange_rate: 1.0, exchange_rate_timestamp: null,
  tax_percentage: 10.0,
}

// ─── Quotation Preview Document ───────────────────────────────────────────────
function QuotationPreviewDoc({ item, settings }) {
  if (!item) return null
  const currency = item.currency_code || 'IDR'
  const rate = parseFloat(item.exchange_rate) || 1
  const taxPct = parseFloat(item.tax_percentage) ?? 10
  const qty = parseFloat(item.available_qty) || 0
  const qp = parseFloat(item.quote_price) || 0
  const subtotalIDR = qp * qty
  const taxAmt = subtotalIDR * (taxPct / 100)
  const grandTotalIDR = subtotalIDR + taxAmt
  const toDisplay = v => currency !== 'IDR' ? v / rate : v
  const fmt = (v, d = 2) => formatNumber(v, d)
  const company = settings?.company_name || 'Kopernik Harvest'
  const address = settings?.company_address || ''
  const createdAt = item.created_at ? new Date(item.created_at) : new Date()
  const validUntil = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const fmtDate = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div id="quotation-preview-doc" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: '#222', lineHeight: 1.5, maxWidth: 700, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <img src="/logo.svg" alt="Kopernik Harvest" style={{ height: 60, marginBottom: 6 }} />
          {address && <div style={{ fontSize: 11, color: '#555' }}>{address}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#1A5C28', letterSpacing: 1 }}>QUOTATION</div>
          <div style={{ fontSize: 11, color: '#555' }}>No: <strong>{item.quotation_id}</strong></div>
          <div style={{ fontSize: 11, color: '#555' }}>Date: {fmtDate(createdAt)}</div>
          <div style={{ fontSize: 11, color: '#555' }}>Valid Until: {fmtDate(validUntil)}</div>
        </div>
      </div>
      <div style={{ height: 2, background: '#1A5C28', marginBottom: 12 }} />

      {/* Meta + Customer */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: 11 }}>
          <div><strong>Currency:</strong> {currency}</div>
          {currency !== 'IDR' ? (
            <div>
              <strong>Exchange Rate:</strong> 1 {currency} = IDR {fmt(rate, 0)}
              {item.exchange_rate_timestamp && (
                <span style={{ color: '#888', marginLeft: 6 }}>
                  · Updated: {new Date(item.exchange_rate_timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          ) : <div style={{ color: '#888' }}>Base Currency</div>}
        </div>
        <div style={{ flex: 1, background: '#f0faf0', borderRadius: 8, padding: '10px 14px', fontSize: 11, borderLeft: '3px solid #1A5C28' }}>
          <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontWeight: 600 }}>{item.customer_name || '—'}</div>
          {item.customer_email && <div style={{ color: '#555' }}>{item.customer_email}</div>}
        </div>
      </div>

      {/* Product table */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 6, fontSize: 12 }}>Product Details</div>
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
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(qp))}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(subtotalIDR))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Calculation breakdown */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 6, fontSize: 12 }}>Calculation Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: '#1A5C28', color: '#fff' }}>
                <th style={{ padding: '5px 8px', textAlign: 'left' }}>Item</th>
                <th style={{ padding: '5px 8px', textAlign: 'right' }}>IDR</th>
                <th style={{ padding: '5px 8px', textAlign: 'right' }}>{currency}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Purchase Price', item.purchase_price],
                [`Delivery Cost Per Unit`, item.delivery_cost],
                [`Manpower (${fmt(item.manpower_percent, 1)}%)`, item.purchase_price * item.manpower_percent / 100],
                [`Management Fee (${fmt(item.management_percent, 1)}%)`, item.purchase_price * item.management_percent / 100],
                [`Margin (${fmt(item.margin_percent, 1)}%)`, item.purchase_price * item.margin_percent / 100],
              ].map(([label, val], i) => (
                <tr key={label} style={{ background: i % 2 ? '#f9f9f9' : '#fff' }}>
                  <td style={{ padding: '4px 8px' }}>{label}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(val)}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmt(toDisplay(val))}</td>
                </tr>
              ))}
              <tr style={{ background: '#E8F5E9', fontWeight: 700 }}>
                <td style={{ padding: '5px 8px' }}>Quote Price (per unit)</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>IDR {fmt(qp)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(qp))}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div style={{ width: 220 }}>
          <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 6, fontSize: 12 }}>Summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <tbody>
              <tr><td style={{ padding: '5px 8px' }}>Subtotal</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(subtotalIDR))}</td></tr>
              <tr style={{ background: '#f9f9f9' }}><td style={{ padding: '5px 8px' }}>Tax ({fmt(taxPct, 0)}%)</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(taxAmt))}</td></tr>
              <tr style={{ background: '#1A5C28', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                <td style={{ padding: '7px 8px' }}>Grand Total</td>
                <td style={{ padding: '7px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(grandTotalIDR))}</td>
              </tr>
              {currency !== 'IDR' && (
                <tr style={{ background: '#E8F5E9' }}>
                  <td style={{ padding: '4px 8px', fontSize: 10, color: '#555' }}>≈ IDR equivalent</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right', fontSize: 10, color: '#555' }}>IDR {fmt(grandTotalIDR)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {item.notes && (
        <div style={{ marginBottom: 12, fontSize: 11 }}>
          <strong>Notes:</strong> {item.notes}
        </div>
      )}

      {/* Footer */}
      <div style={{ height: 1, background: '#ccc', margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div style={{ fontSize: 10, color: '#888' }}>
          <div>Terms & Conditions:</div>
          <div>1. Valid for 30 days from issue date.</div>
          <div>2. Prices subject to change without notice.</div>
          <div>3. Payment terms as per agreement.</div>
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

// ─── Main Quotation Page ───────────────────────────────────────────────────────
export default function Quotation() {
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [calc, setCalc] = useState(null)
  const [saving, setSaving] = useState(false)
  const [batches, setBatches] = useState([])
  const [deleteModal, setDeleteModal] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  // Currency & exchange rates
  const [exchangeRates, setExchangeRates] = useState({})
  const [loadingRates, setLoadingRates] = useState(false)
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null)
  // Preview
  const [previewModal, setPreviewModal] = useState(null)
  const [appSettings, setAppSettings] = useState({})

  const fetchData = useCallback(async (page = 1, q = search, sf = statusFilter) => {
    setLoading(true)
    try {
      const res = await api.get('/quotations', { params: { page, size: 20, search: q || undefined, status_filter: sf || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => {
    fetchData(1)
    api.get('/receiving/batches')
      .then(r => {
        if (!Array.isArray(r.data)) return
        setBatches(r.data.map(b => ({ value: b.batch_id, label: `${b.batch_id} — ${b.product_name}`, data: b })))
      })
      .catch(() => {})
    // Load settings for preview
    api.get('/settings').then(r => {
      if (r.data?.settings) {
        const s = {}
        r.data.settings.forEach(x => { s[x.key] = x.value })
        setAppSettings(s)
      }
    }).catch(() => {})
  }, [])

  // Fetch exchange rates when modal opens
  useEffect(() => {
    if (modal.show && modal.mode === 'create') {
      api.get('/receiving/batches')
        .then(r => {
          if (!Array.isArray(r.data)) return
          setBatches(r.data.map(b => ({ value: b.batch_id, label: `${b.batch_id} — ${b.product_name}`, data: b })))
        })
        .catch(() => {})
      // Load exchange rates
      setLoadingRates(true)
      api.get('/exchange-rates')
        .then(r => {
          setExchangeRates(r.data?.rates || {})
          setRatesUpdatedAt(r.data?.fetched_at || null)
        })
        .catch(() => toast.error('Could not load exchange rates'))
        .finally(() => setLoadingRates(false))
    }
  }, [modal.show, modal.mode])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const handleBatchChange = (val, opt) => {
    if (!opt) { setForm(f => ({ ...f, batch_id: '', commodity_id: '', product_name: '', available_qty: 0, purchase_price: 0, delivery_cost: 0 })); setCalc(null); return }
    const d = opt.data
    setForm(f => ({ ...f, batch_id: d.batch_id, commodity_id: d.commodity_id, product_name: d.product_name, available_qty: d.available_qty, purchase_price: d.purchase_price, delivery_cost: d.delivery_cost }))
    setCalc(null)
  }

  const handleCurrencyChange = (code) => {
    const rate = code === 'IDR' ? 1.0 : (exchangeRates[code]?.mid || 1.0)
    setForm(f => ({
      ...f,
      currency_code: code,
      exchange_rate: rate,
      exchange_rate_timestamp: code === 'IDR' ? null : (ratesUpdatedAt || null),
    }))
    setCalc(null)
  }

  const handleCalculate = async () => {
    const res = await api.post('/quotations/calculate', {
      purchase_price: Number(form.purchase_price),
      delivery_cost: Number(form.delivery_cost),
      manpower_percent: Number(form.manpower_percent),
      management_percent: Number(form.management_percent),
      margin_percent: Number(form.margin_percent),
      available_qty: Number(form.available_qty),
      tax_percentage: Number(form.tax_percentage),
    })
    setCalc(res.data)
  }

  const handleSave = async () => {
    if (!form.batch_id) { toast.warning('Please select a batch'); return }
    if (!calc) { toast.warning('Please calculate the quote price first'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        purchase_price: Number(form.purchase_price),
        delivery_cost: Number(form.delivery_cost),
        manpower_percent: Number(form.manpower_percent),
        management_percent: Number(form.management_percent),
        margin_percent: Number(form.margin_percent),
        tax_percentage: Number(form.tax_percentage),
        exchange_rate: Number(form.exchange_rate),
      }
      if (modal.mode === 'create') {
        await api.post('/quotations', payload)
        toast.success('Quotation saved')
      } else {
        await api.put(`/quotations/${modal.item.quotation_id}`, {
          manpower_percent: payload.manpower_percent,
          management_percent: payload.management_percent,
          margin_percent: payload.margin_percent,
          customer_name: payload.customer_name,
          customer_email: payload.customer_email,
          notes: payload.notes,
          currency_code: payload.currency_code,
          exchange_rate: payload.exchange_rate,
          exchange_rate_timestamp: payload.exchange_rate_timestamp,
          tax_percentage: payload.tax_percentage,
        })
        toast.success('Quotation updated')
      }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const openEdit = (item) => {
    setForm({
      ...INIT,
      commodity_id: item.commodity_id, product_name: item.product_name,
      batch_id: item.batch_id, available_qty: item.available_qty,
      purchase_price: item.purchase_price, delivery_cost: item.delivery_cost,
      manpower_percent: item.manpower_percent, management_percent: item.management_percent,
      margin_percent: item.margin_percent,
      customer_name: item.customer_name || '', customer_email: item.customer_email || '', notes: item.notes || '',
      currency_code: item.currency_code || 'IDR',
      exchange_rate: item.exchange_rate || 1.0,
      exchange_rate_timestamp: item.exchange_rate_timestamp || null,
      tax_percentage: item.tax_percentage ?? 10.0,
    })
    setCalc(null)
    setModal({ show: true, mode: 'edit', item })
  }

  const handleDelete = async () => {
    await api.delete(`/quotations/${deleteModal.quotation_id}`)
    toast.success('Quotation deleted'); setDeleteModal(null); fetchData(data.page)
  }

  const handleDownloadPDF = async (item) => {
    try {
      const res = await api.get(`/quotations/${item.quotation_id}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
      const a = document.createElement('a'); a.href = url; a.download = `${item.quotation_id}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch { /* error toast handled globally */ }
  }

  const fv = (k) => Number(form[k]) || 0

  // Currency dropdown custom option
  const renderCurrencyOption = (code) => {
    const rateInfo = exchangeRates[code]
    if (!rateInfo || code === 'IDR') {
      return <option key={code} value={code}>{code}{code === 'IDR' ? ' — Base Currency' : ''}</option>
    }
    return <option key={code} value={code}>{code} — 1 {code} = IDR {formatNumber(rateInfo.mid, 0)}</option>
  }

  const selectedRate = form.currency_code !== 'IDR' ? exchangeRates[form.currency_code] : null

  const columns = [
    { key: 'quotation_id', label: 'Quotation ID', width: 120 },
    { key: 'product_name', label: 'Product' },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'available_qty', label: 'Avail Qty', width: 90, render: (v) => formatNumber(v, 0) },
    { key: 'currency_code', label: 'Currency', width: 80, render: (v) => <span className="badge" style={{ background: '#E8F5E9', color: '#1A5C28', fontWeight: 600 }}>{v || 'IDR'}</span> },
    { key: 'quote_price', label: 'Quote Price (IDR)', width: 130, render: (v) => <span className="fw-semibold">IDR {formatNumber(v)}</span> },
    { key: 'grand_total', label: 'Grand Total (IDR)', width: 140, render: (v, row) => <span className="fw-semibold text-success">IDR {formatNumber(v || row.quote_price * row.available_qty * 1.1)}</span> },
    { key: 'customer_name', label: 'Customer' },
    { key: 'status', label: 'Status', width: 160, render: (v) => <span className={`status-badge ${statusBadgeClass(v)}`}>{v}</span> },
    {
      key: 'actions', label: '', width: 160,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-info" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setPreviewModal(row)} title="Preview"><i className="bi bi-eye" /></button>
          <button className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => handleDownloadPDF(row)} title="Download PDF"><i className="bi bi-file-pdf" /></button>
          {row.status === 'Pending' && <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>}
          {row.status === 'Pending' && <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>}
          {row.status === 'Pending' && <button className="btn btn-sm btn-outline-success" style={{ borderRadius: 6, padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => navigate(`/invoice?from=${row.quotation_id}`)} title="Convert to Invoice"><i className="bi bi-receipt" /></button>}
        </div>
      )
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Quotation</h5><small className="text-muted">Create and manage price quotations</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={() => { setForm(INIT); setCalc(null); setModal({ show: true, mode: 'create', item: null }) }} style={{ borderRadius: 8 }}>
          <i className="bi bi-plus-lg me-1" />New Quotation
        </button>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-5">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by product, quotation ID, customer..." value={search} onChange={handleSearch} />
              </div>
            </div>
            <div className="col-md-3">
              <select className="form-select kh-input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); fetchData(1, search, e.target.value) }}>
                <option value="">All Status</option>
                <option>Pending</option><option>Converted to Invoice</option>
              </select>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'New Quotation' : 'Edit Quotation'} size="lg"
        footer={
          <div className="d-flex gap-2 w-100 justify-content-end">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={handleCalculate}><i className="bi bi-calculator me-1" />Calculate</button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>{saving && <span className="spinner-border spinner-border-sm me-1" />}Save</button>
          </div>
        }>
        <div className="row g-3">
          {modal.mode === 'create' && (
            <div className="col-12">
              <label className="kh-form-label">Select Batch *</label>
              <SearchableSelect options={batches} value={form.batch_id} onChange={handleBatchChange} placeholder="Select receiving batch..." />
            </div>
          )}

          {form.batch_id && (
            <div className="col-12">
              <div className="d-flex gap-3 p-3 rounded" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                {[['Commodity', form.commodity_id], ['Product', form.product_name], ['Available Qty', formatNumber(form.available_qty, 0)], ['Purchase Price', `IDR ${formatNumber(form.purchase_price)}`], ['Delivery Cost Per Unit', `IDR ${formatNumber(form.delivery_cost)}`]].map(([l, v]) => (
                  <div key={l}><span style={{ fontSize: '0.75rem', color: '#6c757d' }}>{l}</span><div className="fw-semibold" style={{ fontSize: '0.875rem' }}>{v}</div></div>
                ))}
              </div>
            </div>
          )}

          {/* Currency Section */}
          <div className="col-12">
            <div style={{ background: '#f0faf0', border: '1px solid #c8e6c9', borderRadius: 8, padding: '12px 16px' }}>
              <div className="row g-2 align-items-end">
                <div className="col-md-4">
                  <label className="kh-form-label" style={{ color: '#1A5C28', fontWeight: 600 }}>Currency</label>
                  <select className="form-select kh-input" value={form.currency_code} onChange={e => handleCurrencyChange(e.target.value)}>
                    {CURRENCIES.map(renderCurrencyOption)}
                  </select>
                </div>
                <div className="col-md-4">
                  <label className="kh-form-label">Tax Rate (%)</label>
                  <div className="input-group">
                    <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} min="0" max="100" step="0.1" value={form.tax_percentage} onChange={e => setForm(f => ({ ...f, tax_percentage: e.target.value }))} />
                    <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0', borderColor: '#d1d9e0' }}>%</span>
                  </div>
                </div>
                {loadingRates && (
                  <div className="col-md-4">
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}><span className="spinner-border spinner-border-sm me-1" />Loading rates...</span>
                  </div>
                )}
              </div>

              {/* Exchange rate info panel */}
              {!loadingRates && Object.keys(exchangeRates).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  {selectedRate ? (
                    <div style={{ background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #a5d6a7', fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 4 }}>
                        <i className="bi bi-currency-exchange me-2" />
                        {form.currency_code} Exchange Rate
                      </div>
                      <div className="row g-2">
                        <div className="col-auto"><span style={{ color: '#666' }}>Mid Rate:</span> <strong>1 {form.currency_code} = IDR {formatNumber(selectedRate.mid, 0)}</strong></div>
                        <div className="col-auto"><span style={{ color: '#666' }}>Buy:</span> IDR {formatNumber(selectedRate.buy, 0)}</div>
                        <div className="col-auto"><span style={{ color: '#666' }}>Sell:</span> IDR {formatNumber(selectedRate.sell, 0)}</div>
                        <div className="col-auto" style={{ color: '#888' }}><i className="bi bi-clock me-1" />Source: {selectedRate.source}</div>
                      </div>
                      {ratesUpdatedAt && <div style={{ color: '#888', marginTop: 4 }}>Updated: {new Date(ratesUpdatedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })} UTC</div>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#666' }}>
                      <i className="bi bi-info-circle me-1" />
                      Available rates:
                      {Object.entries(exchangeRates).filter(([k]) => k !== 'IDR').map(([code, r]) => (
                        <span key={code} style={{ marginLeft: 8 }}><strong>{code}</strong>: IDR {formatNumber(r.mid, 0)}</span>
                      ))}
                      {ratesUpdatedAt && <span style={{ color: '#aaa', marginLeft: 8 }}>· {new Date(ratesUpdatedAt).toLocaleString()}</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Calculation parameters */}
          <div className="col-12"><div className="fw-semibold" style={{ fontSize: '0.85rem', color: '#4a5568', borderBottom: '1px solid #edf2f7', paddingBottom: 6 }}>Calculation Parameters</div></div>
          {[{ label: 'Man Power %', key: 'manpower_percent' }, { label: 'Management Fee %', key: 'management_percent' }, { label: 'Margin %', key: 'margin_percent' }].map(f => (
            <div key={f.key} className="col-md-4">
              <label className="kh-form-label">{f.label}</label>
              <div className="input-group">
                <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} placeholder="0" min="0" max="100" step="0.1" value={form[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
                <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0', borderColor: '#d1d9e0' }}>%</span>
              </div>
            </div>
          ))}

          {/* Calculation Result */}
          {calc && (() => {
            const currency = form.currency_code || 'IDR'
            const rate = parseFloat(form.exchange_rate) || 1
            const toDisp = v => currency !== 'IDR' ? v / rate : v
            const fmt = (v, d = 2) => formatNumber(v, d)
            return (
              <div className="col-12">
                <div className="calc-box">
                  <div className="fw-semibold mb-2" style={{ fontSize: '0.85rem', color: '#1a5276' }}>
                    <i className="bi bi-calculator me-2" />Price Calculation Breakdown
                    {currency !== 'IDR' && <span className="ms-2 badge" style={{ background: '#E8F5E9', color: '#1A5C28', fontSize: '0.75rem' }}>1 {currency} = IDR {fmt(rate, 0)}</span>}
                  </div>
                  {[
                    { label: 'Purchase Price', val: calc.purchase_price },
                    { label: 'Delivery Cost Per Unit', val: calc.delivery_cost },
                    { label: `Man Power (${fv('manpower_percent')}%)`, val: calc.manpower_amount },
                    { label: `Management Fee (${fv('management_percent')}%)`, val: calc.management_amount },
                    { label: `Margin (${fv('margin_percent')}%)`, val: calc.margin_amount },
                  ].map((r, i) => (
                    <div key={i} className="calc-row">
                      <span>{r.label}</span>
                      <span>
                        IDR {fmt(r.val)}
                        {currency !== 'IDR' && <span style={{ color: '#888', marginLeft: 8, fontSize: '0.8rem' }}>({currency} {fmt(toDisp(r.val))})</span>}
                      </span>
                    </div>
                  ))}
                  <div className="calc-total">
                    <span>Quote Price (per unit)</span>
                    <span>
                      IDR {fmt(calc.quote_price)}
                      {currency !== 'IDR' && <span style={{ marginLeft: 8, fontSize: '0.9rem' }}>({currency} {fmt(toDisp(calc.quote_price))})</span>}
                    </span>
                  </div>
                  {/* Tax section */}
                  <div style={{ borderTop: '1px dashed #d1d9e0', marginTop: 8, paddingTop: 8 }}>
                    <div className="calc-row">
                      <span>Subtotal (× {fmt(calc.available_qty, 0)} qty)</span>
                      <span>IDR {fmt(calc.quote_price * calc.available_qty)}{currency !== 'IDR' && <span style={{ color: '#888', marginLeft: 8, fontSize: '0.8rem' }}>({currency} {fmt(toDisp(calc.quote_price * calc.available_qty))})</span>}</span>
                    </div>
                    <div className="calc-row" style={{ color: '#6c757d' }}>
                      <span>Tax ({fmt(calc.tax_percentage, 0)}%)</span>
                      <span>IDR {fmt(calc.tax_amount)}{currency !== 'IDR' && <span style={{ marginLeft: 8, fontSize: '0.8rem' }}>({currency} {fmt(toDisp(calc.tax_amount))})</span>}</span>
                    </div>
                    <div className="calc-total" style={{ background: '#1A5C28', color: '#fff', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                      <span>Grand Total</span>
                      <span>
                        IDR {fmt(calc.grand_total)}
                        {currency !== 'IDR' && <span style={{ marginLeft: 8, opacity: 0.9 }}>({currency} {fmt(toDisp(calc.grand_total))})</span>}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })()}

          <div className="col-12"><div className="fw-semibold" style={{ fontSize: '0.85rem', color: '#4a5568', borderBottom: '1px solid #edf2f7', paddingBottom: 6 }}>Customer Info</div></div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Name</label>
            <input className="form-control kh-input" placeholder="Optional" value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Email</label>
            <input type="email" className="form-control kh-input" placeholder="Optional" value={form.customer_email} onChange={e => setForm(f => ({ ...f, customer_email: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Notes</label>
            <textarea className="form-control kh-input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        show={!!previewModal}
        onClose={() => setPreviewModal(null)}
        title={`Preview — ${previewModal?.quotation_id}`}
        size="xl"
        footer={
          <div className="d-flex gap-2">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setPreviewModal(null)}>Close</button>
            <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={() => handleDownloadPDF(previewModal)}>
              <i className="bi bi-download me-1" />Download PDF
            </button>
          </div>
        }
      >
        <div style={{ background: '#fff', padding: 16, borderRadius: 8 }}>
          <QuotationPreviewDoc item={previewModal} settings={appSettings} />
        </div>
      </Modal>

      {/* Delete Modal */}
      <Modal show={!!deleteModal} onClose={() => setDeleteModal(null)} title="Confirm Delete"
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setDeleteModal(null)}>Cancel</button><button className="btn btn-danger" style={{ borderRadius: 8 }} onClick={handleDelete}>Delete</button></>}>
        <p>Delete quotation <strong>{deleteModal?.quotation_id}</strong>?</p>
      </Modal>
    </div>
  )
}
