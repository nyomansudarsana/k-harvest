import { useState, useEffect, useCallback } from 'react'
import DataTable from '../components/common/DataTable'
import api from '../services/api'
import { formatDate, formatNumber, debounce } from '../utils/helpers'

export default function QCFailed() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/qc/failed', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])
  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const columns = [
    { key: 'qc_failed_id', label: 'Failed ID', width: 130 },
    { key: 'qc_id', label: 'QC ID', width: 100 },
    { key: 'batch_id', label: 'Batch ID', width: 150 },
    { key: 'commodity_id', label: 'Comm. ID', width: 100 },
    { key: 'product_name', label: 'Product' },
    {
      key: 'failed_qty', label: 'Failed Qty', width: 110,
      render: (v) => (
        <span className="fw-semibold text-danger">{formatNumber(v, 2)}</span>
      ),
    },
    { key: 'qc_date', label: 'QC Date', width: 110, render: (v) => formatDate(v) },
    { key: 'reason', label: 'Reason' },
    {
      key: 'created_at', label: 'Recorded', width: 130,
      render: (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-',
    },
  ]

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-0">QC Failed Inventory</h5>
          <small className="text-muted">Batches rejected during quality control inspection</small>
        </div>
        <span className="badge" style={{ background: '#fff0f0', color: '#9b2335', border: '1px solid #fed7d7', fontSize: '0.85rem', padding: '6px 12px', borderRadius: 8 }}>
          <i className="bi bi-x-circle me-1" />
          {data.total} records
        </span>
      </div>

      <div className="alert alert-warning d-flex align-items-center gap-2 mb-4" style={{ borderRadius: 10, fontSize: '0.875rem' }}>
        <i className="bi bi-info-circle-fill" />
        <span>These records are automatically created when a QC inspection logs a <strong>failed quantity</strong>. Failed stock has been deducted from the main inventory.</span>
      </div>

      <div className="kh-card">
        <div className="kh-card-body">
          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#f8fafc', borderColor: '#d1d9e0', borderRadius: '8px 0 0 8px' }}><i className="bi bi-search text-muted" /></span>
                <input
                  className="form-control kh-input"
                  style={{ borderRadius: '0 8px 8px 0' }}
                  placeholder="Search by batch ID, QC ID, product..."
                  value={search}
                  onChange={handleSearch}
                />
              </div>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={data.items}
            loading={loading}
            pagination={data}
            onPageChange={(p) => fetchData(p)}
          />
        </div>
      </div>
    </div>
  )
}
