import { useQuery } from './useQuery'
import { supabase, must } from './supabase'

/** The service catalogue is DATA. Nothing in this app hardcodes a service key list. */
export function useCatalog() {
  return useQuery(async () => {
    const [services, frequencies, extras, stages] = await Promise.all([
      must(supabase.from('services').select('*').eq('active', true).order('sort_order')),
      must(supabase.from('frequencies').select('*').eq('active', true).order('sort_order')),
      must(supabase.from('service_extras').select('*').eq('active', true).order('sort_order')),
      must(supabase.from('pipeline_stages').select('*').eq('active', true).order('sort_order')),
    ])
    const byKey = (rows) => rows.reduce((a, r) => (a[r.key] = r, a), {})
    return {
      services, frequencies, extras, stages,
      service: byKey(services), frequency: byKey(frequencies),
      extra: byKey(extras), stage: byKey(stages),
    }
  }, [])
}

/** Ask the database what something costs. The database is the only pricer. */
export async function quote({ service, beds, baths, half = 0, frequency = 'once', extras = [] }) {
  return must(supabase.rpc('quote_price', {
    p_service: service, p_beds: beds, p_baths: baths, p_half: half,
    p_frequency: frequency, p_extras: extras,
  }))
}
