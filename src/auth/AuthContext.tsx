import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, type User } from '../lib/api'
import { invalidateHomeCache } from '../lib/homeCache'

interface AuthValue {
  user: User | null
  loading: boolean
  setUser: (user: User | null) => void
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const previousUser = useRef<string | null>(null)

  useEffect(() => {
    let alive = true

    api
      .me()
      .then((result) => {
        if (alive) setUser(result.user)
      })
      .catch(() => {
        if (alive) setUser(null)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('zhaomu:unauthorized', onUnauthorized)
    return () =>
      window.removeEventListener('zhaomu:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    if (previousUser.current && previousUser.current !== user?.id) {
      invalidateHomeCache()
    }
    previousUser.current = user?.id ?? null
  }, [user?.id])

  const logout = async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth 必须在 AuthProvider 内使用')
  return value
}
