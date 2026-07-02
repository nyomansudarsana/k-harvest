import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const NAV_ITEMS = [
  { section: 'Main' },
  { path: '/', icon: 'bi-speedometer2', label: 'Dashboard', exact: true },
  { section: 'Master Data' },
  { path: '/products', icon: 'bi-box-seam', label: 'Product Master' },
  { path: '/suppliers', icon: 'bi-truck', label: 'Supplier Master' },
  { section: 'Operations' },
  { path: '/receiving', icon: 'bi-arrow-down-circle', label: 'Receiving' },
  { path: '/qc', icon: 'bi-clipboard-check', label: 'QC' },
  { path: '/qc-failed', icon: 'bi-x-circle', label: 'QC Failed' },
  { section: 'Inventory' },
  { path: '/inventory', icon: 'bi-layers', label: 'Stock Inventory' },
  { path: '/stock-opname', icon: 'bi-calculator', label: 'Stock Opname' },
  { section: 'Sales' },
  { path: '/quotation', icon: 'bi-file-earmark-text', label: 'Quotation' },
  { path: '/invoice', icon: 'bi-receipt', label: 'Invoice' },
  { section: 'Admin' },
  { path: '/users', icon: 'bi-people', label: 'User Management' },
  { path: '/settings', icon: 'bi-gear', label: 'Settings' },
]

export default function Sidebar({ collapsed }) {
  const { user } = useAuth()
  const location = useLocation()

  return (
    <aside className={`kh-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="kh-sidebar-logo">
        {collapsed ? (
          <img src="/logo.svg" alt="KH" style={{ width: 36, height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', flexShrink: 0 }} />
        ) : (
          <img src="/logo-h.svg" alt="Kopernik Harvest" style={{ width: 160, height: 'auto', filter: 'brightness(0) invert(1)' }} />
        )}
      </div>

      <nav className="kh-sidebar-nav">
        {NAV_ITEMS.map((item, idx) => {
          if (item.section) {
            return collapsed ? null : (
              <div key={idx} className="kh-nav-section">{item.section}</div>
            )
          }
          if (item.path === '/users' && user?.role !== 'Administrator') return null
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path) && item.path !== '/'
              ? true
              : item.path === '/' && location.pathname === '/'
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={`kh-nav-item${isActive ? ' active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <i className={`bi ${item.icon}`} />
              {!collapsed && <span className="kh-nav-label">{item.label}</span>}
            </NavLink>
          )
        })}
      </nav>

      {!collapsed && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>
            <i className="bi bi-person-circle me-2" />
            {user?.full_name}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.65rem', marginTop: 2 }}>
            {user?.role}
          </div>
        </div>
      )}
    </aside>
  )
}
