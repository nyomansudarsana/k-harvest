import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Header({ collapsed, onToggle, pageTitle }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="kh-header">
      <div className="d-flex align-items-center gap-3">
        <button
          className="btn btn-sm btn-light"
          onClick={onToggle}
          style={{ borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <i className={`bi ${collapsed ? 'bi-layout-sidebar' : 'bi-layout-sidebar-inset'}`} />
        </button>
        <h6 className="mb-0 fw-semibold text-secondary" style={{ fontSize: '0.9rem' }}>
          {pageTitle}
        </h6>
      </div>

      <div className="d-flex align-items-center gap-3">
        <div className="d-none d-md-flex align-items-center gap-2">
          <div style={{
            width: 34, height: 34, borderRadius: '50%',
            background: 'linear-gradient(135deg,#1a5276,#2e86c1)',
            color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 600, fontSize: '0.85rem',
          }}>
            {user?.full_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.2 }}>{user?.full_name}</div>
            <div style={{ fontSize: '0.7rem', color: '#6c757d' }}>{user?.role}</div>
          </div>
        </div>
        <button
          className="btn btn-sm btn-outline-danger"
          onClick={handleLogout}
          style={{ borderRadius: 8, fontSize: '0.8rem' }}
        >
          <i className="bi bi-box-arrow-right me-1" />
          Logout
        </button>
      </div>
    </header>
  )
}
