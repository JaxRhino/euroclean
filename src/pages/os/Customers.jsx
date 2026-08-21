import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase, must } from '../../lib/supabase'
import { useQuery } from '../../lib/useQuery'
import { phoneFmt, ago, money } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Input, Modal,
  Field, Select, Textarea, useToast, Tabs,
} from '../../components/ui'

export default function Customers() {
  const [q, setQ] = useState('')
  const [tab, setTab] = useState('active')
  const [add, setAdd] = useState(false)

  const rows = useQuery(() => must(
    supabase.from('clients')
      .select('*,properties(id,street,city,zip),jobs(id,status,scheduled_on,price_cents)')
      .order('created_at', { ascending: false })
  ), [])

  const list = useMemo(() => {
    let l = rows.data || []
    if (tab !== 'all') l = l.filter(c => c.status === tab)
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(c =>
      `${c.first_name} ${c.last_name || ''} ${c.company || ''} ${c.email || ''} ${c.phone || ''}`.toLowerCase().includes(s) ||
      (c.properties || []).some(p => `${p.street} ${p.zip}`.toLowerCase().includes(s))
    )
    return l
  }, [rows.data, tab, q])

  const counts = useMemo(() => {
    const l = rows.data || []
    return {
      active: l.filter(c => c.status === 'active').length,
      paused: l.filter(c => c.status === 'paused').length,
      churned: l.filter(c => c.status === 'churned').length,
      all: l.length,
    }
  }, [rows.data])

  return (
    <>
      <PageHead eyebrow="The book" title="Customers." sub="Everybody Euroclean cleans for.">
        <Input placeholder="Search name, address, phone" value={q} onChange={e => setQ(e.target.value)} style={{ width: 250 }} />
        <Button variant="primary" onClick={() => setAdd(true)}>Add a customer</Button>
      </PageHead>

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'active', label: 'Active', count: counts.active },
        { key: 'paused', label: 'Paused', count: counts.paused },
        { key: 'churned', label: 'Gone', count: counts.churned },
        { key: 'all', label: 'Everyone', count: counts.all },
      ]} />

      <ErrorNote error={rows.error} onRetry={rows.reload} />

      {rows.loading ? <Loading /> : list.length === 0 ? (
        <Card><EmptyState title={q ? 'Nobody matches that.' : 'No customers here yet.'}
          action={!q && <Button variant="primary" onClick={() => setAdd(true)}>Add the first one</Button>} /></Card>
      ) : (
        <Card pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th className="hidden md:table-cell">Address</th>
                <th className="hidden lg:table-cell" style={{ width: 150 }}>Contact</th>
                <th style={{ width: 90 }}>Visits</th>
                <th style={{ width: 110 }}>Portal</th>
                <th style={{ width: 92 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => {
                const done = (c.jobs || []).filter(j => j.status === 'complete')
                const p = (c.properties || [])[0]
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/os/customers/${c.id}`} className="font-medium hover:underline underline-offset-2">
                        {c.company || `${c.first_name} ${c.last_name || ''}`.trim()}
                      </Link>
                      <div className="text-[11.5px] text-ink-3">{c.kind} · joined {ago(c.created_at)}</div>
                    </td>
                    <td className="hidden md:table-cell text-[12.5px] text-ink-2">
                      {p ? `${p.street}, ${p.city} ${p.zip}` : <span className="text-ink-3">no property on file</span>}
                      {(c.properties || []).length > 1 && <span className="text-ink-3"> +{c.properties.length - 1}</span>}
                    </td>
                    <td className="hidden lg:table-cell text-[12.5px]">
                      {c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{phoneFmt(c.phone)}</a> : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="tnum text-[13px]">{done.length}</td>
                    <td>
                      {c.auth_user_id
                        ? <Chip tone="moss">has access</Chip>
                        : c.portal_invited_at ? <Chip tone="brass">invited</Chip> : <Chip tone="mute">no login</Chip>}
                    </td>
                    <td><Chip tone={c.status === 'active' ? 'navy' : c.status === 'paused' ? 'brass' : 'mute'}>{c.status}</Chip></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <AddCustomer open={add} onClose={() => setAdd(false)} onDone={rows.reload} />
    </>
  )
}

function AddCustomer({ open, onClose, onDone }) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    first_name: '', last_name: '', company: '', email: '', phone: '',
    kind: 'residential', source: 'phone', notes: '',
    street: '', unit: '', city: 'Jacksonville', zip: '', beds: 3, baths: 2, half_baths: 0,
  })

  const save = async () => {
    setBusy(true)
    try {
      const c = await must(supabase.from('clients').insert({
        first_name: f.first_name.trim(), last_name: f.last_name.trim() || null,
        company: f.company.trim() || null, email: f.email.trim() || null,
        phone: f.phone.trim() || null, kind: f.kind, source: f.source, notes: f.notes || null,
      }).select('id').single())

      if (f.street.trim() && f.zip.trim()) {
        await must(supabase.from('properties').insert({
          client_id: c.id, street: f.street.trim(), unit: f.unit || null, city: f.city, zip: f.zip.trim(),
          beds: Number(f.beds), baths: Number(f.baths), half_baths: Number(f.half_baths),
        }).select('id').single())
      }
      toast.ok('Customer added.')
      onClose(); onDone()
      setF(x => ({ ...x, first_name: '', last_name: '', company: '', email: '', phone: '', street: '', unit: '', zip: '', notes: '' }))
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a customer" width={620}
      sub="Name and one way to reach them is enough. The address can wait."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={busy || !f.first_name.trim()} onClick={save}>{busy ? 'Saving…' : 'Add them'}</Button>
      </>}>
      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={f.first_name} onChange={e => setF(x => ({ ...x, first_name: e.target.value }))} /></Field>
          <Field label="Last name"><Input value={f.last_name} onChange={e => setF(x => ({ ...x, last_name: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={f.phone} onChange={e => setF(x => ({ ...x, phone: e.target.value }))} /></Field>
          <Field label="Email" hint="Needed later if they want a portal login">
            <Input type="email" value={f.email} onChange={e => setF(x => ({ ...x, email: e.target.value }))} />
          </Field>
        </div>
        <div className="grid grid-cols-[1fr_170px_150px] gap-3">
          <Field label="Company"><Input value={f.company} onChange={e => setF(x => ({ ...x, company: e.target.value }))} /></Field>
          <Field label="Kind">
            <Select value={f.kind} onChange={e => setF(x => ({ ...x, kind: e.target.value }))}>
              <option value="residential">Residential</option><option value="commercial">Commercial</option>
            </Select>
          </Field>
          <Field label="Came from">
            <Select value={f.source} onChange={e => setF(x => ({ ...x, source: e.target.value }))}>
              {['website','phone','referral','google','instagram','repeat','walkthrough','other'].map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>

        <div className="pt-3.5" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="label">The property (optional)</span>
          <div className="grid grid-cols-[1fr_90px] gap-3 mt-1.5">
            <Field label="Street"><Input value={f.street} onChange={e => setF(x => ({ ...x, street: e.target.value }))} /></Field>
            <Field label="Unit"><Input value={f.unit} onChange={e => setF(x => ({ ...x, unit: e.target.value }))} /></Field>
          </div>
          <div className="grid grid-cols-[1fr_110px_repeat(3,86px)] gap-3 mt-3">
            <Field label="City"><Input value={f.city} onChange={e => setF(x => ({ ...x, city: e.target.value }))} /></Field>
            <Field label="ZIP"><Input value={f.zip} onChange={e => setF(x => ({ ...x, zip: e.target.value }))} /></Field>
            <Field label="Beds"><Input type="number" min="0" value={f.beds} onChange={e => setF(x => ({ ...x, beds: e.target.value }))} /></Field>
            <Field label="Baths"><Input type="number" min="0" value={f.baths} onChange={e => setF(x => ({ ...x, baths: e.target.value }))} /></Field>
            <Field label="Half"><Input type="number" min="0" value={f.half_baths} onChange={e => setF(x => ({ ...x, half_baths: e.target.value }))} /></Field>
          </div>
        </div>

        <Field label="Notes"><Textarea rows={2} value={f.notes} onChange={e => setF(x => ({ ...x, notes: e.target.value }))} /></Field>
      </div>
    </Modal>
  )
}
