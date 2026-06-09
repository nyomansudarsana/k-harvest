export default function KPICard({ label, value, icon, color = '#1a5276', subLabel }) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ background: `linear-gradient(135deg, ${color}, ${color}99)` }}>
        <i className={`bi ${icon}`} />
      </div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
        {subLabel && <div style={{ fontSize: '0.72rem', color: '#6c757d', marginTop: 2 }}>{subLabel}</div>}
      </div>
    </div>
  )
}
