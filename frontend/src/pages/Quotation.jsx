import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import SearchableSelect from '../components/common/SearchableSelect'
import api from '../services/api'
import { formatNumber, statusBadgeClass, debounce, formatDate } from '../utils/helpers'

const CURRENCIES = ['IDR', 'USD', 'EUR', 'AUD', 'SGD', 'JPY', 'GBP', 'MYR', 'THB']
const QUOTATION_STATUSES = ['Draft', 'Pending', 'Sent', 'Approved', 'Rejected', 'Cancelled', 'Expired']

const EMPTY_LINE = {
  batch_id: '', commodity_id: '', product_name: '', available_qty: 0,
  quoted_qty: '', purchase_price: 0, delivery_cost: 0, extra_costs_total: 0,
  manpower_percent: 0, management_percent: 0, margin_percent: 0,
}

const INIT_HEADER = {
  customer_name: '', customer_email: '', notes: '',
  currency_code: 'IDR', exchange_rate: 1.0, exchange_rate_timestamp: null,
  tax_percentage: 10.0,
}

// ── Client-side line calculation (mirrors backend calc_line) ──────────────────
function calcLine(item) {
  const pp = Number(item.purchase_price) || 0
  const dc = Number(item.delivery_cost) || 0
  const ec = Number(item.extra_costs_total) || 0
  const qty = Number(item.quoted_qty) || 0
  const cost = pp + dc + ec
  const unit = cost * (1 + (Number(item.manpower_percent) || 0) / 100 + (Number(item.management_percent) || 0) / 100 + (Number(item.margin_percent) || 0) / 100)
  return { unit_price: unit, line_subtotal: unit * qty, total_cost_basis: cost }
}

// ── Quotation Preview ─────────────────────────────────────────────────────────
function QuotationPreviewDoc({ item, settings }) {
  if (!item) return null
  const currency = item.currency_code || 'IDR'
  const rate = parseFloat(item.exchange_rate) || 1
  const taxPct = parseFloat(item.tax_percentage) ?? 10
  const toDisplay = v => currency !== 'IDR' ? v / rate : v
  const fmt = (v, d = 2) => formatNumber(v, d)
  const company = settings?.company_name || 'Kopernik Harvest'
  const address = settings?.company_address || ''
  const createdAt = item.created_at ? new Date(item.created_at) : new Date()
  const validUntil = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
  const fmtDate = d => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const items = item.items?.length ? item.items : [item]
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.line_subtotal) || (parseFloat(i.unit_price || i.quote_price || 0) * parseFloat(i.quoted_qty || i.available_qty || 0))), 0)
  const tax = subtotal * (taxPct / 100)
  const grand = subtotal + tax

  return (
    <div id="quotation-preview-doc" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 13, color: '#222', lineHeight: 1.5, maxWidth: 700, margin: '0 auto' }}>
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
      <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
        <div style={{ flex: 1, fontSize: 11 }}>
          <div><strong>Currency:</strong> {currency}</div>
          {currency !== 'IDR' ? <div><strong>Exchange Rate:</strong> 1 {currency} = IDR {fmt(rate, 0)}</div> : <div style={{ color: '#888' }}>Base Currency</div>}
        </div>
        <div style={{ flex: 1, background: '#f0faf0', borderRadius: 8, padding: '10px 14px', fontSize: 11, borderLeft: '3px solid #1A5C28' }}>
          <div style={{ fontWeight: 700, color: '#1A5C28', marginBottom: 4 }}>Bill To</div>
          <div style={{ fontWeight: 600 }}>{item.customer_name || '—'}</div>
          {item.customer_email && <div style={{ color: '#555' }}>{item.customer_email}</div>}
        </div>
      </div>
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
            {items.map((li, idx) => {
              const qty = parseFloat(li.quoted_qty || li.available_qty || 0)
              const up = parseFloat(li.unit_price || li.quote_price || 0)
              const amt = parseFloat(li.line_subtotal) || up * qty
              return (
                <tr key={idx} style={{ background: idx % 2 ? '#f9f9f9' : '#E8F5E9' }}>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ padding: '6px 8px' }}>{li.product_name}</td>
                  <td style={{ padding: '6px 8px' }}>{li.batch_id}</td>
                  <td style={{ padding: '6px 8px' }}>{fmt(qty, 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(up))}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{fmt(toDisplay(amt))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <table style={{ width: 240, borderCollapse: 'collapse', fontSize: 11 }}>
          <tbody>
            <tr><td style={{ padding: '5px 8px' }}>Subtotal</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(subtotal))}</td></tr>
            <tr style={{ background: '#f9f9f9' }}><td style={{ padding: '5px 8px' }}>Tax ({fmt(taxPct, 0)}%)</td><td style={{ padding: '5px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(tax))}</td></tr>
            <tr style={{ background: '#1A5C28', color: '#fff', fontWeight: 700, fontSize: 12 }}>
              <td style={{ padding: '7px 8px' }}>Grand Total</td>
              <td style={{ padding: '7px 8px', textAlign: 'right' }}>{currency} {fmt(toDisplay(grand))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {item.notes && <div style={{ marginBottom: 12, fontSize: 11 }}><strong>Notes:</strong> {item.notes}</div>}
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

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Quotation() {
  const navigate = useNavigate()
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [header, setHeader] = useState(INIT_HEADER)
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  const [saving, setSaving] = useState(false)
  const [batches, setBatches] = useState([])
  const [deleteModal, setDeleteModal] = useState(null)
  const [exchangeRates, setExchangeRates] = useState({})
  const [loadingRates, setLoadingRates] = useState(false)
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null)
  const [previewModal, setPreviewModal] = useState(null)
  const [appSettings, setAppSettings] = useState({})
  const [statusModal, setStatusModal] = useState(null)
  const [newStatus, setNewStatus] = useState('')

  const fetchData = useCallback(async (page = 1, q = search, sf = statusFilter) => {
    setLoading(true)
    try {
      const res = await api.get('/quotations', { params: { page, size: 20, search: q || undefined, status_filter: sf || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search, statusFilter])

  const loadBatches = () => {
    api.get('/receiving/batches')
      .then(r => {
        if (!Array.isArray(r.data)) return
        setBatches(r.data.map(b => ({ value: b.batch_id, label: `${b.batch_id} — ${b.product_name}`, data: b })))
      }).catch(() => { })
  }

  useEffect(() => {
    fetchData(1)
    loadBatches()
    api.get('/settings').then(r => {
      if (r.data?.settings) {
        const s = {}; r.data.settings.forEach(x => { s[x.key] = x.value }); setAppSettings(s)
      }
    }).catch(() => { })
  }, [])

  useEffect(() => {
    if (modal.show && modal.mode === 'create') {
      loadBatches()
      setLoadingRates(true)
      api.get('/exchange-rates')
        .then(r => { setExchangeRates(r.data?.rates || {}); setRatesUpdatedAt(r.data?.fetched_at || null) })
        .catch(() => toast.error('Could not load exchange rates'))
        .finally(() => setLoadingRates(false))
    }
  }, [modal.show, modal.mode])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  // ── Line management ──
  const addLine = () => setLines(ls => [...ls, { ...EMPTY_LINE }])
  const removeLine = (idx) => setLines(ls => ls.filter((_, i) => i !== idx))
  const updateLine = (idx, field, val) => setLines(ls => ls.map((l, i) => i === idx ? { ...l, [field]: val } : l))

  const handleBatchChange = (idx, val, opt) => {
    if (!opt) { updateLine(idx, 'batch_id', ''); return }
    const d = opt.data
    setLines(ls => ls.map((l, i) => i === idx ? {
      ...l, batch_id: d.batch_id, commodity_id: d.commodity_id,
      product_name: d.product_name, available_qty: d.available_qty,
      purchase_price: d.purchase_price || 0, delivery_cost: d.delivery_cost || 0,
      extra_costs_total: d.extra_costs_total || 0,
    } : l))
  }

  const handleCurrencyChange = (code) => {
    const rate = code === 'IDR' ? 1.0 : (exchangeRates[code]?.mid || 1.0)
    setHeader(h => ({ ...h, currency_code: code, exchange_rate: rate, exchange_rate_timestamp: code === 'IDR' ? null : (ratesUpdatedAt || null) }))
  }

  // ── Totals ──
  const computeTotals = () => {
    const subtotal = lines.reduce((s, l) => s + calcLine(l).line_subtotal, 0)
    const tax = subtotal * ((Number(header.tax_percentage) || 0) / 100)
    return { subtotal, tax, grand: subtotal + tax }
  }

  // ── Save ──
  const handleSave = async () => {
    if (lines.length === 0) { toast.warning('Add at least one line item'); return }
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].batch_id) { toast.warning(`Line ${i + 1}: Select a batch`); return }
      if (!Number(lines[i].quoted_qty) || Number(lines[i].quoted_qty) <= 0) { toast.warning(`Line ${i + 1}: Quoted qty must be > 0`); return }
    }
    if (!header.customer_name) { toast.warning('Customer name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...header,
        exchange_rate: Number(header.exchange_rate),
        tax_percentage: Number(header.tax_percentage),
        items: lines.map(l => ({
          batch_id: l.batch_id, commodity_id: l.commodity_id, product_name: l.product_name,
          available_qty: Number(l.available_qty), quoted_qty: Number(l.quoted_qty),
          purchase_price: Number(l.purchase_price), delivery_cost: Number(l.delivery_cost),
          extra_costs_total: Number(l.extra_costs_total),
          manpower_percent: Number(l.manpower_percent), management_percent: Number(l.management_percent),
          margin_percent: Number(l.margin_percent),
        })),
      }
      if (modal.mode === 'create') {
        await api.post('/quotations', payload)
        toast.success('Quotation saved')
      } else {
        await api.put(`/quotations/${modal.item.quotation_id}`, payload)
        toast.success('Quotation updated')
      }
      setModal({ show: false }); fetchData(data.page)
    } finally { setSaving(false) }
  }

  const openCreate = () => {
    setHeader(INIT_HEADER)
    setLines([{ ...EMPTY_LINE }])
    setModal({ show: true, mode: 'create', item: null })
  }

  const openEdit = (item) => {
    setHeader({
      customer_name: item.customer_name || '', customer_email: item.customer_email || '',
      notes: item.notes || '', currency_code: item.currency_code || 'IDR',
      exchange_rate: item.exchange_rate || 1.0, exchange_rate_timestamp: item.exchange_rate_timestamp || null,
      tax_percentage: item.tax_percentage ?? 10.0,
    })
    const itemLines = item.items?.length ? item.items.map(d => ({
      batch_id: d.batch_id, commodity_id: d.commodity_id, product_name: d.product_name,
      available_qty: d.available_qty, quoted_qty: d.quoted_qty,
      purchase_price: d.purchase_price, delivery_cost: d.delivery_cost,
      extra_costs_total: d.extra_costs_total || 0,
      manpower_percent: d.manpower_percent, management_percent: d.management_percent, margin_percent: d.margin_percent,
    })) : [{ ...EMPTY_LINE, batch_id: item.batch_id, commodity_id: item.commodity_id, product_name: item.product_name, available_qty: item.available_qty, quoted_qty: item.available_qty, purchase_price: item.purchase_price, delivery_cost: item.delivery_cost, manpower_percent: item.manpower_percent, management_percent: item.management_percent, margin_percent: item.margin_percent }]
    setLines(itemLines)
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
    } catch { }
  }

  const handleStatusUpdate = async () => {
    if (!newStatus) return
    try {
      await api.patch(`/quotations/${statusModal.quotation_id}/status`, { status: newStatus })
      toast.success(`Status updated to ${newStatus}`); setStatusModal(null); fetchData(data.page)
    } catch { }
  }

  const renderCurrencyOption = (code) => {
    const r = exchangeRates[code]
    if (!r || code === 'IDR') return <option key={code} value={code}>{code}{code === 'IDR' ? ' — Base Currency' : ''}</option>
    return <option key={code} value={code}>{code} — 1 {code} = IDR {formatNumber(r.mid, 0)}</option>
  }

  const totals = computeTotals()
  const selectedRate = header.currency_code !== 'IDR' ? exchangeRates[header.currency_code] : null
  const toDisplay = (v) => header.currency_code !== 'IDR' ? v / (Number(header.exchange_rate) || 1) : v

  const columns = [
    { key: 'quotation_id', label: 'Quotation ID', width: 120 },
    {
      key: 'product_name', label: 'Product(s)',
      render: (v, row) => {
        const cnt = row.items?.length || 0
        return <span>{v || '—'}{cnt > 1 && <span className="badge ms-1" style={{ background: '#E8F5E9', color: '#1A5C28', fontSize: '0.7rem' }}>+{cnt - 1} more</span>}</span>
      },
    },
    { key: 'batch_id', label: 'Batch (1st)', width: 130 },
    {
      key: 'currency_code', label: 'Currency', width: 80,
      render: (v) => <span className="badge" style={{ background: '#E8F5E9', color: '#1A5C28', fontWeight: 600 }}>{v || 'IDR'}</span>,
    },
    { key: 'grand_total', label: 'Grand Total (IDR)', width: 140, render: (v) => <span className="fw-semibold text-success">IDR {formatNumber(v)}</span> },
    { key: 'customer_name', label: 'Customer' },
    {
      key: 'status', label: 'Status', width: 170,
      render: (v, row) => (
        <div className="d-flex align-items-center gap-1">
          <span className={`status-badge ${statusBadgeClass(v)}`}>{v}</span>
          <button
            className="btn btn-sm btn-outline-secondary"
            style={{ borderRadius: 4, padding: '1px 6px', fontSize: '0.7rem' }}
            title="Change Status"
            onClick={() => { setStatusModal(row); setNewStatus(v) }}
          >
            <i className="bi bi-pencil-square" />
          </button>
        </div>
      ),
    },
    {
      key: 'actions', label: '', width: 160,
      render: (_, row) => (
        <div className="d-flex gap-1 flex-wrap">
          <button className="btn btn-sm btn-outline-info" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setPreviewModal(row)} title="Preview"><i className="bi bi-eye" /></button>
          <button className="btn btn-sm btn-outline-secondary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => handleDownloadPDF(row)} title="PDF"><i className="bi bi-file-pdf" /></button>
          {!['Approved', 'Paid', 'Completed', 'Converted to Invoice'].includes(row.status) && (
            <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
          )}
          {!['Approved', 'Paid', 'Completed', 'Converted to Invoice'].includes(row.status) && (
            <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
          )}
          {row.status === 'Pending' && (
            <button className="btn btn-sm btn-outline-success" style={{ borderRadius: 6, padding: '3px 8px', fontSize: '0.7rem' }} onClick={() => navigate(`/invoice?from=${row.quotation_id}`)} title="Convert to Invoice"><i className="bi bi-receipt" /></button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Quotation</h5><small className="text-muted">Create and manage price quotations</small></div>
        <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}>
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
                {[...QUOTATION_STATUSES, 'Converted to Invoice'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <DataTable columns={columns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchData(p)} />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal show={modal.show} onClose={() => setModal({ show: false })} title={modal.mode === 'create' ? 'New Quotation' : `Edit Quotation — ${modal.item?.quotation_id}`} size="xl"
        footer={
          <div className="d-flex gap-2 justify-content-end w-100">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleSave} disabled={saving}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              {modal.mode === 'create' ? 'Save Quotation' : 'Update Quotation'}
            </button>
          </div>
        }>

        {/* Currency & Tax */}
        <div className="row g-3 mb-3">
          <div className="col-12">
            <div style={{ background: '#f0faf0', border: '1px solid #c8e6c9', borderRadius: 8, padding: '12px 16px' }}>
              <div className="row g-2 align-items-end">
                <div className="col-md-4">
                  <label className="kh-form-label" style={{ color: '#1A5C28', fontWeight: 600 }}>Currency</label>
                  <select className="form-select kh-input" value={header.currency_code} onChange={e => handleCurrencyChange(e.target.value)}>
                    {CURRENCIES.map(renderCurrencyOption)}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="kh-form-label">Tax Rate (%)</label>
                  <div className="input-group">
                    <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} min="0" max="100" step="0.1" value={header.tax_percentage} onChange={e => setHeader(h => ({ ...h, tax_percentage: e.target.value }))} onWheel={e => e.target.blur()} />
                    <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0', borderColor: '#d1d9e0' }}>%</span>
                  </div>
                </div>
                {loadingRates && <div className="col"><span className="text-muted" style={{ fontSize: '0.8rem' }}><span className="spinner-border spinner-border-sm me-1" />Loading rates...</span></div>}
              </div>
              {selectedRate && (
                <div style={{ marginTop: 8, background: '#fff', borderRadius: 6, padding: '6px 12px', border: '1px solid #a5d6a7', fontSize: 11 }}>
                  <i className="bi bi-currency-exchange me-2" />
                  <strong>1 {header.currency_code} = IDR {formatNumber(selectedRate.mid, 0)}</strong>
                  <span className="text-muted ms-3">Buy: {formatNumber(selectedRate.buy, 0)} · Sell: {formatNumber(selectedRate.sell, 0)} · Source: {selectedRate.source}</span>
                  {ratesUpdatedAt && <span className="text-muted ms-2">· {new Date(ratesUpdatedAt).toLocaleString('id-ID')}</span>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="fw-semibold" style={{ fontSize: '0.9rem', color: '#1a5276' }}>
              <i className="bi bi-list-ul me-2" />Product Line Items
            </div>
            <button type="button" className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6 }} onClick={addLine}>
              <i className="bi bi-plus me-1" />Add Product
            </button>
          </div>

          {lines.map((line, idx) => {
            const cl = calcLine(line)
            return (
              <div key={idx} className="mb-3 p-3 rounded" style={{ border: '1px solid #e2e8f0', background: '#fcfdff' }}>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#4a5568' }}>Line {idx + 1}</span>
                  {lines.length > 1 && (
                    <button type="button" className="btn btn-sm btn-outline-danger" style={{ borderRadius: 4, padding: '2px 8px', fontSize: '0.75rem' }} onClick={() => removeLine(idx)}>
                      <i className="bi bi-x" /> Remove
                    </button>
                  )}
                </div>
                <div className="row g-2">
                  <div className="col-md-5">
                    <label className="kh-form-label">Select Batch *</label>
                    <SearchableSelect
                      options={batches}
                      value={line.batch_id}
                      onChange={(v, o) => handleBatchChange(idx, v, o)}
                      placeholder="Select receiving batch..."
                    />
                  </div>
                  {line.batch_id && (
                    <>
                      <div className="col-md-3">
                        <label className="kh-form-label">Commodity ID</label>
                        <input className="form-control kh-input" value={line.commodity_id} readOnly style={{ background: '#f8fafc' }} />
                      </div>
                      <div className="col-md-2">
                        <label className="kh-form-label">Avail. Qty</label>
                        <input className="form-control kh-input" value={formatNumber(line.available_qty, 0)} readOnly style={{ background: '#f8fafc' }} />
                      </div>
                      <div className="col-md-2">
                        <label className="kh-form-label">Quoted Qty *</label>
                        <input type="number" className="form-control kh-input" placeholder="0" min="0.01" step="0.01" value={line.quoted_qty} onChange={e => updateLine(idx, 'quoted_qty', e.target.value)} onWheel={e => e.target.blur()} />
                      </div>
                    </>
                  )}
                  {line.batch_id && (
                    <>
                      <div className="col-md-3">
                        <label className="kh-form-label">Purchase Price</label>
                        <input type="number" className="form-control kh-input" placeholder="0" min="0" step="0.01" value={line.purchase_price} onChange={e => updateLine(idx, 'purchase_price', e.target.value)} onWheel={e => e.target.blur()} />
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Delivery Cost</label>
                        <input type="number" className="form-control kh-input" placeholder="0" min="0" step="0.01" value={line.delivery_cost} onChange={e => updateLine(idx, 'delivery_cost', e.target.value)} onWheel={e => e.target.blur()} />
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Extra Costs Total</label>
                        <input type="number" className="form-control kh-input" placeholder="0" min="0" step="0.01" value={line.extra_costs_total} onChange={e => updateLine(idx, 'extra_costs_total', e.target.value)} onWheel={e => e.target.blur()} />
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Manpower %</label>
                        <div className="input-group">
                          <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} placeholder="0" min="0" max="100" step="0.1" value={line.manpower_percent} onChange={e => updateLine(idx, 'manpower_percent', e.target.value)} onWheel={e => e.target.blur()} />
                          <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0' }}>%</span>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Management %</label>
                        <div className="input-group">
                          <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} placeholder="0" min="0" max="100" step="0.1" value={line.management_percent} onChange={e => updateLine(idx, 'management_percent', e.target.value)} onWheel={e => e.target.blur()} />
                          <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0' }}>%</span>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Margin %</label>
                        <div className="input-group">
                          <input type="number" className="form-control kh-input" style={{ borderRadius: '8px 0 0 8px' }} placeholder="0" min="0" max="100" step="0.1" value={line.margin_percent} onChange={e => updateLine(idx, 'margin_percent', e.target.value)} onWheel={e => e.target.blur()} />
                          <span className="input-group-text" style={{ borderRadius: '0 8px 8px 0' }}>%</span>
                        </div>
                      </div>
                      <div className="col-md-3">
                        <label className="kh-form-label">Cost Basis / Unit</label>
                        <input className="form-control kh-input" value={`IDR ${formatNumber(cl.total_cost_basis)}`} readOnly style={{ background: '#f8fafc', color: '#1a5276', fontWeight: 600 }} />
                      </div>

                      {/* Line summary */}
                      <div className="col-12">
                        <div className="d-flex gap-4 p-2 rounded" style={{ background: '#f0f7f0', fontSize: '0.82rem' }}>
                          <div><span className="text-muted">Unit Price:</span> <strong>IDR {formatNumber(cl.unit_price)}</strong>{header.currency_code !== 'IDR' && <span className="text-muted ms-1">({header.currency_code} {formatNumber(toDisplay(cl.unit_price))})</span>}</div>
                          <div><span className="text-muted">Qty:</span> <strong>{formatNumber(Number(line.quoted_qty) || 0, 0)}</strong></div>
                          <div><span className="text-muted">Line Subtotal:</span> <strong className="text-success">IDR {formatNumber(cl.line_subtotal)}</strong></div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}

          {/* Grand Total Summary */}
          {lines.some(l => l.batch_id) && (
            <div className="p-3 rounded" style={{ background: '#1A5C28', color: '#fff' }}>
              <div className="row g-2" style={{ fontSize: '0.85rem' }}>
                <div className="col-auto"><span style={{ opacity: 0.8 }}>Subtotal:</span> <strong>IDR {formatNumber(totals.subtotal)}</strong></div>
                <div className="col-auto"><span style={{ opacity: 0.8 }}>Tax ({header.tax_percentage}%):</span> <strong>IDR {formatNumber(totals.tax)}</strong></div>
                <div className="col-auto ms-auto"><span style={{ opacity: 0.8 }}>Grand Total:</span> <strong style={{ fontSize: '1rem' }}>IDR {formatNumber(totals.grand)}</strong>
                  {header.currency_code !== 'IDR' && <span style={{ opacity: 0.75, marginLeft: 8, fontSize: '0.82rem' }}>({header.currency_code} {formatNumber(toDisplay(totals.grand))})</span>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Customer Info */}
        <div className="row g-3">
          <div className="col-12"><div className="fw-semibold" style={{ fontSize: '0.85rem', color: '#4a5568', borderBottom: '1px solid #edf2f7', paddingBottom: 6 }}>Customer Info</div></div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Name *</label>
            <input className="form-control kh-input" placeholder="Customer name" value={header.customer_name} onChange={e => setHeader(h => ({ ...h, customer_name: e.target.value }))} />
          </div>
          <div className="col-md-6">
            <label className="kh-form-label">Customer Email</label>
            <input type="email" className="form-control kh-input" placeholder="email@example.com" value={header.customer_email} onChange={e => setHeader(h => ({ ...h, customer_email: e.target.value }))} />
          </div>
          <div className="col-12">
            <label className="kh-form-label">Notes</label>
            <textarea className="form-control kh-input" rows={2} value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* Status Edit Modal */}
      <Modal show={!!statusModal} onClose={() => setStatusModal(null)} title={`Change Status — ${statusModal?.quotation_id}`}
        footer={<><button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setStatusModal(null)}>Cancel</button><button className="btn btn-kh-primary" style={{ borderRadius: 8 }} onClick={handleStatusUpdate}>Confirm</button></>}>
        <div>
          <p>Change status of <strong>{statusModal?.quotation_id}</strong> from <strong>{statusModal?.status}</strong> to:</p>
          <select className="form-select kh-input" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
            {QUOTATION_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          {newStatus === 'Approved' && (
            <div className="alert alert-success mt-3"><i className="bi bi-check-circle me-2" />Approving this quotation will lock it for invoice generation.</div>
          )}
          {['Cancelled', 'Rejected'].includes(newStatus) && (
            <div className="alert alert-warning mt-3"><i className="bi bi-exclamation-triangle me-2" />This action will make the quotation unavailable for invoicing.</div>
          )}
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal show={!!previewModal} onClose={() => setPreviewModal(null)} title={`Preview — ${previewModal?.quotation_id}`} size="xl"
        footer={
          <div className="d-flex gap-2">
            <button className="btn btn-light" style={{ borderRadius: 8 }} onClick={() => setPreviewModal(null)}>Close</button>
            <button className="btn btn-outline-secondary" style={{ borderRadius: 8 }} onClick={() => handleDownloadPDF(previewModal)}>
              <i className="bi bi-download me-1" />Download PDF
            </button>
          </div>
        }>
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
