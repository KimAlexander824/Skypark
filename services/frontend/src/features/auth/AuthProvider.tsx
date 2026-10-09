import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authApi } from '@/api/auth'
import type { Employee, Role, Session } from '@/types'

const STORAGE_KEY = 'skypark.session'

interface AuthContextValue {
  user: Employee | null
  ready: boolean
  login: (phone: string, password: string) => Promise<Employee>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)
  const [ready, setReady] = useState(!session)

  useEffect(() => {
    if (!session) return
    authApi
      .me(session.token)
      .then((user) => setSession((s) => (s ? { ...s, user } : s)))
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY)
        setSession(null)
      })
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (phone: string, password: string) => {
    const s = await authApi.login(phone, password)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    setSession(s)
    return s.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
  }, [])

  const value = useMemo(() => ({ user: session?.user ?? null, ready, login, logout }), [session, ready, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function useCurrentUser(): Employee {
  const { user } = useAuth()
  if (!user) throw new Error('No authenticated user')
  return user
}

export const homeFor = (role: Role) => (role === 'nanny' ? '/nanny' : role === 'admin' ? '/admin' : '/reception')

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}
