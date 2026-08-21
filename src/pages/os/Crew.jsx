import { useState, useMemo } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, hours, fmtStamp, fmtDayFull, phoneFmt, DOW, addDays, dayKey, today, startOfWeek } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Tabs,
  Field, Input, Select, Avatar, useToast, Modal, MoneyInput,
} from '../../components/ui'

const ROLES = ['owner', 'manager', 'dispatcher', 'lead', 'cleaner']

export default function Crew() {
  const [tab, setTab] = useState('people')
  const staff = useQuery(() => must(supabase.from('staff').select('*').order('active', { ascending: false }).order('full_name')), [])
  const crews = useQuery(() => must(supabase.from('crews').select('*,crew_members(staff_id,staff(id,full_name,color))').order('name')), [])

  return (
    <>
      <PageHead eyebrow="The team" title="Crew."
                sub="Who works here, which crew they ride with, and the hours behind the payroll." />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'people', label: 'People', count: (staff.data || []).filter(s => s.active).length },
        { key: 'crews', label: 'Crews', count: (crews.data || []).length },
        { key: 'availability', label: 'Availability' },
        { key: 'hours', label: 'Hours' },
      ]} />
      <ErrorNote error={staff.error} onRetry={staff.reload} />

      {tab === 'people' && <People rows={staff} />}
      {tab === 'crews' && <Crews rows={crews} staff={staff.data || []} />}
      {tab === 'availability' && <Availability staff={(staff.data || []).filter(s => s.active)} />}
      {tab === 'hours' && <Hours staff={staff.data || []} />}
    </>
  )
}

/* ---------------- people ---------------- */
function People({ rows }) {
  const a = useAuth()
  const toast = useToast()
  const [add, setAdd] = useState(false)

  const patch = async (s, fields) => {
    try {
      const saved = await must(supabase.from('staff').update(fields).eq('id', s.id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved — only an owner or manager can change this.')
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (rows.loading) return <Loading />
  const list = rows.data || []

  return (
    <>
      <div className="flex justify-end mb-3">
        {a.isPrincipal && <Button variant="primary" onClick={() => setAdd(true)}>Add an employee</Button>}
      </div>

      {list.length === 0 ? <Card><EmptyState title="Nobody on the roster." /></Card> : (
        <Card pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th><th style={{ width: 140 }}>Role</th>
                <th className="hidden md:table-cell" style={{ width: 150 }}>Phone</th>
                <th className="hidden lg:table-cell">Email</th>
                <th style={{ width: 110 }}>Rate</th>
                <th style={{ width: 106 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={s.full_name} url={s.avatar_url} color={s.color} size={28} />
                      <div>
                        <div className="font-medium">{s.full_name}</div>
                        {s.hired_on && <div className="text-[11px] text-ink-3">since {fmtDayFull(s.hired_on)}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    {a.isPrincipal && s.id !== a.user.id ? (
                      <Select className="!h-[29px] text-[12.5px]" value={s.role} onChange={e => patch(s, { role: e.target.value })}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </Select>
                    ) : <Chip tone="navy">{s.role}</Chip>}
                  </td>
                  <td className="hidden md:table-cell text-[12.5px]">{s.phone ? phoneFmt(s.phone) : '—'}</td>
                  <td className="hidden lg:table-cell text-[12.5px] text-ink-2">{s.email}</td>
                  <td className="tnum text-[12.5px]">
                    {a.isPrincipal
                      ? <div style={{ width: 92 }}><MoneyInput cents={s.hourly_rate_cents} onCents={c => c !== s.hourly_rate_cents && patch(s, { hourly_rate_cents: c })} /></div>
                      : <span className="text-ink-3">—</span>}
                  </td>
                  <td>
                    {a.isPrincipal && s.id !== a.user.id ? (
                      <ArmedButton size="sm" confirmLabel={s.active ? 'Deactivate?' : 'Reactivate?'}
                        onConfirm={() => patch(s, { active: !s.active })}>
                        {s.active ? 'Active' : 'Inactive'}
                      </ArmedButton>
                    ) : <Chip tone={s.active ? 'moss' : 'mute'}>{s.active ? 'active' : 'inactive'}</Chip>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <AddStaff open={add} onClose={() => setAdd(false)} onDone={rows.reload} />
    </>
  )
}

function AddStaff({ open, onClose, onDone }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ full_name: '', email: '', phone: '', role: 'cleaner', rate: 0, color: '#123E7C' })

  const save = async () => {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-staff', {
        body: {
          full_name: f.full_name.trim(), email: f.email.trim().toLowerCase(),
          phone: f.phone || null, role: f.role, hourly_rate_cents: f.rate, color: f.color,
        },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'The employee was not created.')
      // Created, but the invitation may not have sent. Say which happened.
      if (data.invited === false) toast.error(data.error || `${f.full_name} was added, but the invitation email did not send.`)
      else toast.ok(`${f.full_name} added. An invitation is on the way to ${f.email}.`)
      onClose(); onDone()
      setF({ full_name: '', email: '', phone: '', role: 'cleaner', rate: 0, color: '#123E7C' })
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an employee"
      sub="This creates their login and emails them an invitation."
      footer={<><Button onClick={onClose}>Cancel</Button>
               <Button variant="primary" disabled={busy || !f.full_name.trim() || !f.email.trim()} onClick={save}>
                 {busy ? 'Creating…' : 'Create and invite'}</Button></>}>
      <div className="grid gap-3.5">
        <Field label="Full name"><Input value={f.full_name} onChange={e => setF(x => ({ ...x, full_name: e.target.value }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email"><Input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} /></Field>
          <Field label="Phone"><Input value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-[1fr_140px_70px] gap-3 items-end">
          <Field label="Role">
            <Select value={f.role} onChange={e => setF(x => ({ ...x, role: e.target.value }))}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Hourly rate"><MoneyInput cents={f.rate} onCents={c => setF(x => ({ ...x, rate: c }))} /></Field>
          <Field label="Colour">
            <input type="color" value={f.color} onChange={e => setF(x => ({ ...x, color: e.target.value }))}
                   className="w-full h-9 p-0 border cursor-pointer" style={{ borderColor: 'var(--line2)' }} />
          </Field>
        </div>
        <p className="text-[12px] text-ink-3 m-0">
          Office roles — owner, manager, dispatcher — see the whole company. Lead and cleaner see the board and their own jobs, and never the books.
        </p>
      </div>
    </Modal>
  )
}

/* ---------------- crews ---------------- */
function Crews({ rows, staff }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#123E7C')

  const add = async () => {
    if (!name.trim()) return
    try {
      await must(supabase.from('crews').insert({ name: name.trim(), color }).select('id').single())
      setName(''); toast.ok('Crew added.'); rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  const toggleMember = async (crew, staffId, on) => {
    try {
      if (on) await must(supabase.from('crew_members').insert({ crew_id: crew.id, staff_id: staffId }).select().single())
      else    await must(supabase.from('crew_members').delete().eq('crew_id', crew.id).eq('staff_id', staffId).select())
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (rows.loading) return <Loading />

  return (
    <>
      <Card className="mb-4">
        <div className="flex items-end gap-2">
          <Field label="New crew" className="flex-1">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Crew A" onKeyDown={e => e.key === 'Enter' && add()} />
          </Field>
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
                 className="w-9 h-9 p-0 border cursor-pointer" style={{ borderColor: 'var(--line2)' }} aria-label="Crew colour" />
          <Button variant="primary" onClick={add} disabled={!name.trim()}>Add crew</Button>
        </div>
      </Card>

      {(rows.data || []).length === 0 ? <Card><EmptyState title="No crews yet." body="A crew is a lane on the dispatch board." /></Card> : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.data.map(c => {
            const memberIds = (c.crew_members || []).map(m => m.staff_id)
            return (
              <Card key={c.id} title={
                <span className="inline-flex items-center gap-2">
                  <span style={{ width: 9, height: 9, background: c.color, display: 'inline-block' }} />{c.name}
                </span>
              } action={
                <ArmedButton size="sm" variant="ghost" confirmLabel="Retire it?"
                  onConfirm={async () => {
                    await must(supabase.from('crews').update({ active: false }).eq('id', c.id).select('id'))
                    toast.ok('Crew retired.'); rows.reload()
                  }}>Retire</ArmedButton>
              }>
                <span className="label">Who rides with this crew</span>
                <div className="grid sm:grid-cols-2 gap-1.5 mt-1.5">
                  {staff.filter(s => s.active).map(s => {
                    const on = memberIds.includes(s.id)
                    return (
                      <label key={s.id} className="flex items-center gap-2 py-1 cursor-pointer text-[13px]">
                        <input type="checkbox" checked={on} onChange={e => toggleMember(c, s.id, e.target.checked)} />
                        <Avatar name={s.full_name} color={s.color} size={20} />
                        <span>{s.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}

/* ---------------- availability ---------------- */
function Availability({ staff }) {
  const toast = useToast()
  const rows = useQuery(() => must(supabase.from('staff_availability').select('*')), [])
  const byStaff = useMemo(() => {
    const m = {}
    for (const r of rows.data || []) (m[r.staff_id] = m[r.staff_id] || {})[r.weekday] = r
    return m
  }, [rows.data])

  const toggle = async (s, wd, on) => {
    try {
      if (on) await must(supabase.from('staff_availability').insert({ staff_id: s.id, weekday: wd }).select().single())
      else    await must(supabase.from('staff_availability').delete().eq('staff_id', s.id).eq('weekday', wd).select())
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (rows.loading) return <Loading />

  return (
    <Card pad={false}>
      <table className="tbl">
        <thead><tr><th>Employee</th>{DOW.map((d, i) => <th key={i} className="text-center" style={{ width: 62 }}>{d}</th>)}</tr></thead>
        <tbody>
          {staff.map(s => (
            <tr key={s.id}>
              <td>
                <div className="flex items-center gap-2"><Avatar name={s.full_name} color={s.color} size={24} /><span>{s.full_name}</span></div>
              </td>
              {DOW.map((_, wd) => (
                <td key={wd} className="text-center">
                  <input type="checkbox" checked={!!byStaff[s.id]?.[wd]} onChange={e => toggle(s, wd, e.target.checked)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[12px] text-ink-3 m-0">A tick means they can be scheduled that day. Empty rows mean nobody has set anything yet.</p>
    </Card>
  )
}

/* ---------------- hours ---------------- */
function Hours({ staff }) {
  const a = useAuth()
  const [week, setWeek] = useState(() => dayKey(startOfWeek(today())))
  const from = week, to = dayKey(addDays(week, 6))

  const rows = useQuery(() => must(
    supabase.from('time_entries')
      .select('*,staff(id,full_name,color,hourly_rate_cents),jobs(number)')
      .gte('clock_in', `${from}T00:00:00`).lte('clock_in', `${to}T23:59:59`)
      .order('clock_in', { ascending: false })
  ), [from, to])

  const totals = useMemo(() => {
    const m = {}
    for (const t of rows.data || []) {
      const k = t.staff_id
      m[k] = m[k] || { name: t.staff?.full_name, color: t.staff?.color, rate: t.staff?.hourly_rate_cents || 0, minutes: 0, open: 0 }
      if (t.minutes != null) m[k].minutes += t.minutes
      else m[k].open += 1
    }
    return Object.entries(m)
  }, [rows.data])

  if (rows.loading) return <Loading />

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" onClick={() => setWeek(dayKey(addDays(week, -7)))}>Previous week</Button>
        <Button size="sm" onClick={() => setWeek(dayKey(startOfWeek(today())))}>This week</Button>
        <Button size="sm" onClick={() => setWeek(dayKey(addDays(week, 7)))}>Next week</Button>
        <span className="text-[13px] text-ink-2 ml-2">{fmtDayFull(from)} – {fmtDayFull(to)}</span>
      </div>

      {totals.length === 0 ? <Card><EmptyState title="No hours this week." body="Nobody has clocked in between these dates." /></Card> : (
        <Card pad={false} className="mb-4">
          <table className="tbl">
            <thead><tr><th>Employee</th><th style={{ width: 130 }}>Hours</th>{a.isPrincipal && <th style={{ width: 130 }}>At their rate</th>}<th style={{ width: 110 }}>Open punches</th></tr></thead>
            <tbody>
              {totals.map(([id, t]) => (
                <tr key={id}>
                  <td><div className="flex items-center gap-2"><Avatar name={t.name} color={t.color} size={24} /><span>{t.name}</span></div></td>
                  <td className="tnum">{hours(t.minutes)}</td>
                  {a.isPrincipal && <td className="tnum">{money(Math.round(t.minutes / 60 * t.rate))}</td>}
                  <td>{t.open ? <Chip tone="brass">{t.open} still open</Chip> : <span className="text-ink-3 text-[12.5px]">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="Every punch this week" pad={false}>
        <table className="tbl">
          <thead><tr><th>Employee</th><th style={{ width: 190 }}>In</th><th style={{ width: 190 }}>Out</th><th style={{ width: 110 }}>Length</th><th style={{ width: 110 }}>Job</th></tr></thead>
          <tbody>
            {(rows.data || []).map(t => (
              <tr key={t.id}>
                <td className="text-[13px]">{t.staff?.full_name}</td>
                <td className="text-[12.5px] tnum">{fmtStamp(t.clock_in)}</td>
                <td className="text-[12.5px] tnum">{t.clock_out ? fmtStamp(t.clock_out) : <Chip tone="brass">on the clock</Chip>}</td>
                <td className="tnum text-[12.5px]">{hours(t.minutes)}</td>
                <td className="tnum text-[12px] text-ink-3">{t.jobs?.number || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
