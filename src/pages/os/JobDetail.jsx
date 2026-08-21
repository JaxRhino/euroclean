import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, fmtDayFull, fmtStamp, phoneFmt } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Field,
  Select, Input, Textarea, Avatar, useToast, Modal, MoneyInput, JOB_TONE, JOB_LABEL,
} from '../../components/ui'

const FLOW = ['scheduled', 'dispatched', 'in_progress', 'complete']

export default function JobDetail() {
  const { id } = useParams()
  const a = useAuth()
  const toast = useToast()
  const nav = useNavigate()

  const job = useQuery(() => must(
    supabase.from('jobs').select(
      '*,clients(id,first_name,last_name,company,email,phone),' +
      'properties(*),crews(id,name,color),' +
      'job_assignments(staff_id,role,staff(id,full_name,color,phone))'
    ).eq('id', id).single()
  ), [id])

  const crews = useQuery(() => a.isOffice ? must(supabase.from('crews').select('id,name,color').eq('active', true).order('name')) : [], [a.isOffice])
  const staff = useQuery(() => a.isOffice ? must(supabase.from('staff').select('id,full_name,color,role').eq('active', true).order('full_name')) : [], [a.isOffice])
  const photos = useQuery(() => must(supabase.from('job_photos').select('*,staff(full_name)').eq('job_id', id).order('created_at')), [id])
  const supplies = useQuery(() => must(supabase.from('inventory_moves').select('*,inventory_items(name,unit)').eq('job_id', id).order('created_at')), [id])
  const invoice = useQuery(() => a.isOffice ? must(supabase.from('invoices').select('id,number,total_cents,status').eq('job_id', id).maybeSingle()) : null, [id, a.isOffice])

  const j = job.data
  const canWorkIt = a.isOffice || (j?.job_assignments || []).some(x => x.staff_id === a.user.id)

  const setStatus = async (status) => {
    const patch = { status }
    if (status === 'in_progress') patch.started_at = new Date().toISOString()
    if (status === 'complete')    patch.completed_at = new Date().toISOString()
    try {
      const saved = await must(supabase.from('jobs').update(patch).eq('id', id).select('id,status'))
      if (!saved?.length) throw new Error('That change was refused. You may not be on this job.')
      toast.ok(`Marked ${JOB_LABEL[status].toLowerCase()}.`)
      job.reload()
    } catch (e) { toast.error(e.message) }
  }

  const patch = async (fields, msg) => {
    try {
      const saved = await must(supabase.from('jobs').update(fields).eq('id', id).select('id'))
      if (!saved?.length) throw new Error('Nothing was saved — check your permissions.')
      if (msg) toast.ok(msg)
      job.reload()
    } catch (e) { toast.error(e.message) }
  }

  if (job.loading) return <Loading />
  if (job.error) return <ErrorNote error={job.error} onRetry={job.reload} />
  if (!j) return <EmptyState title="No such job." />

  const who = j.clients?.company || `${j.clients?.first_name || ''} ${j.clients?.last_name || ''}`.trim()
  const step = FLOW.indexOf(j.status)

  return (
    <>
      <PageHead
        eyebrow={<span className="tnum">{j.number}</span>}
        title={who}
        sub={`${fmtDayFull(j.scheduled_on)}${j.arrival_window ? ` · ${j.arrival_window}` : ''}`}>
        <Chip tone={JOB_TONE[j.status]}>{JOB_LABEL[j.status]}</Chip>
        <Link to="/os/schedule" className="btn">Board</Link>
      </PageHead>

      {/* ---- the status run ---- */}
      {canWorkIt && !['cancelled', 'no_access'].includes(j.status) && (
        <Card className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            {FLOW.map((s, i) => (
              <Button key={s}
                variant={i === step + 1 ? 'primary' : 'default'}
                disabled={i <= step}
                onClick={() => setStatus(s)}>
                {i <= step ? `✓ ${JOB_LABEL[s]}`.replace('✓ ', '') : JOB_LABEL[s]}
              </Button>
            ))}
            <div className="flex-1" />
            <ArmedButton variant="danger" confirmLabel="Confirm no access" onConfirm={() => setStatus('no_access')}>
              Nobody home
            </ArmedButton>
            {a.isOffice && (
              <ArmedButton variant="danger" confirmLabel="Confirm cancel"
                onConfirm={() => patch({ status: 'cancelled', cancelled_at: new Date().toISOString() }, 'Job cancelled.')}>
                Cancel visit
              </ArmedButton>
            )}
          </div>
          <div className="mt-2.5 text-[12px] text-ink-3">
            {j.started_at && <>Started {fmtStamp(j.started_at)}. </>}
            {j.completed_at && <>Finished {fmtStamp(j.completed_at)}.</>}
            {!j.started_at && 'Move it along as the visit happens — the customer sees this.'}
          </div>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 grid gap-4">
          {/* ---- the property ---- */}
          <Card title="The property">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3.5">
              <Detail label="Address" value={<>
                {j.properties?.street}{j.properties?.unit ? `, ${j.properties.unit}` : ''}<br />
                {j.properties?.city}, {j.properties?.state} {j.properties?.zip}
                <a className="block mt-1.5 text-[12px] underline underline-offset-2"
                   target="_blank" rel="noreferrer"
                   href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${j.properties?.street} ${j.properties?.city} ${j.properties?.state} ${j.properties?.zip}`)}`}>
                  Directions
                </a>
              </>} />
              <Detail label="Home" value={`${j.properties?.beds} bed · ${j.properties?.baths} bath${j.properties?.half_baths ? ` · ${j.properties.half_baths} half` : ''}`} />
              <Detail label="Entry" value={j.properties?.entry_notes || <span className="text-ink-3">nothing noted</span>} />
              <Detail label="Pets" value={j.properties?.pets || <span className="text-ink-3">none noted</span>} />
              <Detail label="Parking" value={j.properties?.parking || <span className="text-ink-3">—</span>} />
              <Detail label="Contact" value={<>
                {j.clients?.phone ? <a href={`tel:${j.clients.phone}`} className="underline underline-offset-2">{phoneFmt(j.clients.phone)}</a> : '—'}
                {j.clients?.email && <div className="text-[12px] text-ink-3 mt-0.5">{j.clients.email}</div>}
              </>} />
            </div>
            {j.properties?.gate_code && a.isStaff && (
              <div className="mt-3.5 pt-3 text-[13px]" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="label inline-block mr-2">Gate / lock code</span>
                <span className="tnum font-semibold">{j.properties.gate_code}</span>
              </div>
            )}
          </Card>

          {/* ---- notes ---- */}
          <Card title="Notes">
            <div className="grid gap-3.5">
              {a.isOffice && (
                <Field label="Office note — the crew sees this">
                  <Textarea rows={2} defaultValue={j.office_notes || ''}
                    onBlur={e => e.target.value !== (j.office_notes || '') && patch({ office_notes: e.target.value }, 'Office note saved.')} />
                </Field>
              )}
              {!a.isOffice && j.office_notes && (
                <div>
                  <span className="label">From the office</span>
                  <p className="text-[13.5px] m-0">{j.office_notes}</p>
                </div>
              )}
              {canWorkIt && (
                <Field label="Crew note — what happened on site">
                  <Textarea rows={2} defaultValue={j.crew_notes || ''}
                    onBlur={e => e.target.value !== (j.crew_notes || '') && patch({ crew_notes: e.target.value }, 'Crew note saved.')} />
                </Field>
              )}
            </div>
          </Card>

          {/* ---- photos ---- */}
          <Card title={`Photos · ${(photos.data || []).length}`} action={canWorkIt ? <PhotoUpload jobId={id} onDone={photos.reload} /> : null}>
            {(photos.data || []).length === 0
              ? <div className="py-6 text-center text-[13px] text-ink-3">No photos on this visit yet.</div>
              : <PhotoGrid rows={photos.data} />}
          </Card>

          {/* ---- supplies ---- */}
          <Card title="Supplies used" action={canWorkIt ? <UseSupply jobId={id} onDone={supplies.reload} /> : null}>
            {(supplies.data || []).length === 0
              ? <div className="py-5 text-center text-[13px] text-ink-3">Nothing recorded against this job.</div>
              : (
                <ul className="m-0 p-0 list-none">
                  {supplies.data.map(m => (
                    <li key={m.id} className="flex items-center justify-between py-1.5 text-[13px] border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                      <span>{m.inventory_items?.name}</span>
                      <span className="tnum text-ink-2">{Math.abs(m.delta)} {m.inventory_items?.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>

        {/* ---- right rail ---- */}
        <div className="grid gap-4 content-start">
          <Card title="Money">
            <div className="num text-[32px] leading-none">{money(j.price_cents)}</div>
            <div className="text-[12px] text-ink-3 mt-1.5">{j.service_key.replace('_', ' ')}{j.frequency_key ? ` · ${j.frequency_key}` : ''}</div>
            {a.isOffice && (
              <div className="mt-3.5 pt-3.5 grid gap-2" style={{ borderTop: '1px solid var(--line)' }}>
                <Field label="Adjust the price">
                  <MoneyInput cents={j.price_cents} onCents={c => c !== j.price_cents && patch({ price_cents: c }, 'Price updated.')} />
                </Field>
                {invoice.data
                  ? <Link to={`/os/money/${invoice.data.id}`} className="btn">
                      {invoice.data.number} · {money(invoice.data.total_cents)} · {invoice.data.status}
                    </Link>
                  : <MakeInvoice job={j} onDone={() => { invoice.reload(); toast.ok('Invoice created.') }} />}
              </div>
            )}
          </Card>

          {a.isOffice && (
            <Card title="Crew">
              <Field label="Crew on this visit" className="mb-3">
                <Select value={j.crew_id || ''} onChange={e => patch({ crew_id: e.target.value || null }, 'Crew set.')}>
                  <option value="">Unassigned</option>
                  {(crews.data || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <span className="label">People</span>
              <ul className="m-0 p-0 list-none mt-1.5">
                {(j.job_assignments || []).map(x => (
                  <li key={x.staff_id} className="flex items-center gap-2 py-1.5">
                    <Avatar name={x.staff?.full_name} color={x.staff?.color} size={24} />
                    <span className="text-[13px] flex-1">{x.staff?.full_name}</span>
                    <span className="text-[11px] uppercase tracking-[.1em] text-ink-3">{x.role}</span>
                    <ArmedButton size="sm" variant="ghost" confirmLabel="Remove?"
                      onConfirm={async () => {
                        await must(supabase.from('job_assignments').delete().eq('job_id', id).eq('staff_id', x.staff_id).select())
                        job.reload()
                      }}>Remove</ArmedButton>
                  </li>
                ))}
                {(j.job_assignments || []).length === 0 && <li className="text-[12.5px] text-ink-3 py-1">Nobody assigned.</li>}
              </ul>
              <Select className="mt-2" value=""
                onChange={async e => {
                  if (!e.target.value) return
                  try {
                    await must(supabase.from('job_assignments').insert({ job_id: id, staff_id: e.target.value }).select().single())
                    job.reload()
                  } catch (er) { toast.error(er.message.includes('duplicate') ? 'Already on this job.' : er.message) }
                }}>
                <option value="">Add someone…</option>
                {(staff.data || []).filter(s => !(j.job_assignments || []).some(x => x.staff_id === s.id))
                  .map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </Select>
            </Card>
          )}

          <Card title="Record">
            <dl className="m-0 grid gap-2.5 text-[12.5px]">
              <Row k="Booked via" v={j.source} />
              <Row k="Created" v={fmtStamp(j.created_at)} />
              {j.plan_id && <Row k="From plan" v="recurring" />}
              <Row k="Duration" v={`${j.duration_min} min`} />
            </dl>
          </Card>
        </div>
      </div>
    </>
  )
}

const Detail = ({ label, value }) => (
  <div><span className="label">{label}</span><div className="text-[13.5px] leading-snug">{value}</div></div>
)
const Row = ({ k, v }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className="text-ink-3">{k}</dt><dd className="m-0 text-right">{v}</dd>
  </div>
)

/* ---------------- photos ---------------- */
function PhotoGrid({ rows }) {
  const [urls, setUrls] = useState({})
  useQuery(async () => {
    const paths = rows.map(r => r.path)
    if (!paths.length) return null
    const { data } = await supabase.storage.from('job-photos').createSignedUrls(paths, 3600)
    setUrls(Object.fromEntries((data || []).map(d => [d.path, d.signedUrl])))
    return null
  }, [rows.map(r => r.id).join(',')])

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {rows.map(p => (
        <figure key={p.id} className="m-0">
          <div className="aspect-square overflow-hidden" style={{ background: 'var(--paper3)' }}>
            {urls[p.path]
              ? <img src={urls[p.path]} alt={p.caption || p.kind} className="w-full h-full object-cover" />
              : <div className="w-full h-full" />}
          </div>
          <figcaption className="text-[10.5px] uppercase tracking-[.1em] text-ink-3 mt-1">{p.kind}</figcaption>
        </figure>
      ))}
    </div>
  )
}

function PhotoUpload({ jobId, onDone }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const a = useAuth()

  const onPick = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setBusy(true)
    try {
      for (const f of files) {
        // A file the browser cannot decode is a file nothing downstream can use.
        if (!/^image\/(jpeg|png|webp|gif)$/.test(f.type)) {
          toast.error(`${f.name} is a ${f.type || 'unknown'} file — save it as JPEG or PNG first.`)
          continue
        }
        const path = `${jobId}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error } = await supabase.storage.from('job-photos').upload(path, f, { upsert: false })
        if (error) throw error
        await must(supabase.from('job_photos').insert({ job_id: jobId, staff_id: a.user.id, path, kind: 'after' }).select().single())
      }
      toast.ok('Uploaded.')
      onDone()
    } catch (er) { toast.error(er.message) } finally { setBusy(false); e.target.value = '' }
  }

  return (
    <label className="btn btn-sm cursor-pointer">
      {busy ? 'Uploading…' : 'Add photos'}
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={onPick} disabled={busy} />
    </label>
  )
}

/* ---------------- supplies ---------------- */
function UseSupply({ jobId, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [item, setItem] = useState('')
  const [qty, setQty] = useState('1')
  const items = useQuery(() => open ? must(supabase.from('inventory_items').select('id,name,unit,on_hand').eq('active', true).order('name')) : [], [open])

  const save = async () => {
    try {
      await must(supabase.from('inventory_moves').insert({
        item_id: item, delta: -Math.abs(Number(qty) || 0), reason: 'used', job_id: jobId, staff_id: a.user.id,
      }).select().single())
      toast.ok('Recorded — stock adjusted.')
      setOpen(false); setItem(''); setQty('1'); onDone()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>Record supply</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="What did you use?"
             sub="This comes straight off the shelf count."
             footer={<>
               <Button onClick={() => setOpen(false)}>Cancel</Button>
               <Button variant="primary" disabled={!item || !Number(qty)} onClick={save}>Record it</Button>
             </>}>
        <div className="grid gap-3">
          <Field label="Item">
            <Select value={item} onChange={e => setItem(e.target.value)}>
              <option value="">Choose…</option>
              {(items.data || []).map(i => <option key={i.id} value={i.id}>{i.name} — {i.on_hand} {i.unit} on hand</option>)}
            </Select>
          </Field>
          <Field label="How many">
            <Input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}

/* ---------------- invoice ---------------- */
function MakeInvoice({ job, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const create = async () => {
    setBusy(true)
    try {
      const due = new Date(); due.setDate(due.getDate() + 14)
      await must(supabase.from('invoices').insert({
        client_id: job.client_id, job_id: job.id,
        lines: [{ name: `${job.service_key} — ${job.number}`, cents: job.price_cents, qty: 1 }],
        subtotal_cents: job.price_cents, total_cents: job.price_cents,
        status: 'draft', issued_on: new Date().toISOString().slice(0, 10),
        due_on: due.toISOString().slice(0, 10), created_by: a.user.id,
      }).select('id').single())
      onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }
  return <Button variant="primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create the invoice'}</Button>
}
