import { Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayLong, fmtDayFull, today } from '../../lib/format'
import { PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Stat, JOB_TONE, JOB_LABEL } from '../../components/ui'

export default function Overview() {
  const a = useAuth()
  const snap = useQuery(() => must(supabase.rpc('client_snapshot')), [])
  const next = useQuery(() => must(
    supabase.from('jobs').select('id,number,scheduled_on,arrival_window,service_key,status,price_cents,properties(street,city,zip)')
      .gte('scheduled_on', today()).in('status', ['scheduled', 'dispatched', 'in_progress'])
      .order('scheduled_on').limit(4)
  ), [])
  const recent = useQuery(() => must(
    supabase.from('jobs').select('id,number,scheduled_on,service_key,status,price_cents')
      .eq('status', 'complete').order('scheduled_on', { ascending: false }).limit(5)
  ), [])
  const guarantee = useQuery(() => must(supabase.from('settings').select('value').eq('key', 'guarantee_hours').maybeSingle()), [])

  const s = snap.data || {}
  const upcoming = next.data || []
  const first = upcoming[0]

  return (
    <>
      <PageHead eyebrow="Your account" title={`Hello, ${a.client?.first_name || 'there'}.`}
                sub="Your cleanings, your invoices, and a direct line to the office." />

      <ErrorNote error={snap.error} onRetry={snap.reload} />

      {/* ---- the next visit, stated plainly ---- */}
      {next.loading ? <Loading /> : first ? (
        <div className="card on-navy p-5 mb-5" style={{ background: 'var(--navy)', color: 'var(--navyInk)', borderColor: 'var(--navy)' }}>
          <div className="eyebrow" style={{ color: 'rgba(239,244,250,.6)' }}>Your next cleaning</div>
          <div className="disp mt-1.5" style={{ fontSize: 30, lineHeight: 1.1, fontWeight: 300, letterSpacing: '-.02em' }}>
            {fmtDayLong(first.scheduled_on)}
          </div>
          <div className="text-[14px] mt-1.5" style={{ color: 'rgba(239,244,250,.86)' }}>
            {first.arrival_window ? `Arriving between ${first.arrival_window}` : 'We will confirm your arrival window'}
            {' · '}{first.properties?.street}
          </div>
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <Link to="/portal/schedule" className="btn btn-primary">Change this visit</Link>
            <Link to="/portal/messages" className="btn">Message the office</Link>
          </div>
        </div>
      ) : (
        <Card className="mb-5">
          <EmptyState title="Nothing booked at the moment."
            body="When the office schedules your next cleaning it will appear here — and you will get a message."
            action={<Link to="/portal/messages" className="btn btn-primary">Ask for a date</Link>} />
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Cleanings so far" value={s.visits_total ?? 0} />
        <Stat label="Balance" value={money(s.balance_cents)}
              sub={s.balance_cents ? 'due now' : 'nothing owing'}
              tone={s.balance_cents ? 'var(--rust)' : 'var(--moss)'} />
        <Stat label="Requests open" value={s.open_requests ?? 0} sub="with the office" />
        <Stat label="Unread messages" value={s.unread ?? 0} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Coming up" pad={false} action={<Link to="/portal/schedule" className="btn btn-sm">All visits</Link>}>
          {upcoming.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-ink-3">Nothing scheduled ahead.</div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {upcoming.map(j => (
                <li key={j.id} className="px-4 py-3 flex items-center gap-3 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-medium">{fmtDayFull(j.scheduled_on)}</div>
                    <div className="text-[11.5px] text-ink-3">{j.arrival_window || 'window to be confirmed'}</div>
                  </div>
                  <Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip>
                  <span className="tnum text-[13px]">{money(j.price_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recently done" pad={false}>
          {(recent.data || []).length === 0 ? (
            <div className="py-8 text-center text-[13px] text-ink-3">No completed cleanings yet.</div>
          ) : (
            <ul className="m-0 p-0 list-none">
              {recent.data.map(j => (
                <li key={j.id} className="px-4 py-3 flex items-center gap-3 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                  <div className="flex-1">
                    <div className="text-[13.5px]">{fmtDayFull(j.scheduled_on)}</div>
                    <div className="text-[11.5px] text-ink-3">{j.service_key.replace('_', ' ')}</div>
                  </div>
                  <span className="tnum text-[13px] text-ink-2">{money(j.price_cents)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-3 text-[12px] text-ink-3" style={{ borderTop: '1px solid var(--line)' }}>
            Something missed? Call or message within {guarantee.data?.value ?? 48} hours and we come back and clean it. No charge, no argument.
          </div>
        </Card>
      </div>
    </>
  )
}
