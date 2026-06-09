import { useEffect, useState } from 'react'
import { Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title } from 'chart.js'
import KPICard from '../components/common/KPICard'
import api from '../services/api'
import { formatNumber } from '../utils/helpers'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend, Title)

export default function Dashboard() {
  const [kpis, setKpis] = useState(null)
  const [monthlyData, setMonthlyData] = useState([])
  const [inventoryData, setInventoryData] = useState([])
  const [topSuppliers, setTopSuppliers] = useState([])
  const [alerts, setAlerts] = useState({ low_stock: [], expiring_batches: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [kRes, mRes, iRes, sRes, aRes] = await Promise.all([
          api.get('/dashboard/kpis'),
          api.get('/dashboard/monthly-receiving'),
          api.get('/dashboard/inventory-by-commodity'),
          api.get('/dashboard/top-suppliers'),
          api.get('/dashboard/alerts'),
        ])
        setKpis(kRes.data)
        setMonthlyData(mRes.data)
        setInventoryData(iRes.data)
        setTopSuppliers(sRes.data)
        setAlerts(aRes.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const barChartData = {
    labels: monthlyData.map(d => d.month),
    datasets: [{
      label: 'Receiving Count',
      data: monthlyData.map(d => d.count),
      backgroundColor: 'rgba(26,82,118,0.8)',
      borderRadius: 6,
    }],
  }

  const doughnutData = {
    labels: inventoryData.map(d => d.commodity_id),
    datasets: [{
      data: inventoryData.map(d => d.total_qty),
      backgroundColor: ['#1a5276','#2e86c1','#28a745','#f39c12','#e74c3c','#9b59b6','#1abc9c','#e67e22'],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  if (loading) return <div className="d-flex justify-content-center py-5"><div className="spinner-border text-primary" /></div>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-0">Dashboard</h5>
          <small className="text-muted">Overview of Kopernik Harvest operations</small>
        </div>
        <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
          <i className="bi bi-clock me-1" />{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        {[
          { label: 'Active Products', value: kpis?.total_products, icon: 'bi-box-seam', color: '#1a5276' },
          { label: 'Total Suppliers', value: kpis?.total_suppliers, icon: 'bi-truck', color: '#28a745' },
          { label: 'Total Stock (Kg/Unit)', value: formatNumber(kpis?.total_stock_qty, 0), icon: 'bi-layers', color: '#f39c12' },
          { label: 'Receiving This Month', value: kpis?.receiving_this_month, icon: 'bi-arrow-down-circle', color: '#2e86c1' },
          { label: 'Pending Quotations', value: kpis?.pending_quotations, icon: 'bi-file-earmark-text', color: '#e74c3c' },
          { label: 'Total Invoices', value: kpis?.total_invoices, icon: 'bi-receipt', color: '#9b59b6' },
        ].map((k, i) => (
          <div key={i} className="col-6 col-md-4 col-xl-2">
            <KPICard {...k} />
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="row g-3 mb-4">
        <div className="col-md-8">
          <div className="kh-card h-100">
            <div className="kh-card-header">
              <h6 className="mb-0 fw-semibold"><i className="bi bi-bar-chart me-2 text-primary" />Monthly Receiving Trend</h6>
            </div>
            <div className="kh-card-body">
              <Bar data={barChartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }} height={80} />
            </div>
          </div>
        </div>
        <div className="col-md-4">
          <div className="kh-card h-100">
            <div className="kh-card-header">
              <h6 className="mb-0 fw-semibold"><i className="bi bi-pie-chart me-2 text-success" />Inventory by Commodity</h6>
            </div>
            <div className="kh-card-body">
              {inventoryData.length > 0
                ? <Doughnut data={doughnutData} options={{ responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } } }} />
                : <div className="text-center text-muted py-4"><i className="bi bi-inbox fs-2 d-block mb-2" />No inventory data</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="row g-3">
        {/* Top Suppliers */}
        <div className="col-md-6">
          <div className="kh-card h-100">
            <div className="kh-card-header">
              <h6 className="mb-0 fw-semibold"><i className="bi bi-trophy me-2 text-warning" />Top Suppliers</h6>
            </div>
            <div className="kh-card-body">
              {topSuppliers.length === 0 ? <p className="text-muted text-center py-3">No data</p> : (
                <div>
                  {topSuppliers.map((s, i) => (
                    <div key={i} className="d-flex align-items-center gap-3 mb-3">
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: ['#1a5276','#2e86c1','#28a745','#f39c12','#e74c3c'][i], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.supplier_name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>{s.receiving_count} receivings · {formatNumber(s.total_qty, 0)} units</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="col-md-6">
          <div className="kh-card h-100">
            <div className="kh-card-header">
              <h6 className="mb-0 fw-semibold"><i className="bi bi-bell me-2 text-danger" />Alerts</h6>
              <span className="badge bg-danger">{alerts.low_stock.length + alerts.expiring_batches.length}</span>
            </div>
            <div className="kh-card-body" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {alerts.low_stock.length === 0 && alerts.expiring_batches.length === 0
                ? <div className="text-center text-muted py-4"><i className="bi bi-check-circle fs-2 d-block mb-2 text-success" />No active alerts</div>
                : (
                  <>
                    {alerts.low_stock.map((a, i) => (
                      <div key={i} className="alert-item alert-low-stock">
                        <i className="bi bi-exclamation-triangle-fill text-warning" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>Low Stock: {a.product_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#856404' }}>Batch {a.batch_id} · {formatNumber(a.available_qty, 0)} units remaining</div>
                        </div>
                      </div>
                    ))}
                    {alerts.expiring_batches.map((a, i) => (
                      <div key={i} className="alert-item alert-expiring">
                        <i className="bi bi-calendar-x-fill text-danger" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>Expiring: {a.product_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#721c24' }}>Batch {a.batch_id} · Expires {a.expired_date}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
