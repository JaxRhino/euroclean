import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const OFFICE = ['owner', 'manager', 'dispatcher']
const PRINCIPAL = ['owner', 'manager']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)   // undefined = not resolved yet
  const [staff, setStaff] = useState(null)
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)

  const resolveIdentity = useCallback(async (uid) => {
    if (!uid) { setStaff(null); setClient(null); return }
    // Who is this? An employee, a client, or neither. Both reads are self-scoped by RLS.
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('staff').select('*').eq('id', uid).maybeSingle(),
      supabase.from('clients').select('*').eq('auth_user_id', uid).maybeSingle(),
    ])
    setStaff(s && s.active ? s : null)
    setClient(c || null)
  }, [])

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session || null)
      await resolveIdentity(data.session?.user?.id)
      if (alive) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (!alive) return
      setSession(s)
      await resolveIdentity(s?.user?.id)
      setLoading(false)
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [resolveIdentity])

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    staff,
    client,
    loading,
    role: staff?.role || null,
    isStaff: !!staff,
    isOffice: !!staff && OFFICE.includes(staff.role),
    isPrincipal: !!staff && PRINCIPAL.includes(staff.role),
    isCrew: !!staff && !OFFICE.includes(staff.role),
    isClient: !staff && !!client,
    refresh: () => resolveIdentity(session?.user?.id),
    signOut: () => supabase.auth.signOut(),
  }), [session, staff, client, loading, resolveIdentity])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
