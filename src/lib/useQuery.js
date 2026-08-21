import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Runs an async supabase query. Keeps the error — a refusal must never look like
 * an empty list. `deps` behaves like useEffect deps.
 */
export function useQuery(fn, deps = [], { initial = null } = {}) {
  const [data, setData] = useState(initial)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.resolve()
      .then(fn)
      .then(d => { if (!cancelled) { setData(d); setError(null) } })
      .catch(e => { if (!cancelled) { setError(e); console.error('[query]', e) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, loading, reload, setData }
}
