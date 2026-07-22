import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) { toast.warning('Please enter username and password'); return }
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate('/')
    } catch (err) {
      // Error handled by axios interceptor
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="text-center mb-4">
          <img src="/logo.png" alt="Kopernik Harvest" style={{ width: 130, height: 'auto', marginBottom: 12, objectFit: 'contain' }} />
          <p className="text-muted" style={{ fontSize: '0.85rem' }}>Harvest Management System</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="kh-form-label">Username</label>
            <div className="input-group">
              <span className="input-group-text" style={{ borderRadius: '8px 0 0 8px', borderColor: '#d1d9e0', background: '#f8fafc' }}>
                <i className="bi bi-person text-muted" />
              </span>
              <input
                className="form-control kh-input"
                style={{ borderRadius: '0 8px 8px 0' }}
                placeholder="Enter username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                autoFocus
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="kh-form-label">Password</label>
            <div className="input-group">
              <span className="input-group-text" style={{ borderRadius: '8px 0 0 8px', borderColor: '#d1d9e0', background: '#f8fafc' }}>
                <i className="bi bi-lock text-muted" />
              </span>
              <input
                className="form-control kh-input"
                style={{ borderRadius: '0 8px 8px 0', borderRight: 'none' }}
                type={showPass ? 'text' : 'password'}
                placeholder="Enter password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              />
              <button
                type="button"
                className="input-group-text"
                style={{ cursor: 'pointer', borderColor: '#d1d9e0', background: '#f8fafc', borderRadius: '0 8px 8px 0' }}
                onClick={() => setShowPass(s => !s)}
              >
                <i className={`bi ${showPass ? 'bi-eye-slash' : 'bi-eye'} text-muted`} />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn w-100 btn-kh-primary"
            disabled={loading}
            style={{ padding: '10px', fontSize: '0.95rem' }}
          >
            {loading ? <><span className="spinner-border spinner-border-sm me-2" />Signing in...</> : <><i className="bi bi-box-arrow-in-right me-2" />Sign In</>}
          </button>
        </form>

        <div className="text-center mt-4">
          <span style={{ fontSize: '0.72rem', color: '#adb5bd' }}>
            Default: admin / admin &nbsp;·&nbsp; Kopernik Harvest v1.0
          </span>
        </div>
      </div>
    </div>
  )
}
