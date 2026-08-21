import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, today, ago } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Tabs, Input,
  JOB_TONE, JOB_LABEL, useToast, Modal, Field, Textarea,
} from '../../components/ui'

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'today',    label: 'Today' },
  { key: 'unscheduled', label: 'Unscheduled' },
  { key: 'requests', label: 'Change requests' },
  { key: 'done',     label: 'Completed' },
  { key: 'all',      label: 'Everything' },
]

export default function Jobs() {
  const a = useAuth()
  const [tab, setTab] = useState('upcoming')
  const [q, setQ] = useState('')

  const jobs = useQuery(async () => {
    let sel = supabase.from('jobs').select(
      'id,number,status,scheduled_on,arrival_window,price_cents,service_key,source,' +
      'clients(id,first_name,last_name,company),properties(street,city,zip),crews(name,color)')
    if (tab === 'upcoming')    sel = sel.gte('scheduled_on', today()).in('status', ['scheduled', 'dispatched', 'in_progress']).order('scheduled_on')
    else if (tab === 'today')  sel = sel.eq('scheduled_on', today()).order('arrival_window', { nullsFirst: false })
    else if (tab === 'unscheduled') sel = sel.eq('status', 'unscheduled').order('created_at', { ascending: false })
    else if (tab === 'done')   sel = sel.eq('status', 'complete').order('scheduled_on', { ascending: false }).limit(200)
    else                       sel = sel.order('scheduled_on', { ascending: false }).limit(300)
    return must(sel)
  }, [tab])

  const reqs = useQuery(async () => tab !== 'requests' ? [] : must(
    supabase.from('job_change_requests')
      .select('*,clients(first_name,last_name,company),jobs(id,number,scheduled_on,arrival_window)')
      .order('status').order('created_at', { ascending: false })
  ), [tab])

  const rows = useMemo(() => {
    const list = jobs.data || []
    const s = q.trim().toLowerCase()
    if (!s) return list
    return list.filter(j =>
      (j.number || '').toLowerCase().includes(s) ||
      (j.clients?.company || '').toLowerCase().includes(s) ||
      `${j.clients?.first_name || ''} ${j.clients?.last_name || ''}`.toLowerCase().includes(s) ||
      (j.properties?.street || '').toLowerCase().includes(s) ||
      (j.properties?.zip || '').includes(s)
    )
  }, [jobs.data, q])

  return (
    <>
      <PageHead eyebrow="Operations" title="Jobs." sub="Every visit the company has on the books.">
        <Input placeholder="Search name, address, job number" value={q} onChange={e => setQ(e.target.value)} style={{ width: 260 }} />
      </PageHead>

      <Tabs tabs={TABS} value={tab} onChange={setTab} className="mb-4" />
      <ErrorNote error={jobs.error} onRetry={jobs.reload} />

      {tab === 'requests' ? (
        <Requests data={reqs} isOffice={a.isOffice} onDone={reqs.reload} />
      ) : jobs.loading ? <Loading /> : rows.length === 0 ? (
        <Card><EmptyState title="Nothing here." body={q ? 'No job matches that search.' : 'This list is empty.'} /></Card>
      ) : (
        <Card pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 92 }}>Job</th>
                <th style={{ width: 150 }}>When</th>
                <th>Customer</th>
                <th className="hidden md:table-cell">Address</th>
                <th className="hidden lg:table-cell" style={{ width: 130 }}>Crew</th>
                <th style={{ width: 118 }}>Status</th>
                <th style={{ width: 86 }} className="text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(j => (
                <tr key={j.id}>
                  <td className="tnum text-[12.5px]">
                    <Link to={`/os/jobs/${j.id}`} className="hover:underline underline-offset-2">{j.number}</Link>
                  </td>
                  <td className="text-[12.5px]">
                    {fmtDayFull(j.scheduled_on)}
                    <div className="text-[11px] text-ink-3">{j.arrival_window || 'no window'}</div>
                  </td>
                  <td>
                    <Link to={`/os/customers/${j.clients?.id}`} className="font-medium hover:underline underline-offset-2">
                      {j.clients?.company || `${j.clients?.first_name || ''} ${j.clients?.last_name || ''}`.trim()}
                    </Link>
                  </td>
                  <td className="hidden md:table-cell text-[12.5px] text-ink-2">{j.properties?.street} · {j.properties?.zip}</td>
                  <td className="hidden lg:table-cell text-[12.5px]">
                    {j.crews ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span style={{ width: 8, height: 8, background: j.crews.color, display: 'inline-block' }} />{j.crews.name}
                      </span>
                    ) : <span className="text-ink-3">—</span>}
                  </td>
                  <td><Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip></td>
                  <td className="text-right tnum text-[13px]">{money(j.price_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function Requests({ data, isOffice, onDone }) {
  const toast = useToast()
  const [reply, setReply] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  if (data.loading) return <Loading />
  const rows = data.data || []
  if (!rows.length) return <Card><EmptyState title="No change requests." body="Customers have not asked to move, skip or cancel anything." /></Card>

  const decide = async (r, status) => {
    setBusy(true)
    try {
      const saved = await must(supabase.from('job_change_requests').update({
        status, decided_at: new Date().toISOString(), office_reply: text || null,
      }).eq('id', r.id).select('id'))
      if (!saved?.length) throw new Error('Nothing was updated — check your permissions.')

      // approving a reschedule actually moves the job. A decision that changes nothing is not a decision.
      if (status === 'approved' && r.kind === 'reschedule' && r.requested_date) {
        const moved = await must(supabase.from('jobs').update({
          scheduled_on: r.requested_date,
          arrival_window: r.requested_window || null,
        }).eq('id', r.job_id).select('id'))
        if (!moved?.length) throw new Error('The request was approved but the job did not move.')
      }
      if (status === 'approved' && (r.kind === 'cancel' || r.kind === 'skip')) {
        await must(supabase.from('jobs').update({
          status: 'cancelled', cancelled_at: new Date().toISOString(),
          cancel_reason: r.kind === 'skip' ? 'Customer skipped this visit' : 'Customer cancelled',
        }).eq('id', r.job_id).select('id'))
      }
      toast.ok(status === 'approved' ? 'Approved and applied.' : 'Declined.')
      setReply(null); setText(''); onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="grid gap-3">
      {rows.map(r => (
        <Card key={r.id}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Chip tone={r.status === 'pending' ? 'brass' : r.status === 'approved' ? 'moss' : 'mute'}>{r.status}</Chip>
                <Chip tone="navy">{r.kind.replace('_', ' ')}</Chip>
                <span className="text-[12px] text-ink-3">{ago(r.created_at)}</span>
              </div>
              <div className="text-[14px] font-medium">
                {r.clients?.company || `${r.clients?.first_name} ${r.clients?.last_name || ''}`}
                <span className="text-ink-3 font-normal"> · {r.jobs?.number}</span>
              </div>
              <div className="text-[12.5px] text-ink-2 mt-1">
                Currently {fmtDayFull(r.jobs?.scheduled_on)}{r.jobs?.arrival_window ? `, ${r.jobs.arrival_window}` : ''}
                {r.requested_date && <> → wants <b>{fmtDayFull(r.requested_date)}</b>{r.requested_window ? `, ${r.requested_window}` : ''}</>}
              </div>
              {r.body && <p className="text-[13px] mt-2 mb-0 max-w-xl">{r.body}</p>}
              {r.office_reply && <p className="text-[12.5px] text-ink-3 mt-2 mb-0">Office said: {r.office_reply}</p>}
            </div>
            {isOffice && r.status === 'pending' && (
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" onClick={() => { setReply(r.id); setText('') }}>Reply &amp; decide</Button>
              </div>
            )}
          </div>

          {reply === r.id && (
            <div className="mt-3 pt-3 grid gap-2.5" style={{ borderTop: '1px solid var(--line)' }}>
              <Field label="A line back to the customer (optional)">
                <Textarea rows={2} value={text} onChange={e => setText(e.target.value)}
                          placeholder="We can do Thursday morning instead — booked you in." />
              </Field>
              <div className="flex items-center gap-2">
                <Button variant="primary" disabled={busy} onClick={() => decide(r, 'approved')}>Approve</Button>
                <Button variant="danger" disabled={busy} onClick={() => decide(r, 'declined')}>Decline</Button>
                <Button variant="ghost" onClick={() => setReply(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
