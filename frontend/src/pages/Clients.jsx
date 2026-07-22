import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import DataTable from '../components/common/DataTable'
import Modal from '../components/common/Modal'
import api from '../services/api'
import { formatDate, exportToExcel, debounce } from '../utils/helpers'

const INDUSTRIES = [
  'Agriculture', 'Commodities Trading', 'Food & Beverage', 'Manufacturing',
  'Retail', 'Wholesale', 'Export / Import', 'Logistics', 'Finance',
  'Government', 'Healthcare', 'Technology', 'Other',
]

const PAYMENT_TERMS = ['COD', 'Net 7', 'Net 14', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'Prepaid']

const CURRENCIES = ['USD', 'IDR', 'EUR', 'SGD', 'MYR', 'AUD', 'JPY', 'GBP']

const INIT = {
  client_name: '', company_name: '', contact_person: '',
  phone_number: '', mobile_number: '', email: '', website: '',
  address: '', city: '', province: '', postal_code: '', country: 'Indonesia',
  npwp: '', tax_registered: 'No',
  industry: '', preferred_currency: 'USD', payment_terms: '', credit_limit: '',
  status: 'Active', remarks: '',
}

export default function Clients() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, size: 20, pages: 1 })
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState({ show: false, mode: 'create', item: null })
  const [form, setForm] = useState(INIT)
  const [saving, setSaving] = useState(false)
  const [deleteModal, setDeleteModal] = useState(null)
  const [activeTab, setActiveTab] = useState('basic')

  const fetchData = useCallback(async (page = 1, q = search) => {
    setLoading(true)
    try {
      const res = await api.get('/clients', { params: { page, size: 20, search: q || undefined } })
      setData(res.data)
    } finally { setLoading(false) }
  }, [search])

  useEffect(() => { fetchData(1) }, [])

  const debouncedSearch = useCallback(debounce((q) => fetchData(1, q), 400), [fetchData])
  const handleSearch = (e) => { setSearch(e.target.value); debouncedSearch(e.target.value) }

  const openCreate = () => {
    setForm(INIT)
    setActiveTab('basic')
    setModal({ show: true, mode: 'create', item: null })
  }

  const openEdit = (item) => {
    setForm({
      client_name: item.client_name || '',
      company_name: item.company_name || '',
      contact_person: item.contact_person || '',
      phone_number: item.phone_number || '',
      mobile_number: item.mobile_number || '',
      email: item.email || '',
      website: item.website || '',
      address: item.address || '',
      city: item.city || '',
      province: item.province || '',
      postal_code: item.postal_code || '',
      country: item.country || 'Indonesia',
      npwp: item.npwp || '',
      tax_registered: item.tax_registered || 'No',
      industry: item.industry || '',
      preferred_currency: item.preferred_currency || 'USD',
      payment_terms: item.payment_terms || '',
      credit_limit: item.credit_limit != null ? String(item.credit_limit) : '',
      status: item.status || 'Active',
      remarks: item.remarks || '',
    })
    setActiveTab('basic')
    setModal({ show: true, mode: 'edit', item })
  }

  const handleSave = async () => {
    if (!form.client_name.trim()) { toast.warning('Client Name is required'); return }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.warning('Please enter a valid email address'); return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        credit_limit: form.credit_limit !== '' ? parseFloat(form.credit_limit) : 0,
      }
      if (modal.mode === 'create') {
        await api.post('/clients', payload)
        toast.success('Client created successfully')
      } else {
        await api.put(`/clients/${modal.item.client_id}`, payload)
        toast.success('Client updated successfully')
      }
      setModal({ show: false })
      fetchData(data.page)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save client')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    try {
      await api.delete(`/clients/${deleteModal.client_id}`)
      toast.success('Client deleted')
      setDeleteModal(null)
      fetchData(data.page)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to delete client')
    }
  }

  const handleExport = async () => {
    try {
      const res = await api.get('/clients/all')
      exportToExcel(
        res.data.map(c => ({
          'Client ID': c.client_id,
          'Client Name': c.client_name,
          'Company': c.company_name,
          'City': c.city,
          'Country': c.country,
        })),
        'clients',
      )
    } catch { toast.error('Export failed') }
  }

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const columns = [
    { key: 'client_id', label: 'ID', width: 90, sortable: true },
    { key: 'client_name', label: 'Client Name', sortable: true },
    { key: 'company_name', label: 'Company' },
    { key: 'contact_person', label: 'Contact Person' },
    { key: 'phone_number', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'city', label: 'City' },
    {
      key: 'status', label: 'Status', width: 90,
      render: (v) => (
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
          background: v === 'Active' ? '#D1FAE5' : '#F3F4F6',
          color: v === 'Active' ? '#065F46' : '#374151',
        }}>{v}</span>
      ),
    },
    { key: 'created_at', label: 'Created', width: 110, render: (v) => formatDate(v) },
    {
      key: 'actions', label: '', width: 80,
      render: (_, row) => (
        <div className="d-flex gap-1">
          <button className="btn btn-sm btn-outline-primary" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => openEdit(row)}><i className="bi bi-pencil" /></button>
          <button className="btn btn-sm btn-outline-danger" style={{ borderRadius: 6, padding: '3px 8px' }} onClick={() => setDeleteModal(row)}><i className="bi bi-trash" /></button>
        </div>
      ),
    },
  ]

  const tabStyle = (id) => ({
    padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer',
    fontSize: 12.5, fontWeight: activeTab === id ? 700 : 500,
    color: activeTab === id ? '#1a5276' : '#6B7280',
    borderBottom: `2px solid ${activeTab === id ? '#1a5276' : 'transparent'}`,
  })

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-0">Client Master</h5>
          <small className="text-muted">Manage client and customer records</small>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-success" onClick={handleExport} style={{ borderRadius: 8 }}>
            <i className="bi bi-file-excel me-1" />Export
          </button>
          <button className="btn btn-sm btn-kh-primary" onClick={openCreate} style={{ borderRadius: 8 }}>
            <i className="bi bi-plus-lg me-1" />New Client
          </button>
        </div>
      </div>

      <div className="kh-card mb-3">
        <div className="kh-card-body" style={{ padding: '12px 16px' }}>
          <div className="d-flex gap-2 align-items-center">
            <div className="input-group" style={{ maxWidth: 340 }}>
              <span className="input-group-text" style={{ background: '#F9FAFB', border: '1px solid #D1D5DB' }}>
                <i className="bi bi-search text-muted" />
              </span>
              <input
                className="form-control kh-input"
                placeholder="Search by name, company, email…"
                value={search}
                onChange={handleSearch}
              />
            </div>
            <span className="text-muted" style={{ fontSize: 12.5 }}>{data.total} record{data.total !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <div className="kh-card">
        <div className="kh-card-body" style={{ padding: 0 }}>
          <DataTable
            columns={columns}
            data={data.items}
            loading={loading}
            pagination={{ page: data.page, pages: data.pages, total: data.total, size: data.size }}
            onPageChange={(p) => fetchData(p)}
            emptyText="No clients found"
          />
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        show={modal.show}
        onClose={() => setModal({ show: false })}
        title={modal.mode === 'create' ? 'New Client' : `Edit — ${modal.item?.client_name}`}
        size="lg"
        footer={
          <div className="d-flex justify-content-end gap-2">
            <button className="btn btn-secondary" onClick={() => setModal({ show: false })}>Cancel</button>
            <button className="btn btn-kh-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : modal.mode === 'create' ? 'Create Client' : 'Save Changes'}
            </button>
          </div>
        }
      >
        {/* Modal Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E4E7EC', marginBottom: 16, marginTop: -4 }}>
          {[
            { id: 'basic', label: 'Basic Info' },
            { id: 'address', label: 'Address' },
            { id: 'commercial', label: 'Commercial' },
            { id: 'tax', label: 'Tax & Legal' },
          ].map(t => (
            <button key={t.id} style={tabStyle(t.id)} onClick={() => setActiveTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* ── Basic Info ── */}
        {activeTab === 'basic' && (
          <div className="row g-3">
            <div className="col-12">
              <label className="kh-form-label">Client Name <span className="text-danger">*</span></label>
              <input className="form-control kh-input" value={form.client_name} onChange={e => f('client_name', e.target.value)} placeholder="e.g. PT Maju Bersama" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Company Name</label>
              <input className="form-control kh-input" value={form.company_name} onChange={e => f('company_name', e.target.value)} placeholder="Legal company name" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Contact Person</label>
              <input className="form-control kh-input" value={form.contact_person} onChange={e => f('contact_person', e.target.value)} placeholder="Primary contact name" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Phone Number</label>
              <input className="form-control kh-input" value={form.phone_number} onChange={e => f('phone_number', e.target.value)} placeholder="+62 21 xxxxxx" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Mobile Number</label>
              <input className="form-control kh-input" value={form.mobile_number} onChange={e => f('mobile_number', e.target.value)} placeholder="+62 8xx xxxxxxx" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Email</label>
              <input type="email" className="form-control kh-input" value={form.email} onChange={e => f('email', e.target.value)} placeholder="client@company.com" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Website</label>
              <input className="form-control kh-input" value={form.website} onChange={e => f('website', e.target.value)} placeholder="https://..." />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Industry</label>
              <select className="form-select kh-input" value={form.industry} onChange={e => f('industry', e.target.value)}>
                <option value="">— Select Industry —</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Status</label>
              <select className="form-select kh-input" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
            <div className="col-12">
              <label className="kh-form-label">Remarks</label>
              <textarea className="form-control kh-input" rows={2} value={form.remarks} onChange={e => f('remarks', e.target.value)} placeholder="Additional notes…" />
            </div>
          </div>
        )}

        {/* ── Address ── */}
        {activeTab === 'address' && (
          <div className="row g-3">
            <div className="col-12">
              <label className="kh-form-label">Street Address</label>
              <textarea className="form-control kh-input" rows={2} value={form.address} onChange={e => f('address', e.target.value)} placeholder="Street, building, unit…" />
            </div>
            <div className="col-md-4">
              <label className="kh-form-label">City</label>
              <input className="form-control kh-input" value={form.city} onChange={e => f('city', e.target.value)} placeholder="Jakarta" />
            </div>
            <div className="col-md-4">
              <label className="kh-form-label">Province / State</label>
              <input className="form-control kh-input" value={form.province} onChange={e => f('province', e.target.value)} placeholder="DKI Jakarta" />
            </div>
            <div className="col-md-4">
              <label className="kh-form-label">Postal Code</label>
              <input className="form-control kh-input" value={form.postal_code} onChange={e => f('postal_code', e.target.value)} placeholder="12345" />
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Country</label>
              <input className="form-control kh-input" value={form.country} onChange={e => f('country', e.target.value)} placeholder="Indonesia" />
            </div>
          </div>
        )}

        {/* ── Commercial ── */}
        {activeTab === 'commercial' && (
          <div className="row g-3">
            <div className="col-md-6">
              <label className="kh-form-label">Preferred Currency</label>
              <select className="form-select kh-input" value={form.preferred_currency} onChange={e => f('preferred_currency', e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Payment Terms</label>
              <select className="form-select kh-input" value={form.payment_terms} onChange={e => f('payment_terms', e.target.value)}>
                <option value="">— Select —</option>
                {PAYMENT_TERMS.map(pt => <option key={pt} value={pt}>{pt}</option>)}
              </select>
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Credit Limit</label>
              <div className="input-group">
                <span className="input-group-text" style={{ background: '#F9FAFB', border: '1px solid #D1D5DB', borderRight: 'none', fontSize: 12 }}>{form.preferred_currency || 'USD'}</span>
                <input
                  type="number" min="0" step="1000"
                  className="form-control kh-input"
                  value={form.credit_limit}
                  onChange={e => f('credit_limit', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>Maximum outstanding invoice value</div>
            </div>
          </div>
        )}

        {/* ── Tax & Legal ── */}
        {activeTab === 'tax' && (
          <div className="row g-3">
            <div className="col-md-6">
              <label className="kh-form-label">NPWP</label>
              <input className="form-control kh-input" value={form.npwp} onChange={e => f('npwp', e.target.value)} placeholder="00.000.000.0-000.000" />
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>Indonesian tax identification number</div>
            </div>
            <div className="col-md-6">
              <label className="kh-form-label">Tax Registered</label>
              <select className="form-select kh-input" value={form.tax_registered} onChange={e => f('tax_registered', e.target.value)}>
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      {deleteModal && (
        <div className="modal show d-block" style={{ background: 'rgba(0,0,0,.4)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center py-4">
                <i className="bi bi-exclamation-triangle-fill text-danger" style={{ fontSize: 36 }} />
                <h6 className="mt-3 mb-1 fw-bold">Delete Client?</h6>
                <p className="text-muted mb-0" style={{ fontSize: 13.5 }}>
                  <strong>{deleteModal.client_name}</strong> will be permanently removed.
                </p>
              </div>
              <div className="modal-footer justify-content-center border-0">
                <button className="btn btn-secondary btn-sm" onClick={() => setDeleteModal(null)}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={handleDelete}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
