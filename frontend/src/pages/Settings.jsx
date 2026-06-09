import { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import api from '../services/api'

const FIELDS = [
  { key: 'company_name', label: 'Company Name', type: 'text', placeholder: 'Kopernik Harvest', icon: 'bi-building' },
  { key: 'company_address', label: 'Company Address', type: 'textarea', placeholder: 'Full company address', icon: 'bi-geo-alt' },
  { key: 'company_logo', label: 'Company Logo URL', type: 'text', placeholder: 'https://...', icon: 'bi-image' },
  { key: 'invoice_prefix', label: 'Invoice Prefix', type: 'text', placeholder: 'INV', icon: 'bi-receipt' },
  { key: 'currency', label: 'Currency Code', type: 'text', placeholder: 'USD', icon: 'bi-currency-exchange' },
]

export default function Settings() {
  const [settings, setSettings] = useState({ company_name: '', company_address: '', company_logo: '', invoice_prefix: 'INV', currency: 'USD' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get('/settings').then(r => { setSettings(r.data); setLoading(false) })
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/settings', settings)
      toast.success('Settings saved')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="d-flex justify-content-center py-5"><div className="spinner-border text-primary" /></div>

  return (
    <div>
      <div className="mb-4">
        <h5 className="fw-bold mb-0">Settings</h5>
        <small className="text-muted">System configuration</small>
      </div>

      <div className="row">
        <div className="col-md-8 col-lg-6">
          <div className="kh-card">
            <div className="kh-card-header">
              <h6 className="mb-0 fw-semibold"><i className="bi bi-sliders me-2 text-primary" />Company Settings</h6>
            </div>
            <div className="kh-card-body">
              <form onSubmit={handleSave}>
                <div className="row g-3">
                  {FIELDS.map(f => (
                    <div key={f.key} className="col-12">
                      <label className="kh-form-label">{f.label}</label>
                      {f.type === 'textarea' ? (
                        <textarea className="form-control kh-input" rows={3} placeholder={f.placeholder} value={settings[f.key] || ''} onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))} />
                      ) : (
                        <div className="input-group">
                          <span className="input-group-text" style={{ borderColor: '#d1d9e0', background: '#f8fafc', borderRadius: '8px 0 0 8px' }}><i className={`bi ${f.icon} text-muted`} /></span>
                          <input className="form-control kh-input" style={{ borderRadius: '0 8px 8px 0' }} type={f.type} placeholder={f.placeholder} value={settings[f.key] || ''} onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <button type="submit" className="btn btn-kh-primary" style={{ borderRadius: 8 }} disabled={saving}>
                    {saving ? <><span className="spinner-border spinner-border-sm me-2" />Saving...</> : <><i className="bi bi-check-lg me-2" />Save Settings</>}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Preview */}
          {settings.company_logo && (
            <div className="kh-card mt-3">
              <div className="kh-card-header"><h6 className="mb-0 fw-semibold">Logo Preview</h6></div>
              <div className="kh-card-body">
                <img src={settings.company_logo} alt="Company Logo" style={{ maxHeight: 80, maxWidth: '100%', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
              </div>
            </div>
          )}

          {/* Invoice example */}
          <div className="kh-card mt-3">
            <div className="kh-card-header"><h6 className="mb-0 fw-semibold"><i className="bi bi-receipt me-2" />Invoice ID Example</h6></div>
            <div className="kh-card-body">
              <p className="mb-1" style={{ fontSize: '0.875rem', color: '#6c757d' }}>Invoices will be generated as:</p>
              <div className="d-flex gap-2 align-items-center">
                <code style={{ fontSize: '1.2rem', fontWeight: 700, color: '#1a5276', background: '#f0f7ff', padding: '6px 14px', borderRadius: 8 }}>
                  {settings.invoice_prefix || 'INV'}-00001
                </code>
                <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>{settings.invoice_prefix || 'INV'}-00002, {settings.invoice_prefix || 'INV'}-00003...</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-4 col-lg-3">
          <div className="kh-card">
            <div className="kh-card-header"><h6 className="mb-0 fw-semibold"><i className="bi bi-info-circle me-2 text-info" />System Info</h6></div>
            <div className="kh-card-body">
              {[['Version', '1.0.0'], ['Platform', 'FastAPI + React'], ['Database', 'SQLite'], ['Auth', 'JWT Bearer']].map(([l, v]) => (
                <div key={l} className="d-flex justify-content-between py-2" style={{ borderBottom: '1px solid #edf2f7', fontSize: '0.85rem' }}>
                  <span className="text-muted">{l}</span>
                  <span className="fw-semibold">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
