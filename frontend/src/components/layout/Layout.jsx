import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/products': 'Product Master',
  '/suppliers': 'Supplier Master',
  '/receiving': 'Receiving',
  '/qc': 'Quality Control',
  '/inventory': 'Stock Inventory',
  '/stock-opname': 'Stock Opname',
  '/quotation': 'Quotation',
  '/invoice': 'Invoice',
  '/users': 'User Management',
  '/settings': 'Settings',
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const pageTitle = PAGE_TITLES[location.pathname] || 'Kopernik Harvest'

  return (
    <div className="kh-wrapper">
      <Sidebar collapsed={collapsed} />
      <div className={`kh-main${collapsed ? ' sidebar-collapsed' : ''}`}>
        <Header collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} pageTitle={pageTitle} />
        <main className="kh-page-content page-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
