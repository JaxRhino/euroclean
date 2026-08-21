import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, dayKey, addDays, startOfWeek, today, DOW, MON, parseDay } from '../../lib/format'
import {
  PageHead, Button, Chip, Loading, ErrorNote, useToast, Modal, Field, Select, Input,
  JOB_TONE, JOB_LABEL,
} from '../../components/ui'

const UNASSIGNED = '__none__'

export default function Schedule() {
  const a = useAuth()
  const toast = useToast()
  const [anchor, setAnchor] = useState(() => startOfWeek(today()))
  const [dragging, setDragging] = useState(null)
  const [over, setOver] = useState(null)
  const [gen, setGen] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => dayKey(addDays(anchor, i))), [anchor])
  const from = days[0], to = days[6]

  const crews = useQuery(() => must(supabase.from('crews').select('*').eq('active', true).order('name')), [])
  const jobs = useQuery(() => must(
    supabase.from('jobs')
      .select('id,number,status,scheduled_on,arrival_window,price_cents,service_key,crew_id,duration_min,' +
              'clients(first_name,last_name,company),properties(street,zip)')
      .gte('scheduled_on', from).lte('scheduled_on', to)
      .neq('status', 'cancelled')
      .order('arrival_window', { nullsFirst: false })
  ), [from, to])

  const lanes = useMemo(() => {
    const c = crews.data || []
    return [...c, { id: UNASSIGNED, name: 'Unassigned', color: '#67758A' }]
  }, [crews.data])

  const byCell = useMemo(() => {
    const m = {}
    for (const j of jobs.data || []) {
      const k = `${j.crew_id || UNASSIGNED}|${j.scheduled_on}`
      ;(m[k] = m[k] || []).push(j)
    }
    return m
  }, [jobs.data])

  const move = async (job, crewId, day) => {
    const nextCrew = crewId === UNASSIGNED ? null : crewId
    if (job.crew_id === nextCrew && job.scheduled_on === day) return
    // optimistic
    jobs.setData(rows => rows.map(r => r.id === job.id ? { ...r, crew_id: nextCrew, scheduled_on: day } : r))
    try {
      const saved = await must(
        supabase.from('jobs').update({ crew_id: nextCrew, scheduled_on: day })
          .eq('id', job.id).select('id,crew_id,scheduled_on')
      )
      // an UPDATE that matched no rows is not success
      if (!saved || saved.length === 0) throw new Error('The move was refused — you may not have permission to reschedule.')
      toast.ok(`${job.number} moved.`)
    } catch (e) {
      toast.error(e.message)
      jobs.reload()
    }
  }

  const runGenerate = async () => {
    setGen(true)
    try {
      const until = dayKey(addDays(anchor, 55))
      const made = await must(supabase.rpc('generate_jobs_through', { p_until: until }))
      toast.ok(made > 0 ? `${made} recurring visit${made === 1 ? '' : 's'} put on the calendar.` : 'Nothing new to add — recurring visits are already out through eight weeks.')
      jobs.reload()
    } catch (e) { toast.error(e.message) } finally { setGen(false) }
  }

  const weekTotal = (jobs.data || []).reduce((n, j) => n + (j.price_cents || 0), 0)

  return (
    <>
      <PageHead
        eyebrow="Dispatch"
        title="The week."
        sub="Drag a visit onto a crew and a day. It saves the moment you drop it.">
        {a.isOffice && (
          <>
            <Button onClick={runGenerate} disabled={gen}>{gen ? 'Working…' : 'Fill recurring'}</Button>
            <NewJobButton onDone={jobs.reload} />
          </>
        )}
      </PageHead>

      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAnchor(addDays(anchor, -7))}>Previous</Button>
          <Button size="sm" onClick={() => setAnchor(startOfWeek(today()))}>This week</Button>
          <Button size="sm" onClick={() => setAnchor(addDays(anchor, 7))}>Next</Button>
          <span className="disp text-[17px] ml-2">
            {MON[parseDay(from).getMonth()]} {parseDay(from).getDate()} – {MON[parseDay(to).getMonth()]} {parseDay(to).getDate()}
          </span>
        </div>
        <div className="text-[12.5px] text-ink-3">
          <span className="tnum">{(jobs.data || []).length}</span> visits ·
          <span className="tnum ml-1">{money(weekTotal)}</span> booked
        </div>
      </div>

      <ErrorNote error={jobs.error || crews.error} onRetry={() => { jobs.reload(); crews.reload() }} />

      {jobs.loading || crews.loading ? <Loading label="Building the board" /> : (
        <div className="card overflow-x-auto scroll">
          <div style={{ minWidth: 980 }}>
            {/* header */}
            <div className="grid sticky top-0 z-10" style={{ gridTemplateColumns: `142px repeat(7, 1fr)`, background: 'var(--paper2)' }}>
              <div className="px-3 py-2 eyebrow border-b border-r" style={{ borderColor: 'var(--line2)' }}>Crew</div>
              {days.map(d => {
                const dt = parseDay(d)
                const isToday = d === today()
                return (
                  <div key={d} className="px-3 py-2 border-b border-r last:border-r-0"
                       style={{ borderColor: 'var(--line2)', background: isToday ? '#EFF4FA' : undefined }}>
                    <div className="eyebrow" style={{ color: isToday ? 'var(--navy)' : undefined }}>{DOW[dt.getDay()]}</div>
                    <div className="num text-[17px] leading-none mt-0.5" style={{ color: isToday ? 'var(--navy)' : undefined }}>
                      {dt.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* lanes */}
            {lanes.map(lane => (
              <div key={lane.id} className="grid" style={{ gridTemplateColumns: `142px repeat(7, 1fr)` }}>
                <div className="px-3 py-2.5 border-b border-r flex items-start gap-2"
                     style={{ borderColor: 'var(--line)', background: '#fff' }}>
                  <span style={{ width: 8, height: 8, background: lane.color, display: 'inline-block', marginTop: 5 }} />
                  <span className="text-[13px] font-medium leading-tight">{lane.name}</span>
                </div>
                {days.map(d => {
                  const key = `${lane.id}|${d}`
                  const cell = byCell[key] || []
                  const isOver = over === key
                  return (
                    <div key={key}
                      className={`min-h-[86px] p-1.5 border-b border-r last:border-r-0 ${isOver ? 'dropzone' : ''}`}
                      style={{ borderColor: 'var(--line)', background: isOver ? undefined : '#fff' }}
                      onDragOver={e => { if (!a.isOffice) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key) }}
                      onDragLeave={() => setOver(o => o === key ? null : o)}
                      onDrop={e => {
                        e.preventDefault(); setOver(null)
                        if (!a.isOffice) return
                        let card = null
                        try { card = JSON.parse(e.dataTransfer.getData('application/x-ec-job')) } catch { /* not our payload */ }
                        if (card) move(card, lane.id, d)
                        setDragging(null)
                      }}>
                      {cell.map(j => (
                        <article key={j.id}
                          draggable={a.isOffice}
                          onDragStart={e => {
                            e.dataTransfer.setData('application/x-ec-job', JSON.stringify({ id: j.id, number: j.number, crew_id: j.crew_id, scheduled_on: j.scheduled_on }))
                            e.dataTransfer.effectAllowed = 'move'
                            setDragging(j.id)
                          }}
                          onDragEnd={() => { setDragging(null); setOver(null) }}
                          className={`mb-1.5 last:mb-0 px-2 py-1.5 border ${dragging === j.id ? 'dragging' : ''}`}
                          style={{ borderColor: 'var(--line2)', background: 'var(--paper2)', cursor: a.isOffice ? 'grab' : 'default' }}>
                          <Link to={`/os/jobs/${j.id}`} className="block">
                            <div className="text-[12px] font-semibold leading-tight truncate">
                              {j.clients?.company || `${j.clients?.first_name || ''} ${j.clients?.last_name || ''}`.trim()}
                            </div>
                            <div className="text-[10.5px] text-ink-3 truncate">{j.properties?.street}</div>
                            <div className="flex items-center justify-between gap-1 mt-1">
                              <span className="text-[10px] tnum text-ink-3">{(j.arrival_window || '').split('–')[0].trim() || '—'}</span>
                              <span className="text-[10px] tnum">{money(j.price_cents)}</span>
                            </div>
                            {j.status !== 'scheduled' && (
                              <span className="chip mt-1 inline-flex"
                                    style={{ height: 17, fontSize: 9.5, padding: '0 5px',
                                             color: `var(--${j.status === 'complete' ? 'moss' : j.status === 'no_access' ? 'rust' : 'brass'})` }}>
                                {JOB_LABEL[j.status]}
                              </span>
                            )}
                          </Link>
                        </article>
                      ))}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {!a.isOffice && (
        <p className="text-[12.5px] text-ink-3 mt-3">
          You can see the whole week, but only the office moves visits around.
        </p>
      )}
    </>
  )
}

/* ---------------- new job ---------------- */
function NewJobButton({ onDone }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ client_id: '', property_id: '', service_key: 'maintenance', scheduled_on: today(), arrival_window: '', price: '' })

  const clients = useQuery(() => open ? must(supabase.from('clients').select('id,first_name,last_name,company').order('first_name')) : [], [open])
  const props = useQuery(() => form.client_id ? must(supabase.from('properties').select('id,label,street,zip').eq('client_id', form.client_id)) : [], [form.client_id])
  const cat = useQuery(() => open ? must(supabase.from('services').select('key,label').eq('active', true).eq('quote_only', false).order('sort_order')) : [], [open])
  const windows = useQuery(() => open ? must(supabase.from('settings').select('value').eq('key', 'arrival_windows').single()).then(r => r.value) : [], [open])

  const save = async () => {
    setBusy(true)
    try {
      const row = await must(supabase.from('jobs').insert({
        client_id: form.client_id,
        property_id: form.property_id,
        service_key: form.service_key,
        scheduled_on: form.scheduled_on,
        arrival_window: form.arrival_window || null,
        price_cents: Math.round(Number(form.price || 0) * 100),
        source: 'office',
      }).select('id,number').single())
      toast.ok(`${row.number} added.`)
      setOpen(false); setForm(f => ({ ...f, client_id: '', property_id: '', price: '' }))
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Add a visit</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a visit"
             sub="Puts one job on the board. Recurring plans fill themselves."
             footer={<>
               <Button onClick={() => setOpen(false)}>Cancel</Button>
               <Button variant="primary" disabled={busy || !form.client_id || !form.property_id} onClick={save}>
                 {busy ? 'Saving…' : 'Add it'}
               </Button>
             </>}>
        <div className="grid gap-3.5">
          <Field label="Customer">
            <Select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, property_id: '' }))}>
              <option value="">Choose a customer</option>
              {(clients.data || []).map(c => (
                <option key={c.id} value={c.id}>{c.company || `${c.first_name} ${c.last_name || ''}`.trim()}</option>
              ))}
            </Select>
          </Field>
          <Field label="Property">
            <Select value={form.property_id} disabled={!form.client_id} onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}>
              <option value="">{form.client_id ? 'Choose a property' : 'Pick a customer first'}</option>
              {(props.data || []).map(p => <option key={p.id} value={p.id}>{p.street} · {p.zip}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service">
              <Select value={form.service_key} onChange={e => setForm(f => ({ ...f, service_key: e.target.value }))}>
                {(cat.data || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.scheduled_on} onChange={e => setForm(f => ({ ...f, scheduled_on: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Arrival window">
              <Select value={form.arrival_window} onChange={e => setForm(f => ({ ...f, arrival_window: e.target.value }))}>
                <option value="">No window</option>
                {(windows.data || []).map(w => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
            <Field label="Price" hint="Dollars. Leave blank to fill in later.">
              <Input inputMode="decimal" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0" />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  )
}
