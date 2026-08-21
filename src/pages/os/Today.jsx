import { Link } from 'react-router-dom'
import { useState } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, today, fmtDayLong, fmtTime, hours, ago } from '../../lib/format'
import {
  PageHead, Card, Stat, Chip, Button, Loading, ErrorNote, EmptyState,
  JOB_TONE, JOB_LABEL, useToast, Avatar,
} from '../../components/ui'

export default function Today() {
  const a = useAuth()
  const toast = useToast()
  const d = today()

  const snap = useQuery(() => must(supabase.rpc('office_snapshot')), [])

  const jobs = useQuery(async () => must(
    supabase.from('jobs')
      .select('id,number,status,scheduled_on,arrival_window,price_cents,service_key,crew_id,' +
              'clients(id,first_name,last_name,company),properties(street,city,zip),' +
              'crews(name,color),job_assignments(staff_id,role,staff(full_name,color))')
      .eq('scheduled_on', d)
      .order('arrival_window', { ascending: true, nullsFirst: false })
  ), [d])

  const clock = useQuery(async () => must(
    supabase.from('time_entries').select('id,clock_in,job_id').is('clock_out', null)
      .eq('staff_id', a.user.id).maybeSingle()
  ), [a.user.id])

  const requests = useQuery(async () => a.isOffice ? must(
    supabase.from('job_change_requests')
      .select('id,kind,requested_date,requested_window,body,created_at,clients(first_name,last_name),jobs(number,scheduled_on)')
      .eq('status', 'pending').order('created_at', { ascending: false }).limit(6)
  ) : [], [a.isOffice])

  const mine = (jobs.data || []).filter(j => (j.job_assignments || []).some(x => x.staff_id === a.user.id))
  const list = a.isOffice ? (jobs.data || []) : mine

  const punch = async () => {
    try {
      if (clock.data) {
        await must(supabase.from('time_entries').update({ clock_out: new Date().toISOString() }).eq('id', clock.data.id).select().single())
        toast.ok('Clocked out.')
      } else {
        await must(supabase.from('time_entries').insert({ staff_id: a.user.id }).select().single())
        toast.ok('Clocked in.')
      }
      clock.reload()
    } catch (e) { toast.error(e.message) }
  }

  const s = snap.data || {}

  return (
    <>
      <PageHead
        eyebrow={fmtDayLong(d)}
        title={greeting(a.staff?.full_name)}
        sub={a.isOffice
          ? 'Everything the office needs to look at before the first crew leaves.'
          : 'Your work for today, and the clock.'}>
        <Button variant={clock.data ? 'danger' : 'primary'} onClick={punch}>
          {clock.data ? `Clock out · in since ${fmtTime(clock.data.clock_in)}` : 'Clock in'}
        </Button>
      </PageHead>

      <ErrorNote error={snap.error} onRetry={snap.reload} />

      {a.isOffice && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
          <Stat label="Today"        value={`${s.today_done ?? 0}/${s.today_jobs ?? 0}`} sub="done / booked" />
          <Stat label="This week"    value={s.week_jobs ?? 0} sub="visits scheduled" />
          <Stat label="Open leads"   value={s.open_leads ?? 0} sub={`${s.new_leads_7d ?? 0} new in 7 days`} />
          <Stat label="Requests"     value={s.pending_requests ?? 0} sub="waiting on the office"
                tone={s.pending_requests ? 'var(--brass)' : undefined} />
          <Stat label="Receivable"   value={money(s.ar_cents)} sub={`${s.overdue_invoices ?? 0} overdue`}
                tone={s.overdue_invoices ? 'var(--rust)' : undefined} />
          <Stat label="Paid this month" value={money(s.revenue_month_cents)} sub="cash received" />
          <Stat label="Low stock"    value={s.low_stock ?? 0} sub="at or under reorder"
                tone={s.low_stock ? 'var(--brass)' : undefined} />
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card
            title={a.isOffice ? `Today’s board · ${list.length} visit${list.length === 1 ? '' : 's'}` : `Your visits · ${list.length}`}
            pad={false}
            action={<Link to="/os/schedule" className="btn btn-sm">Open the week</Link>}>
            {jobs.loading ? <Loading /> : jobs.error ? <div className="p-4"><ErrorNote error={jobs.error} onRetry={jobs.reload} /></div>
              : list.length === 0 ? (
                <EmptyState
                  title={a.isOffice ? 'Nothing on the board today.' : 'You are not on a job today.'}
                  body={a.isOffice ? 'No visits are scheduled for today. The week view shows what is coming.' : 'If that looks wrong, check with the office.'}
                />
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 96 }}>Window</th>
                      <th>Customer</th>
                      <th className="hidden md:table-cell">Address</th>
                      <th className="hidden lg:table-cell">Crew</th>
                      <th style={{ width: 118 }}>Status</th>
                      <th style={{ width: 80 }} className="text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(j => (
                      <tr key={j.id} className="rowlink" onClick={() => { window.location.hash = ''; }}>
                        <td className="tnum text-[12.5px] text-ink-2">{j.arrival_window || '—'}</td>
                        <td>
                          <Link to={`/os/jobs/${j.id}`} className="font-medium hover:underline underline-offset-2">
                            {j.clients?.company || `${j.clients?.first_name || ''} ${j.clients?.last_name || ''}`.trim() || 'Customer'}
                          </Link>
                          <div className="text-[11.5px] text-ink-3 tnum">{j.number}</div>
                        </td>
                        <td className="hidden md:table-cell text-[12.5px] text-ink-2">
                          {j.properties?.street}<span className="text-ink-3"> · {j.properties?.zip}</span>
                        </td>
                        <td className="hidden lg:table-cell">
                          {j.crews
                            ? <span className="inline-flex items-center gap-1.5 text-[12.5px]">
                                <span style={{ width: 8, height: 8, background: j.crews.color, display: 'inline-block' }} />
                                {j.crews.name}
                              </span>
                            : <span className="text-[12px] text-ink-3">unassigned</span>}
                        </td>
                        <td><Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip></td>
                        <td className="text-right tnum text-[13px]">{money(j.price_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </Card>
        </div>

        <div className="grid gap-4 content-start">
          {a.isOffice && (
            <Card title="Waiting on you" pad={false}
                  action={<Link to="/os/jobs" className="btn btn-sm">All jobs</Link>}>
              {requests.loading ? <Loading /> : (requests.data || []).length === 0 ? (
                <div className="px-4 py-7 text-center text-[13px] text-ink-3">Nothing pending. Customers have not asked for anything.</div>
              ) : (
                <ul className="m-0 p-0 list-none">
                  {(requests.data || []).map(r => (
                    <li key={r.id} className="px-4 py-3 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium">
                          {r.clients?.first_name} {r.clients?.last_name}
                        </span>
                        <Chip tone="brass">{r.kind.replace('_', ' ')}</Chip>
                      </div>
                      <div className="text-[12px] text-ink-2 mt-1">
                        {r.jobs?.number} · asked {ago(r.created_at)}
                      </div>
                      {r.body && <div className="text-[12.5px] text-ink-2 mt-1.5 line-clamp-2">{r.body}</div>}
                      <Link to={`/os/jobs`} className="btn btn-sm mt-2">Open jobs</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card title="On the clock" pad={false}>
            <OnTheClock />
          </Card>
        </div>
      </div>
    </>
  )
}

function OnTheClock() {
  const open = useQuery(async () => must(
    supabase.from('time_entries')
      .select('id,clock_in,staff(full_name,color),jobs(number)')
      .is('clock_out', null).order('clock_in')
  ), [])
  if (open.loading) return <Loading />
  const rows = open.data || []
  if (!rows.length) return <div className="px-4 py-7 text-center text-[13px] text-ink-3">Nobody is clocked in.</div>
  return (
    <ul className="m-0 p-0 list-none">
      {rows.map(r => (
        <li key={r.id} className="px-4 py-2.5 flex items-center gap-2.5 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
          <Avatar name={r.staff?.full_name} color={r.staff?.color} size={24} />
          <span className="text-[13px] flex-1 min-w-0 truncate">{r.staff?.full_name}</span>
          <span className="text-[12px] tnum text-ink-3">since {fmtTime(r.clock_in)}</span>
        </li>
      ))}
    </ul>
  )
}

function greeting(name) {
  const h = new Date().getHours()
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  const first = String(name || '').split(' ')[0]
  return first ? `${part}, ${first}.` : `${part}.`
}
