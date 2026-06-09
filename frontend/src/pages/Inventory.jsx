import { useState, useEffect, useCallback } from 'react'
import DataTable from '../components/common/DataTable'
import api from '../services/api'
import { formatNumber, formatDateTime, debounce } from '../utils/helpers'

export default function Inventory() {
  const [tab, setTab] = useState('stock')
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [movements, setMovements] = useState({ items: [], total: 0, page: 1, size: 30, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [moveFilter, setMoveFilter] = useState('')

  const fetchStock = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/inventory', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  const fetchMovements = useCallback(async (page = 1, type = moveFilter) => {
    setLoading(true)
    try {
      const res = await api.get('/inventory/movements', { params: { page, size: 30, movement_type: type || undefined } })
      setMovements(res.data)
    } finally { setLoading(false) }
  }, [moveFilter])

  useEffect(() => { fetchStock(1); fetchMovements(1) }, [])

  const debouncedSearch = useCallback(debounce((q) => fetchStock(1, q), 400), [fetchStock])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const stockColumns = [
    { key: 'inventory_id', label: 'Inv ID', width: 100 },
    { key: 'commodity_id', label: 'Commodity ID', width: 120 },
    { key: 'product_name', label: 'Product Name' },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'available_qty', label: 'Available Qty', width: 130, render: (v) => <span className={`fw-semibold ${v < 100 ? 'text-danger' : 'text-success'}`}>{formatNumber(v, 0)}</span> },
    { key: 'reserved_qty', label: 'Reserved Qty', width: 120, render: (v) => formatNumber(v, 0) },
    { key: 'last_movement_date', label: 'Last Movement', render: (v) => formatDateTime(v) },
  ]

  const movementColumns = [
    { key: 'movement_id', label: 'ID', width: 100 },
    { key: 'date', label: 'Date', width: 150, render: (v) => formatDateTime(v) },
    { key: 'commodity_id', label: 'Commodity', width: 110 },
    { key: 'batch_id', label: 'Batch ID' },
    { key: 'movement_type', label: 'Type', width: 130, render: (v) => {
      const map = { Receiving: 'badge-issued', Invoice: 'badge-cancelled', 'Stock Opname': 'badge-pending', Adjustment: 'badge-draft' }
      return <span className={`status-badge ${map[v] || 'badge-draft'}`}>{v}</span>
    }},
    { key: 'qty_in', label: 'Qty In', width: 90, render: (v) => v > 0 ? <span className="text-success fw-semibold">+{formatNumber(v, 0)}</span> : '-' },
    { key: 'qty_out', label: 'Qty Out', width: 90, render: (v) => v > 0 ? <span className="text-danger fw-semibold">-{formatNumber(v, 0)}</span> : '-' },
    { key: 'balance', label: 'Balance', width: 90, render: (v) => formatNumber(v, 0) },
    { key: 'reference_id', label: 'Ref ID', width: 110 },
    { key: 'remarks', label: 'Remarks' },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div><h5 className="fw-bold mb-0">Stock Inventory</h5><small className="text-muted">Real-time inventory levels and movement log</small></div>
      </div>

      {/* Tabs */}
      <div className="d-flex gap-2 mb-3">
        {[{ id: 'stock', label: 'Stock Levels', icon: 'bi-layers' }, { id: 'movements', label: 'Movement Log', icon: 'bi-arrow-left-right' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`btn btn-sm ${tab === t.id ? 'btn-kh-primary' : 'btn-outline-secondary'}`} style={{ borderRadius: 8 }}>
            <i className={`bi ${t.icon} me-1`} />{t.label}
          </button>
        ))}
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          {tab === 'stock' && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-md-6">
                  <div className="input-group">
                    <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                    <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} placeholder="Search by product, batch ID..." value={search} onChange={handleSearch} />
                  </div>
                </div>
              </div>
              <DataTable columns={stockColumns} data={data.items} loading={loading} pagination={data} onPageChange={(p) => fetchStock(p)} />
            </>
          )}
          {tab === 'movements' && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-md-4">
                  <select className="form-select kh-input" value={moveFilter} onChange={e => { setMoveFilter(e.target.value); fetchMovements(1, e.target.value) }}>
                    <option value="">All Movement Types</option>
                    {['Receiving', 'Invoice', 'Stock Opname', 'Adjustment'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <DataTable columns={movementColumns} data={movements.items} loading={loading} pagination={movements} onPageChange={(p) => fetchMovements(p)} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
