import { useState } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, today, ago } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Tabs, Modal,
  Field, Input, Select, Textarea, useToast, JOB_TONE, JOB_LABEL,
} from '../../components/ui'

export default function PortalSchedule() {
  const [tab, setTab] = useState('upcoming')
  const [ask, setAsk] = useState(null)

  const jobs = useQuery(() => must(
    supabase.from('jobs')
      .select('id,number,scheduled_on,arrival_window,service_key,status,price_cents,properties(street,city,zip)')
      .order('scheduled_on', { ascending: false })
  ), [])
  const reqs = useQuery(() => must(
    supabase.from('job_change_requests').select('*,jobs(number,scheduled_on)').order('created_at', { ascending: false })
  ), [])
  const plans = useQuery(() => must(
    supabase.from('recurring_plans').select('*,properties(street)').eq('active', true)
  ), [])

  const all = jobs.data || []
  const upcoming = all.filter(j => j.scheduled_on >= today() && !['cancelled', 'complete'].includes(j.status))
  const past = all.filter(j => j.scheduled_on < today() || j.status === 'complete')

  return (
    <>
      <PageHead eyebrow="Your cleanings" title="Schedule."
                sub="Everything booked, everything done, and a way to change any of it." />

      {(plans.data || []).length > 0 && (
        <Card className="mb-4">
          <span className="label">Your recurring plan</span>
          {plans.data.map(p => (
            <div key={p.id} className="flex items-baseline justify-between gap-3 mt-1.5 flex-wrap">
              <div className="text-[14px]">
                {p.service_key.replace('_', ' ')} · <b>{p.frequency_key.replace('_', ' ')}</b> at {p.properties?.street}
              </div>
              <div className="text-[13px] text-ink-2 tnum">{money(p.price_cents)} a visit</div>
            </div>
          ))}
          <p className="text-[12px] text-ink-3 mt-2.5 mb-0">
            No contract. Skip a visit, change how often, or stop entirely — send a request below and the office sorts it.
          </p>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'upcoming', label: 'Coming up', count: upcoming.length },
        { key: 'past', label: 'History', count: past.length },
        { key: 'requests', label: 'Your requests', count: (reqs.data || []).length },
      ]} />

      <ErrorNote error={jobs.error} onRetry={jobs.reload} />

      {tab === 'requests' ? (
        reqs.loading ? <Loading /> : (reqs.data || []).length === 0 ? (
          <Card><EmptyState title="You have not asked for anything." body="Use “Change this visit” on any booking and it lands with the office." /></Card>
        ) : (
          <div className="grid gap-3">
            {reqs.data.map(r => (
              <Card key={r.id}>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <Chip tone={r.status === 'pending' ? 'brass' : r.status === 'approved' ? 'moss' : 'mute'}>{r.status}</Chip>
                  <Chip tone="navy">{r.kind.replace('_', ' ')}</Chip>
                  <span className="text-[12px] text-ink-3">sent {ago(r.created_at)} · {r.jobs?.number}</span>
                </div>
                {r.requested_date && (
                  <div className="text-[13.5px]">You asked for <b>{fmtDayFull(r.requested_date)}</b>{r.requested_window ? `, ${r.requested_window}` : ''}.</div>
                )}
                {r.body && <p className="text-[13px] text-ink-2 m-0 mt-1">{r.body}</p>}
                {r.office_reply && (
                  <div className="mt-2.5 pt-2.5 text-[13px]" style={{ borderTop: '1px solid var(--line)' }}>
                    <span className="label">The office said</span>
                    <p className="m-0 mt-0.5">{r.office_reply}</p>
                  </div>
                )}
                {r.status === 'pending' && (
                  <p className="text-[12px] text-ink-3 m-0 mt-2">Nothing has changed yet — the office has to say yes first.</p>
                )}
              </Card>
            ))}
          </div>
        )
      ) : jobs.loading ? <Loading /> : (
        (() => {
          const rows = tab === 'upcoming' ? upcoming : past
          if (!rows.length) return <Card><EmptyState title={tab === 'upcoming' ? 'Nothing booked.' : 'No history yet.'} /></Card>
          return (
            <div className="grid gap-3">
              {rows.map(j => (
                <Card key={j.id}>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <div className="disp text-[19px]">{fmtDayFull(j.scheduled_on)}</div>
                      <div className="text-[13px] text-ink-2 mt-1">
                        {j.arrival_window || 'window to be confirmed'} · {j.service_key.replace('_', ' ')}
                      </div>
                      <div className="text-[12.5px] text-ink-3 mt-0.5">{j.properties?.street}, {j.properties?.city} {j.properties?.zip}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip>
                      <span className="num text-[24px]">{money(j.price_cents)}</span>
                      {tab === 'upcoming' && <Button onClick={() => setAsk(j)}>Change this visit</Button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )
        })()
      )}

      <AskChange job={ask} onClose={() => setAsk(null)} onDone={() => { reqs.reload(); setTab('requests') }} />
    </>
  )
}

function AskChange({ job, onClose, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [kind, setKind] = useState('reschedule')
  const [date, setDate] = useState('')
  const [win, setWin] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  const windows = useQuery(() => job ? must(supabase.from('settings').select('value').eq('key', 'arrival_windows').single()).then(r => r.value) : [], [job?.id])

  const send = async () => {
    if (kind === 'reschedule' && !date) { toast.error('Pick the day you would prefer.'); return }
    setBusy(true)
    try {
      await must(supabase.from('job_change_requests').insert({
        job_id: job.id, client_id: a.client.id, kind,
        requested_date: kind === 'reschedule' ? date : null,
        requested_window: kind === 'reschedule' ? (win || null) : null,
        body: body.trim() || null,
      }).select('id').single())
      toast.ok('Sent to the office. Nothing changes until they confirm.')
      setDate(''); setWin(''); setBody('')
      onClose(); onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!job} onClose={onClose} title="Change this visit"
      sub={job ? `${fmtDayFull(job.scheduled_on)}${job.arrival_window ? `, ${job.arrival_window}` : ''}` : ''}
      footer={<><Button onClick={onClose}>Never mind</Button>
               <Button variant="primary" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Send to the office'}</Button></>}>
      <div className="grid gap-3.5">
        <Field label="What would you like to do?">
          <Select value={kind} onChange={e => setKind(e.target.value)}>
            <option value="reschedule">Move it to another day</option>
            <option value="skip">Skip just this one</option>
            <option value="cancel">Cancel this visit</option>
            <option value="add_extra">Add something to this visit</option>
            <option value="note">Just tell them something</option>
          </Select>
        </Field>

        {kind === 'reschedule' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Which day">
              <Input type="date" min={today()} value={date} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Which window">
              <Select value={win} onChange={e => setWin(e.target.value)}>
                <option value="">Any window is fine</option>
                {(windows.data || []).map(w => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
          </div>
        )}

        <Field label="Anything to add?">
          <Textarea rows={3} value={body} onChange={e => setBody(e.target.value)}
            placeholder={kind === 'add_extra' ? 'Could you do inside the fridge this time?' : 'We are travelling that week.'} />
        </Field>

        <p className="text-[12px] text-ink-3 m-0">
          This is a request, not a change. The visit stays exactly where it is until the office replies — and they always reply.
        </p>
      </div>
    </Modal>
  )
}
