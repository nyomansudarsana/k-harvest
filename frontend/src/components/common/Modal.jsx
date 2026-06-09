import { useEffect } from 'react'

export default function Modal({ show, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (show) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [show])

  if (!show) return null

  const maxWidth = { sm: 400, md: 600, lg: 800, xl: 1000 }[size] || 600

  return (
    <div className="kh-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="kh-modal" style={{ maxWidth }}>
        <div className="kh-modal-header">
          <h6 className="mb-0 fw-semibold">{title}</h6>
          <button className="btn btn-sm btn-light" onClick={onClose} style={{ borderRadius: 8 }}>
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="kh-modal-body">{children}</div>
        {footer && <div className="kh-modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
