import { useState, useMemo } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, ago, phoneFmt, fmtDayFull, today } from '../../lib/format'
import { quote } from '../../lib/catalog'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Modal,
  Field, Input, Select, Textarea, MoneyInput, useToast, Tabs, Avatar,
} from '../../components/ui'

export default function Sales() {
  const toast = useToast()
  const [open, setOpen] = useState(null)      // lead id in the drawer
  const [manage, setManage] = useState(false)
  const [newLead, setNewLead] = useState(false)
  const [dragId, setDragId] = useState(null)
  const [overKey, setOverKey] = useState(null)

  const stages = useQuery(() => must(supabase.from('pipeline_stages').select('*').eq('active', true).order('sort_order')), [])
  const leads = useQuery(() => must(
    supabase.from('leads')
      .select('id,first_name,last_name,company,email,phone,city,zip,stage_key,service_key,frequency_key,' +
              'quoted_first_cents,quoted_after_cents,preferred_date,source,created_at,stage_changed_at,notes,' +
              'staff:owner_id(full_name,color)')
      .order('sort_order').order('created_at', { ascending: false })
  ), [])

  const byStage = useMemo(() => {
    const m = {}
    for (const s of stages.data || []) m[s.key] = []
    for (const l of leads.data || []) (m[l.stage_key] = m[l.stage_key] || []).push(l)
    return m
  }, [stages.data, leads.data])

  const moveTo = async (lead, stageKey) => {
    if (lead.stage_key === stageKey) return
    leads.setData(rows => rows.map(r => r.id === lead.id ? { ...r, stage_key: stageKey } : r))
    try {
      const saved = await must(supabase.from('leads').update({ stage_key: stageKey }).eq('id', lead.id).select('id,stage_key'))
      if (!saved?.length) throw new Error('The card did not move — the update matched no row.')
      await supabase.from('lead_notes').insert({
        lead_id: lead.id, kind: 'stage',
        body: `Moved to ${(stages.data || []).find(s => s.key === stageKey)?.label || stageKey}`,
      })
    } catch (e) {
      toast.error(e.message)
      leads.reload()
    }
  }

  const total = (list) => list.reduce((n, l) => n + (l.quoted_first_cents || 0), 0)

  return (
    <>
      <PageHead eyebrow="Sales" title="Pipeline."
                sub="Every enquiry from the website, the phone and referrals. Drag a card to move it.">
        <Button onClick={() => setManage(true)}>Manage stages</Button>
        <Button variant="primary" onClick={() => setNewLead(true)}>Add an enquiry</Button>
      </PageHead>

      <ErrorNote error={leads.error || stages.error} onRetry={() => { leads.reload(); stages.reload() }} />

      {stages.loading || leads.loading ? <Loading label="Loading the board" /> : (
        <div className="flex gap-3 overflow-x-auto scroll pb-3" style={{ minHeight: 440 }}>
          {(stages.data || []).map(stage => {
            const cards = byStage[stage.key] || []
            const isOver = overKey === stage.key
            return (
              <section key={stage.key}
                className={`shrink-0 flex flex-col ${isOver ? 'dropzone' : ''}`}
                style={{ width: 258, background: isOver ? undefined : 'var(--paper2)', border: '1px solid var(--line)' }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overKey !== stage.key) setOverKey(stage.key) }}
                onDragLeave={() => setOverKey(k => k === stage.key ? null : k)}
                onDrop={e => {
                  e.preventDefault(); setOverKey(null); setDragId(null)
                  let card = null
                  try { card = JSON.parse(e.dataTransfer.getData('application/x-ec-lead')) } catch { /* not ours */ }
                  if (card) moveTo(card, stage.key)
                }}>
                <header className="px-3 py-2.5 border-b" style={{ borderColor: 'var(--line)', background: '#fff' }}>
                  <div className="flex items-center gap-2">
                    <span style={{ width: 8, height: 8, background: stage.color, display: 'inline-block' }} />
                    <span className="text-[12.5px] font-semibold flex-1">{stage.label}</span>
                    <span className="tnum text-[12px] text-ink-3">{cards.length}</span>
                  </div>
                  <div className="text-[11px] text-ink-3 mt-0.5 tnum">{money(total(cards))}</div>
                </header>

                <div className="p-2 flex-1 overflow-y-auto scroll" style={{ maxHeight: 520 }}>
                  {cards.length === 0 && (
                    <div className="text-[12px] text-ink-3 text-center py-6">Nothing here.</div>
                  )}
                  {cards.map(l => (
                    <article key={l.id} draggable
                      onDragStart={e => {
                        e.dataTransfer.setData('application/x-ec-lead', JSON.stringify({ id: l.id, stage_key: l.stage_key }))
                        e.dataTransfer.effectAllowed = 'move'; setDragId(l.id)
                      }}
                      onDragEnd={() => { setDragId(null); setOverKey(null) }}
                      onClick={() => setOpen(l.id)}
                      className={`card mb-2 px-2.5 py-2 cursor-pointer ${dragId === l.id ? 'dragging' : ''}`}>
                      <div className="text-[13px] font-semibold leading-tight">
                        {l.company || `${l.first_name} ${l.last_name || ''}`.trim()}
                      </div>
                      <div className="text-[11.5px] text-ink-3 mt-0.5">
                        {l.city || '—'}{l.zip ? ` · ${l.zip}` : ''}
                      </div>
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[11px] text-ink-2">{l.service_key || 'no service yet'}</span>
                        {l.quoted_first_cents ? <span className="tnum text-[12px] font-medium">{money(l.quoted_first_cents)}</span> : null}
                      </div>
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[10.5px] text-ink-3">{ago(l.created_at)} · {l.source}</span>
                        {l.staff && <Avatar name={l.staff.full_name} color={l.staff.color} size={17} />}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      <LeadDrawer id={open} onClose={() => setOpen(null)} onChanged={leads.reload} stages={stages.data || []} />
      <StageManager open={manage} onClose={() => setManage(false)} onChanged={() => { stages.reload(); leads.reload() }} stages={stages.data || []} />
      <NewLead open={newLead} onClose={() => setNewLead(false)} onDone={leads.reload} />
    </>
  )
}

/* ================= lead drawer ================= */
function LeadDrawer({ id, onClose, onChanged, stages }) {
  const a = useAuth()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [tab, setTab] = useState('detail')

  const lead = useQuery(() => id ? must(supabase.from('leads').select('*').eq('id', id).single()) : null, [id])
  const notes = useQuery(() => id ? must(supabase.from('lead_notes').select('*,staff(full_name,color)').eq('lead_id', id).order('created_at', { ascending: false })) : [], [id])
  const staff = useQuery(() => id ? must(supabase.from('staff').select('id,full_name').eq('active', true).order('full_name')) : [], [id])

  const l = lead.data
  const patch = async (fields, msg) => {
    try {
      const saved = await must(supabase.from('leads').update(fields).eq('id', id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved.')
      if (msg) toast.ok(msg)
      lead.reload(); onChanged()
    } catch (e) { toast.error(e.message) }
  }

  const addNote = async () => {
    if (!note.trim()) return
    try {
      await must(supabase.from('lead_notes').insert({ lead_id: id, staff_id: a.user.id, kind: 'note', body: note.trim() }).select().single())
      setNote(''); notes.reload()
    } catch (e) { toast.error(e.message) }
  }

  const convert = async () => {
    try {
      const client = await must(supabase.from('clients').insert({
        first_name: l.first_name, last_name: l.last_name, company: l.company,
        email: l.email, phone: l.phone, source: l.source,
        kind: l.company ? 'commercial' : 'residential',
      }).select('id').single())

      if (l.street && l.zip) {
        await must(supabase.from('properties').insert({
          client_id: client.id, street: l.street, unit: l.unit, city: l.city || 'Jacksonville',
          zip: l.zip, beds: l.beds ?? 3, baths: l.baths ?? 2, half_baths: l.half_baths ?? 0,
        }).select('id').single())
      }
      const wonStage = stages.find(s => s.is_won)
      await must(supabase.from('leads').update({ client_id: client.id, stage_key: wonStage?.key || l.stage_key }).eq('id', id).select('id'))
      toast.ok('Customer created from this enquiry.')
      lead.reload(); onChanged()
    } catch (e) { toast.error(e.message) }
  }

  if (!id) return null

  return (
    <Modal open={!!id} onClose={onClose} width={700}
      title={lead.loading ? 'Loading…' : (l?.company || `${l?.first_name} ${l?.last_name || ''}`.trim())}
      sub={l ? `${l.source} enquiry · ${ago(l.created_at)}` : ''}
      footer={l && <>
        {l.client_id
          ? <a className="btn" href={`/app/os/customers/${l.client_id}`}>Open the customer</a>
          : <Button onClick={convert}>Make them a customer</Button>}
        <Button variant="primary" onClick={onClose}>Done</Button>
      </>}>
      {lead.loading ? <Loading /> : !l ? <EmptyState title="Gone." /> : (
        <>
          <Tabs value={tab} onChange={setTab} className="mb-4"
                tabs={[{ key: 'detail', label: 'Detail' }, { key: 'timeline', label: 'Timeline', count: (notes.data || []).length }]} />

          {tab === 'detail' ? (
            <div className="grid gap-3.5">
              <div className="grid sm:grid-cols-3 gap-3">
                <Field label="Stage">
                  <Select value={l.stage_key} onChange={e => patch({ stage_key: e.target.value }, 'Stage changed.')}>
                    {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </Select>
                </Field>
                <Field label="Owner">
                  <Select value={l.owner_id || ''} onChange={e => patch({ owner_id: e.target.value || null }, 'Owner set.')}>
                    <option value="">Nobody</option>
                    {(staff.data || []).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </Select>
                </Field>
                <Field label="Quoted (first visit)">
                  <MoneyInput cents={l.quoted_first_cents} onCents={c => patch({ quoted_first_cents: c }, 'Quote saved.')} />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input defaultValue={l.phone || ''} onBlur={e => e.target.value !== (l.phone || '') && patch({ phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <Input defaultValue={l.email || ''} onBlur={e => e.target.value !== (l.email || '') && patch({ email: e.target.value })} />
                </Field>
              </div>

              <div className="card p-3.5" style={{ background: 'var(--paper2)' }}>
                <span className="label">What they asked for</span>
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] mt-1.5">
                  <KV k="Service" v={l.service_key || '—'} />
                  <KV k="Frequency" v={l.frequency_key || '—'} />
                  <KV k="Home" v={l.beds != null ? `${l.beds} bed · ${l.baths} bath${l.half_baths ? ` · ${l.half_baths} half` : ''}` : '—'} />
                  <KV k="Extras" v={(l.extras || []).length ? l.extras.join(', ') : 'none'} />
                  <KV k="Address" v={l.street ? `${l.street}, ${l.city} ${l.zip}` : '—'} />
                  <KV k="Preferred" v={l.preferred_date ? `${fmtDayFull(l.preferred_date)}${l.preferred_window ? `, ${l.preferred_window}` : ''}` : '—'} />
                  {l.quoted_after_cents ? <KV k="Then per visit" v={money(l.quoted_after_cents)} /> : null}
                </div>
                {l.notes && <p className="text-[13px] mt-3 mb-0 pt-3" style={{ borderTop: '1px solid var(--line)' }}>{l.notes}</p>}
              </div>

              <div className="flex items-center gap-2">
                {l.phone && <a className="btn" href={`tel:${l.phone}`}>Call {phoneFmt(l.phone)}</a>}
                {l.email && <a className="btn" href={`mailto:${l.email}`}>Email</a>}
                <div className="flex-1" />
                <ArmedButton variant="danger" confirmLabel="Confirm delete"
                  onConfirm={async () => {
                    await must(supabase.from('leads').delete().eq('id', id).select())
                    toast.ok('Enquiry deleted.'); onClose(); onChanged()
                  }}>Delete</ArmedButton>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex gap-2 mb-4">
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Left a voicemail…"
                       onKeyDown={e => e.key === 'Enter' && addNote()} />
                <Button variant="primary" onClick={addNote} disabled={!note.trim()}>Add</Button>
              </div>
              {(notes.data || []).length === 0 ? (
                <div className="text-[13px] text-ink-3 text-center py-6">Nothing logged yet.</div>
              ) : (
                <ul className="m-0 p-0 list-none">
                  {notes.data.map(n => (
                    <li key={n.id} className="flex gap-2.5 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <Avatar name={n.staff?.full_name || 'System'} color={n.staff?.color || '#67758A'} size={24} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[12.5px] font-medium">{n.staff?.full_name || 'System'}</span>
                          <span className="text-[11px] text-ink-3">{ago(n.created_at)}</span>
                          {n.kind !== 'note' && <Chip tone="mute">{n.kind}</Chip>}
                        </div>
                        <p className="text-[13px] m-0 mt-0.5">{n.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
const KV = ({ k, v }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-ink-3 shrink-0" style={{ minWidth: 82 }}>{k}</span><span>{v}</span>
  </div>
)

/* ================= stage manager ================= */
function StageManager({ open, onClose, onChanged, stages }) {
  const toast = useToast()
  const [adding, setAdding] = useState({ label: '', color: '#123E7C' })

  const save = async (s, fields) => {
    try {
      const saved = await must(supabase.from('pipeline_stages').update(fields).eq('id', s.id).select('id'))
      if (!saved?.length) throw new Error('Nothing saved.')
      onChanged()
    } catch (e) { toast.error(e.message) }
  }

  const reorder = async (s, dir) => {
    const list = [...stages].sort((a, b) => a.sort_order - b.sort_order)
    const i = list.findIndex(x => x.id === s.id)
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const A = list[i], B = list[j]
    await must(supabase.from('pipeline_stages').update({ sort_order: B.sort_order }).eq('id', A.id).select('id'))
    await must(supabase.from('pipeline_stages').update({ sort_order: A.sort_order }).eq('id', B.id).select('id'))
    onChanged()
  }

  const add = async () => {
    const label = adding.label.trim()
    if (!label) return
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    try {
      await must(supabase.from('pipeline_stages').insert({
        key, label, color: adding.color,
        sort_order: Math.max(0, ...stages.map(s => s.sort_order)) + 1,
      }).select('id').single())
      setAdding({ label: '', color: '#123E7C' })
      toast.ok('Stage added.')
      onChanged()
    } catch (e) { toast.error(e.message.includes('duplicate') ? 'A stage with that name already exists.' : e.message) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pipeline stages" width={620}
      sub="These columns are yours. The board and every card read this same list."
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <ul className="m-0 p-0 list-none">
        {[...stages].sort((a, b) => a.sort_order - b.sort_order).map((s, i, arr) => (
          <li key={s.id} className="flex items-center gap-2 py-2 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
            <input type="color" value={s.color} onChange={e => save(s, { color: e.target.value })}
                   className="w-7 h-7 p-0 border cursor-pointer" style={{ borderColor: 'var(--line2)' }} aria-label={`${s.label} colour`} />
            <Input className="flex-1" defaultValue={s.label}
                   onBlur={e => e.target.value !== s.label && e.target.value.trim() && save(s, { label: e.target.value.trim() })} />
            <div className="flex items-center gap-1">
              <Button size="sm" disabled={i === 0} onClick={() => reorder(s, -1)}>Up</Button>
              <Button size="sm" disabled={i === arr.length - 1} onClick={() => reorder(s, 1)}>Down</Button>
            </div>
            {(s.is_won || s.is_lost) ? (
              <span className="chip chip-mute" style={{ minWidth: 52, justifyContent: 'center' }}>{s.is_won ? 'won' : 'lost'}</span>
            ) : (
              <ArmedButton size="sm" variant="ghost" confirmLabel="Hide it?"
                onConfirm={() => save(s, { active: false })}>Hide</ArmedButton>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 pt-4 flex items-end gap-2" style={{ borderTop: '1px solid var(--line)' }}>
        <Field label="Add a stage" className="flex-1">
          <Input value={adding.label} onChange={e => setAdding(x => ({ ...x, label: e.target.value }))}
                 placeholder="Awaiting walkthrough" onKeyDown={e => e.key === 'Enter' && add()} />
        </Field>
        <input type="color" value={adding.color} onChange={e => setAdding(x => ({ ...x, color: e.target.value }))}
               className="w-9 h-9 p-0 border cursor-pointer" style={{ borderColor: 'var(--line2)' }} aria-label="New stage colour" />
        <Button variant="primary" onClick={add} disabled={!adding.label.trim()}>Add</Button>
      </div>
      <p className="text-[12px] text-ink-3 mt-3 mb-0">
        Hiding a stage keeps its history. The won and lost columns cannot be removed — the board counts on them.
      </p>
    </Modal>
  )
}

/* ================= new lead ================= */
function NewLead({ open, onClose, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({
    first_name: '', last_name: '', company: '', phone: '', email: '',
    street: '', city: 'Jacksonville', zip: '', service_key: 'maintenance',
    frequency_key: 'biweekly', beds: 3, baths: 2, half_baths: 0, notes: '', source: 'phone',
  })
  const [q, setQ] = useState(null)
  const [busy, setBusy] = useState(false)
  const cat = useQuery(() => open ? Promise.all([
    must(supabase.from('services').select('key,label,quote_only,allows_frequency').eq('active', true).order('sort_order')),
    must(supabase.from('frequencies').select('key,label').eq('active', true).order('sort_order')),
  ]).then(([s, fr]) => ({ services: s, frequencies: fr })) : null, [open])

  const runQuote = async () => {
    try {
      const r = await quote({
        service: f.service_key, beds: Number(f.beds), baths: Number(f.baths),
        half: Number(f.half_baths), frequency: f.frequency_key, extras: [],
      })
      setQ(r)
    } catch (e) { toast.error(e.message) }
  }

  const save = async () => {
    setBusy(true)
    try {
      await must(supabase.from('leads').insert({
        ...f, beds: Number(f.beds), baths: Number(f.baths), half_baths: Number(f.half_baths),
        quoted_first_cents: q?.first_cents ?? null,
        quoted_after_cents: q?.after_cents || null,
        quote_detail: q || null,
      }).select('id').single())
      toast.ok('Enquiry added to the board.')
      onClose(); onDone()
      setQ(null)
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const svc = (cat.data?.services || []).find(s => s.key === f.service_key)

  return (
    <Modal open={open} onClose={onClose} title="Add an enquiry" width={620}
      sub="Someone called, or came in from somewhere the website does not cover."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={save} disabled={busy || !f.first_name.trim()}>{busy ? 'Saving…' : 'Add to the board'}</Button>
      </>}>
      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={f.first_name} onChange={e => setF(x => ({ ...x, first_name: e.target.value }))} /></Field>
          <Field label="Last name"><Input value={f.last_name} onChange={e => setF(x => ({ ...x, last_name: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} /></Field>
          <Field label="Email"><Input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} /></Field>
        </div>
        <Field label="Company (leave blank for a home)">
          <Input value={f.company} onChange={e => setF(x => ({ ...x, company: e.target.value }))} />
        </Field>
        <div className="grid grid-cols-[1fr_120px_100px] gap-3">
          <Field label="Street"><Input value={f.street} onChange={e => setF(x => ({ ...x, street: e.target.value }))} /></Field>
          <Field label="City"><Input value={f.city} onChange={e => setF(x => ({ ...x, city: e.target.value }))} /></Field>
          <Field label="ZIP"><Input value={f.zip} onChange={e => setF(x => ({ ...x, zip: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Service">
            <Select value={f.service_key} onChange={e => { setF(x => ({ ...x, service_key: e.target.value })); setQ(null) }}>
              {(cat.data?.services || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Frequency">
            <Select value={f.frequency_key} disabled={!svc?.allows_frequency}
                    onChange={e => { setF(x => ({ ...x, frequency_key: e.target.value })); setQ(null) }}>
              {(cat.data?.frequencies || []).map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bedrooms"><Input type="number" min="0" max="12" value={f.beds} onChange={e => { setF(x => ({ ...x, beds: e.target.value })); setQ(null) }} /></Field>
          <Field label="Full baths"><Input type="number" min="0" max="12" value={f.baths} onChange={e => { setF(x => ({ ...x, baths: e.target.value })); setQ(null) }} /></Field>
          <Field label="Half baths"><Input type="number" min="0" max="6" value={f.half_baths} onChange={e => { setF(x => ({ ...x, half_baths: e.target.value })); setQ(null) }} /></Field>
        </div>

        <div className="card p-3 flex items-center gap-3" style={{ background: 'var(--paper2)' }}>
          <Button size="sm" onClick={runQuote} disabled={svc?.quote_only}>Price it</Button>
          {svc?.quote_only
            ? <span className="text-[12.5px] text-ink-3">{svc.label} is quoted after a walkthrough.</span>
            : q ? (
              <span className="text-[13px]">
                <b className="num text-[19px] align-middle mr-1">{money(q.first_cents)}</b>
                first visit{q.recurring ? <> · then <b>{money(q.after_cents)}</b> {q.frequency_label?.toLowerCase()}</> : ''}
              </span>
            ) : <span className="text-[12.5px] text-ink-3">Uses the same price list as the website.</span>}
        </div>

        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} /></Field>
      </div>
    </Modal>
  )
}
