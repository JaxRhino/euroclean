import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, phoneFmt, ago, today } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Tabs,
  Field, Input, Select, Textarea, useToast, Modal, MoneyInput, JOB_TONE, JOB_LABEL, INVOICE_TONE,
} from '../../components/ui'

export default function CustomerDetail() {
  const { id } = useParams()
  const toast = useToast()
  const [tab, setTab] = useState('overview')

  const c = useQuery(() => must(supabase.from('clients').select('*').eq('id', id).single()), [id])
  const props = useQuery(() => must(supabase.from('properties').select('*').eq('client_id', id).order('created_at')), [id])
  const jobs = useQuery(() => must(supabase.from('jobs').select('id,number,status,scheduled_on,arrival_window,price_cents,service_key,properties(street)').eq('client_id', id).order('scheduled_on', { ascending: false })), [id])
  const plans = useQuery(() => must(supabase.from('recurring_plans').select('*,properties(street),crews(name)').eq('client_id', id)), [id])
  const invs = useQuery(() => must(supabase.from('invoices').select('id,number,status,total_cents,paid_cents,due_on,issued_on').eq('client_id', id).order('created_at', { ascending: false })), [id])

  const patch = async (fields, msg) => {
    try {
      const saved = await must(supabase.from('clients').update(fields).eq('id', id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved.')
      if (msg) toast.ok(msg)
      c.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (c.loading) return <Loading />
  if (c.error) return <ErrorNote error={c.error} onRetry={c.reload} />
  const cl = c.data
  const name = cl.company || `${cl.first_name} ${cl.last_name || ''}`.trim()
  const done = (jobs.data || []).filter(j => j.status === 'complete')
  const lifetime = done.reduce((n, j) => n + (j.price_cents || 0), 0)
  const owing = (invs.data || []).filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
    .reduce((n, i) => n + (i.total_cents - i.paid_cents), 0)

  return (
    <>
      <PageHead eyebrow={`${cl.kind} customer · from ${cl.source}`} title={name}
                sub={[cl.phone && phoneFmt(cl.phone), cl.email].filter(Boolean).join(' · ')}>
        <Chip tone={cl.status === 'active' ? 'navy' : cl.status === 'paused' ? 'brass' : 'mute'}>{cl.status}</Chip>
        <PortalAccess client={cl} onChanged={c.reload} />
        <Link to="/os/customers" className="btn">All customers</Link>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Visits completed" value={done.length} />
        <Stat label="Lifetime value" value={money(lifetime)} />
        <Stat label="Outstanding" value={money(owing)} tone={owing ? 'var(--rust)' : undefined} />
        <Stat label="Properties" value={(props.data || []).length} />
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'overview', label: 'Overview' },
        { key: 'properties', label: 'Properties', count: (props.data || []).length },
        { key: 'jobs', label: 'Visits', count: (jobs.data || []).length },
        { key: 'plans', label: 'Recurring', count: (plans.data || []).length },
        { key: 'money', label: 'Invoices', count: (invs.data || []).length },
      ]} />

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card title="Details">
            <div className="grid gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="First name"><Input defaultValue={cl.first_name} onBlur={e => e.target.value !== cl.first_name && patch({ first_name: e.target.value }, 'Saved.')} /></Field>
                <Field label="Last name"><Input defaultValue={cl.last_name || ''} onBlur={e => e.target.value !== (cl.last_name || '') && patch({ last_name: e.target.value || null }, 'Saved.')} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone"><Input defaultValue={cl.phone || ''} onBlur={e => e.target.value !== (cl.phone || '') && patch({ phone: e.target.value || null }, 'Saved.')} /></Field>
                <Field label="Email"><Input defaultValue={cl.email || ''} onBlur={e => e.target.value !== (cl.email || '') && patch({ email: e.target.value || null }, 'Saved.')} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Company"><Input defaultValue={cl.company || ''} onBlur={e => e.target.value !== (cl.company || '') && patch({ company: e.target.value || null }, 'Saved.')} /></Field>
                <Field label="Status">
                  <Select value={cl.status} onChange={e => patch({ status: e.target.value }, 'Status changed.')}>
                    <option value="active">Active</option><option value="paused">Paused</option><option value="churned">Gone</option>
                  </Select>
                </Field>
              </div>
              <Field label="Notes — the office only">
                <Textarea rows={4} defaultValue={cl.notes || ''} onBlur={e => e.target.value !== (cl.notes || '') && patch({ notes: e.target.value || null }, 'Notes saved.')} />
              </Field>
            </div>
          </Card>

          <Card title="Next up" pad={false}>
            {(jobs.data || []).filter(j => j.scheduled_on >= today() && j.status !== 'cancelled').slice(0, 6).length === 0
              ? <div className="py-8 text-center text-[13px] text-ink-3">Nothing booked ahead.</div>
              : (
                <ul className="m-0 p-0 list-none">
                  {(jobs.data || []).filter(j => j.scheduled_on >= today() && j.status !== 'cancelled').slice(0, 6).map(j => (
                    <li key={j.id} className="px-4 py-2.5 flex items-center gap-3 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <div className="flex-1 min-w-0">
                        <Link to={`/os/jobs/${j.id}`} className="text-[13px] font-medium hover:underline">{fmtDayFull(j.scheduled_on)}</Link>
                        <div className="text-[11.5px] text-ink-3">{j.arrival_window || 'no window'} · {j.service_key}</div>
                      </div>
                      <span className="tnum text-[13px]">{money(j.price_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
      )}

      {tab === 'properties' && <Properties clientId={id} rows={props} />}
      {tab === 'jobs' && (
        (jobs.data || []).length === 0 ? <Card><EmptyState title="No visits yet." /></Card> : (
          <Card pad={false}>
            <table className="tbl">
              <thead><tr><th style={{ width: 92 }}>Job</th><th style={{ width: 170 }}>When</th><th>Address</th><th style={{ width: 120 }}>Service</th><th style={{ width: 118 }}>Status</th><th className="text-right" style={{ width: 86 }}>Price</th></tr></thead>
              <tbody>
                {jobs.data.map(j => (
                  <tr key={j.id}>
                    <td className="tnum text-[12.5px]"><Link to={`/os/jobs/${j.id}`} className="hover:underline">{j.number}</Link></td>
                    <td className="text-[12.5px]">{fmtDayFull(j.scheduled_on)}</td>
                    <td className="text-[12.5px] text-ink-2">{j.properties?.street}</td>
                    <td className="text-[12.5px]">{j.service_key}</td>
                    <td><Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip></td>
                    <td className="text-right tnum text-[13px]">{money(j.price_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
      {tab === 'plans' && <Plans clientId={id} rows={plans} props={props.data || []} />}
      {tab === 'money' && (
        (invs.data || []).length === 0 ? <Card><EmptyState title="No invoices yet." body="Invoices are made from a finished visit." /></Card> : (
          <Card pad={false}>
            <table className="tbl">
              <thead><tr><th style={{ width: 110 }}>Invoice</th><th style={{ width: 150 }}>Issued</th><th style={{ width: 150 }}>Due</th><th style={{ width: 110 }}>Status</th><th className="text-right">Total</th><th className="text-right" style={{ width: 100 }}>Outstanding</th></tr></thead>
              <tbody>
                {invs.data.map(i => (
                  <tr key={i.id}>
                    <td className="tnum text-[12.5px]"><Link to={`/os/money/${i.id}`} className="hover:underline">{i.number}</Link></td>
                    <td className="text-[12.5px]">{i.issued_on ? fmtDayFull(i.issued_on) : '—'}</td>
                    <td className="text-[12.5px]">{i.due_on ? fmtDayFull(i.due_on) : '—'}</td>
                    <td><Chip tone={INVOICE_TONE[i.status]}>{i.status}</Chip></td>
                    <td className="text-right tnum">{money(i.total_cents)}</td>
                    <td className="text-right tnum">{money(i.total_cents - i.paid_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </>
  )
}

const Stat = ({ label, value, tone }) => (
  <div className="card px-4 py-3">
    <div className="eyebrow mb-1">{label}</div>
    <div className="num text-[26px] leading-none" style={tone ? { color: tone } : undefined}>{value}</div>
  </div>
)

/* -------- portal access -------- */
function PortalAccess({ client, onChanged }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const invite = async () => {
    if (!client.email) { toast.error('Add an email address first — there is nowhere to send the invitation.'); return }
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-client', { body: { client_id: client.id } })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error || 'The invitation was not sent.')
      toast.ok(`Invitation sent to ${client.email}.`)
      onChanged()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  if (client.auth_user_id) return <Chip tone="moss">portal active</Chip>
  return <Button onClick={invite} disabled={busy}>{busy ? 'Sending…' : client.portal_invited_at ? 'Send the invite again' : 'Invite to the portal'}</Button>
}

/* -------- properties -------- */
function Properties({ clientId, rows }) {
  const toast = useToast()
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ label: 'Home', street: '', unit: '', city: 'Jacksonville', zip: '', beds: 3, baths: 2, half_baths: 0, entry_notes: '', pets: '', parking: '', gate_code: '' })

  const patch = async (p, fields) => {
    try {
      const saved = await must(supabase.from('properties').update(fields).eq('id', p.id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved.')
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  const save = async () => {
    try {
      await must(supabase.from('properties').insert({ ...f, client_id: clientId, beds: Number(f.beds), baths: Number(f.baths), half_baths: Number(f.half_baths) }).select('id').single())
      toast.ok('Property added.'); setAdd(false); rows.reload()
      setF(x => ({ ...x, street: '', unit: '', zip: '' }))
    } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <div className="flex justify-end mb-3"><Button variant="primary" onClick={() => setAdd(true)}>Add a property</Button></div>
      {rows.loading ? <Loading /> : (rows.data || []).length === 0 ? (
        <Card><EmptyState title="No property on file." body="Add one so visits have somewhere to go." /></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {rows.data.map(p => (
            <Card key={p.id} title={p.label}>
              <div className="grid gap-3">
                <Field label="Street"><Input defaultValue={p.street} onBlur={e => e.target.value !== p.street && patch(p, { street: e.target.value })} /></Field>
                <div className="grid grid-cols-[1fr_110px] gap-3">
                  <Field label="City"><Input defaultValue={p.city} onBlur={e => e.target.value !== p.city && patch(p, { city: e.target.value })} /></Field>
                  <Field label="ZIP"><Input defaultValue={p.zip} onBlur={e => e.target.value !== p.zip && patch(p, { zip: e.target.value })} /></Field>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Beds"><Input type="number" defaultValue={p.beds} onBlur={e => Number(e.target.value) !== p.beds && patch(p, { beds: Number(e.target.value) })} /></Field>
                  <Field label="Baths"><Input type="number" defaultValue={p.baths} onBlur={e => Number(e.target.value) !== p.baths && patch(p, { baths: Number(e.target.value) })} /></Field>
                  <Field label="Half"><Input type="number" defaultValue={p.half_baths} onBlur={e => Number(e.target.value) !== p.half_baths && patch(p, { half_baths: Number(e.target.value) })} /></Field>
                </div>
                <Field label="Entry — how the crew gets in">
                  <Textarea rows={2} defaultValue={p.entry_notes || ''} onBlur={e => e.target.value !== (p.entry_notes || '') && patch(p, { entry_notes: e.target.value })} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Pets"><Input defaultValue={p.pets || ''} onBlur={e => e.target.value !== (p.pets || '') && patch(p, { pets: e.target.value })} /></Field>
                  <Field label="Parking"><Input defaultValue={p.parking || ''} onBlur={e => e.target.value !== (p.parking || '') && patch(p, { parking: e.target.value })} /></Field>
                  <Field label="Gate code"><Input defaultValue={p.gate_code || ''} onBlur={e => e.target.value !== (p.gate_code || '') && patch(p, { gate_code: e.target.value })} /></Field>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={add} onClose={() => setAdd(false)} title="Add a property"
        footer={<><Button onClick={() => setAdd(false)}>Cancel</Button>
                 <Button variant="primary" disabled={!f.street || !f.zip} onClick={save}>Add it</Button></>}>
        <div className="grid gap-3">
          <div className="grid grid-cols-[150px_1fr] gap-3">
            <Field label="Label"><Input value={f.label} onChange={e => setF(x => ({ ...x, label: e.target.value }))} /></Field>
            <Field label="Street"><Input value={f.street} onChange={e => setF(x => ({ ...x, street: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-[1fr_110px_repeat(3,80px)] gap-3">
            <Field label="City"><Input value={f.city} onChange={e => setF(x => ({ ...x, city: e.target.value }))} /></Field>
            <Field label="ZIP"><Input value={f.zip} onChange={e => setF(x => ({ ...x, zip: e.target.value }))} /></Field>
            <Field label="Beds"><Input type="number" value={f.beds} onChange={e => setF(x => ({ ...x, beds: e.target.value }))} /></Field>
            <Field label="Baths"><Input type="number" value={f.baths} onChange={e => setF(x => ({ ...x, baths: e.target.value }))} /></Field>
            <Field label="Half"><Input type="number" value={f.half_baths} onChange={e => setF(x => ({ ...x, half_baths: e.target.value }))} /></Field>
          </div>
          <Field label="Entry notes"><Textarea rows={2} value={f.entry_notes} onChange={e => setF(x => ({ ...x, entry_notes: e.target.value }))} /></Field>
        </div>
      </Modal>
    </>
  )
}

/* -------- recurring plans -------- */
function Plans({ clientId, rows, props }) {
  const toast = useToast()
  const [add, setAdd] = useState(false)
  const [f, setF] = useState({ property_id: '', service_key: 'maintenance', frequency_key: 'biweekly', price: '', weekday: 2, arrival_window: '', next_date: today() })
  const cat = useQuery(() => Promise.all([
    must(supabase.from('services').select('key,label').eq('active', true).eq('quote_only', false).order('sort_order')),
    must(supabase.from('frequencies').select('key,label').eq('active', true).eq('recurring', true).order('sort_order')),
    must(supabase.from('settings').select('value').eq('key', 'arrival_windows').single()).then(r => r.value),
  ]).then(([s, fr, w]) => ({ services: s, freqs: fr, windows: w })), [])

  const save = async () => {
    try {
      await must(supabase.from('recurring_plans').insert({
        client_id: clientId, property_id: f.property_id, service_key: f.service_key,
        frequency_key: f.frequency_key, price_cents: Math.round(Number(f.price || 0) * 100),
        weekday: Number(f.weekday), arrival_window: f.arrival_window || null, next_date: f.next_date,
      }).select('id').single())
      toast.ok('Plan created. Use “Fill recurring” on the board to lay the visits out.')
      setAdd(false); rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button variant="primary" disabled={!props.length} onClick={() => setAdd(true)}>
          {props.length ? 'Add a recurring plan' : 'Add a property first'}
        </Button>
      </div>
      {rows.loading ? <Loading /> : (rows.data || []).length === 0 ? (
        <Card><EmptyState title="No recurring plan." body="A plan lays visits onto the calendar automatically at the frequency you choose." /></Card>
      ) : (
        <div className="grid gap-3">
          {rows.data.map(p => (
            <Card key={p.id}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-[15px] font-medium">{p.service_key} · {p.frequency_key}</div>
                  <div className="text-[12.5px] text-ink-2 mt-0.5">
                    {p.properties?.street} · {p.arrival_window || 'no window'} · {p.crews?.name || 'unassigned'}
                  </div>
                  <div className="text-[12px] text-ink-3 mt-0.5">Next visit lands {p.next_date ? fmtDayFull(p.next_date) : 'not set'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="num text-[24px]">{money(p.price_cents)}</span>
                  <Chip tone={p.active ? 'moss' : 'mute'}>{p.active ? 'active' : 'paused'}</Chip>
                  <ArmedButton size="sm" confirmLabel={p.active ? 'Pause it?' : 'Resume?'}
                    onConfirm={async () => {
                      await must(supabase.from('recurring_plans').update({ active: !p.active }).eq('id', p.id).select('id'))
                      rows.reload()
                    }}>{p.active ? 'Pause' : 'Resume'}</ArmedButton>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={add} onClose={() => setAdd(false)} title="Recurring plan"
        sub="Visits get laid onto the calendar from here."
        footer={<><Button onClick={() => setAdd(false)}>Cancel</Button>
                 <Button variant="primary" disabled={!f.property_id} onClick={save}>Create the plan</Button></>}>
        <div className="grid gap-3">
          <Field label="Property">
            <Select value={f.property_id} onChange={e => setF(x => ({ ...x, property_id: e.target.value }))}>
              <option value="">Choose…</option>
              {props.map(p => <option key={p.id} value={p.id}>{p.street} · {p.zip}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service">
              <Select value={f.service_key} onChange={e => setF(x => ({ ...x, service_key: e.target.value }))}>
                {(cat.data?.services || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
            <Field label="Frequency">
              <Select value={f.frequency_key} onChange={e => setF(x => ({ ...x, frequency_key: e.target.value }))}>
                {(cat.data?.freqs || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Price per visit"><Input inputMode="decimal" value={f.price} onChange={e => setF(x => ({ ...x, price: e.target.value }))} /></Field>
            <Field label="First visit"><Input type="date" value={f.next_date} onChange={e => setF(x => ({ ...x, next_date: e.target.value }))} /></Field>
            <Field label="Window">
              <Select value={f.arrival_window} onChange={e => setF(x => ({ ...x, arrival_window: e.target.value }))}>
                <option value="">None</option>
                {(cat.data?.windows || []).map(w => <option key={w} value={w}>{w}</option>)}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </>
  )
}
