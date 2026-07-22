import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// menu_code must match backend MENU_CODES and PERM_MATRIX keys
const NAV_CONFIG = [
  {
    type: 'link',
    path: '/',
    icon: 'bi-speedometer2',
    label: 'Dashboard',
    exact: true,
    menuCode: 'dashboard',
  },
  {
    type: 'link',
    path: '/command-center',
    icon: 'bi-lightning-charge-fill',
    label: 'Command Center',
    accent: true,
    menuCode: 'command_center',
  },
  {
    type: 'group',
    id: 'master',
    icon: 'bi-folder2-open',
    label: 'Master Data',
    groupMenuCodes: ['products', 'suppliers', 'clients', 'users'],
    children: [
      { path: '/products',  icon: 'bi-box-seam',       label: 'Product Master',   menuCode: 'products'  },
      { path: '/suppliers', icon: 'bi-truck',           label: 'Supplier Master',  menuCode: 'suppliers' },
      { path: '/clients',   icon: 'bi-building',        label: 'Client Master',    menuCode: 'clients'   },
      { path: '/users',     icon: 'bi-people',          label: 'User Management',  menuCode: 'users'     },
    ],
  },
  {
    type: 'group',
    id: 'inventory',
    icon: 'bi-layers',
    label: 'Inventory',
    groupMenuCodes: ['receiving', 'qc', 'qc_failed', 'inventory', 'stock_opname'],
    children: [
      { path: '/receiving',    icon: 'bi-arrow-down-circle', label: 'Receiving',      menuCode: 'receiving'    },
      { path: '/qc',           icon: 'bi-clipboard-check',  label: 'QC Inspection',  menuCode: 'qc'           },
      { path: '/qc-failed',    icon: 'bi-x-circle',         label: 'QC Failed',      menuCode: 'qc_failed'    },
      { path: '/inventory',    icon: 'bi-layers',            label: 'Stock Inventory',menuCode: 'inventory'    },
      { path: '/stock-opname', icon: 'bi-calculator',        label: 'Stock Opname',   menuCode: 'stock_opname' },
    ],
  },
  {
    type: 'group',
    id: 'sales',
    icon: 'bi-briefcase',
    label: 'Sales',
    groupMenuCodes: ['quotation', 'invoice'],
    children: [
      { path: '/quotation', icon: 'bi-file-earmark-text', label: 'Quotation', menuCode: 'quotation' },
      { path: '/invoice',   icon: 'bi-receipt',           label: 'Invoice',   menuCode: 'invoice'   },
    ],
  },
  {
    type: 'group',
    id: 'settings',
    icon: 'bi-gear',
    label: 'Settings',
    groupMenuCodes: ['settings'],
    children: [
      { path: '/settings',        icon: 'bi-sliders',   label: 'System Configuration', menuCode: 'settings' },
      { path: '/workflow-rules',  icon: 'bi-diagram-3', label: 'Workflow Rules',        menuCode: 'settings' },
    ],
  },
]

const STORAGE_KEY = 'kh-sidebar-groups'
const COLLAPSED_DEFAULT = { master: false, inventory: false, sales: false, settings: false }

function loadOpenGroups() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : COLLAPSED_DEFAULT
  } catch {
    return COLLAPSED_DEFAULT
  }
}

export default function Sidebar({ collapsed }) {
  const { user, hasPermission, canViewAny } = useAuth()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState(loadOpenGroups)

  useEffect(() => {
    const activeGroup = NAV_CONFIG.find(
      item => item.type === 'group' &&
        item.children?.some(c => location.pathname === c.path || location.pathname.startsWith(c.path + '/'))
    )
    if (activeGroup) {
      setOpenGroups(prev => {
        if (prev[activeGroup.id]) return prev
        const next = { ...prev, [activeGroup.id]: true }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
        return next
      })
    }
  }, [location.pathname])

  function toggleGroup(id) {
    setOpenGroups(prev => {
      const next = { ...prev, [id]: !prev[id] }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  return (
    <aside className={`kh-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="kh-sidebar-logo">
        {collapsed ? (
          <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '4px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="KH" style={{ width: 40, height: 40, objectFit: 'contain', display: 'block' }} />
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.95)', borderRadius: 10, padding: '8px 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="Kopernik Harvest" style={{ width: 120, height: 'auto', objectFit: 'contain', display: 'block' }} />
          </div>
        )}
      </div>

      <nav className="kh-sidebar-nav">
        {NAV_CONFIG.map(item => {
          if (item.type === 'link') {
            if (!hasPermission(item.menuCode, 'can_view')) return null
            const isActive = item.exact
              ? location.pathname === item.path
              : location.pathname.startsWith(item.path)
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`kh-nav-item${isActive ? ' active' : ''}${item.accent ? ' kh-nav-accent' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <i className={`bi ${item.icon}`} />
                {!collapsed && <span className="kh-nav-label">{item.label}</span>}
              </NavLink>
            )
          }

          if (item.type === 'group') {
            const visibleChildren = item.children.filter(
              c => hasPermission(c.menuCode, 'can_view')
            )
            if (visibleChildren.length === 0) return null

            const childActive = visibleChildren.some(
              c => location.pathname === c.path || location.pathname.startsWith(c.path + '/')
            )
            const isOpen = !collapsed && openGroups[item.id]

            return (
              <div key={item.id}>
                <button
                  className={`kh-nav-group-header${childActive ? ' child-active' : ''}`}
                  onClick={() => !collapsed && toggleGroup(item.id)}
                  title={collapsed ? item.label : undefined}
                >
                  <i className={`bi ${item.icon}`} />
                  {!collapsed && (
                    <>
                      <span className="kh-nav-label">{item.label}</span>
                      <i className={`bi bi-chevron-right kh-nav-chevron${isOpen ? ' open' : ''}`} />
                    </>
                  )}
                </button>

                {isOpen && (
                  <div className="kh-nav-children">
                    {visibleChildren.map(child => {
                      const isActive = location.pathname === child.path ||
                        location.pathname.startsWith(child.path + '/')
                      return (
                        <NavLink
                          key={child.path}
                          to={child.path}
                          className={`kh-nav-child${isActive ? ' active' : ''}`}
                        >
                          <span className="kh-nav-child-dot" />
                          <span className="kh-nav-label">{child.label}</span>
                        </NavLink>
                      )
                    })}
                  </div>
                )}

                {collapsed && visibleChildren.map(child => {
                  const isActive = location.pathname === child.path ||
                    location.pathname.startsWith(child.path + '/')
                  return (
                    <NavLink
                      key={child.path}
                      to={child.path}
                      className={`kh-nav-item${isActive ? ' active' : ''}`}
                      title={child.label}
                    >
                      <i className={`bi ${child.icon}`} />
                    </NavLink>
                  )
                })}
              </div>
            )
          }

          return null
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
