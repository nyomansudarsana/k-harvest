import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('kh_token')
    const savedUser = localStorage.getItem('kh_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } catch {
        localStorage.removeItem('kh_token')
        localStorage.removeItem('kh_user')
      }
    }
    setLoading(false)
  }, [])

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password })
    const { access_token, user: userData } = res.data
    localStorage.setItem('kh_token', access_token)
    localStorage.setItem('kh_user', JSON.stringify(userData))
    api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem('kh_token')
    localStorage.removeItem('kh_user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }

  /**
   * Check if the current user has a specific permission on a menu.
   * Administrators bypass all checks.
   * action: 'can_view' | 'can_create' | 'can_edit' | 'can_delete' | 'can_approve' | 'can_export'
   */
  const hasPermission = useCallback((menuCode, action = 'can_view') => {
    if (!user) return false
    if (user.role === 'Administrator') return true
    const perm = (user.permissions || []).find(p => p.menu_code === menuCode)
    return perm ? Boolean(perm[action]) : false
  }, [user])

  /**
   * True if the user can see at least one item under a sidebar group.
   */
  const canViewAny = useCallback((...menuCodes) => {
    if (!user) return false
    if (user.role === 'Administrator') return true
    return menuCodes.some(mc => hasPermission(mc, 'can_view'))
  }, [user, hasPermission])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, canViewAny }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
