import { createClient } from '@supabase/supabase-js'

// The publishable key is public by design — it is in every page that talks to Supabase.
// Keeping it as a fallback means a fresh deploy is never a white screen because an
// environment variable was not copied across. RLS, not this key, is the security.
const FALLBACK_URL = 'https://oyuquouhjnrfzcedeltq.supabase.co'
const FALLBACK_KEY = 'sb_publishable_cfDx0TJ3P48J80jBhIyYTA_uGj6UW-l'

const url = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn('[euroclean] VITE_SUPABASE_URL is not set; using the built-in project.')
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
