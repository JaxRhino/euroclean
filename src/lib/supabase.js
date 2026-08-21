import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  // Fail loudly at boot rather than rendering an app that silently reads nothing.
  console.error('[euroclean] Supabase env missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Throw on error so callers never mistake a refusal for empty data. */
export async function must(promise) {
  const { data, error } = await promise
  if (error) throw error
  return data
}
