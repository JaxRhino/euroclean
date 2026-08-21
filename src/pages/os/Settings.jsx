import { useState } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money } from '../../lib/format'
import { quote } from '../../lib/catalog'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, Tabs, Field, Input,
  Select, MoneyInput, useToast, EmptyState,
} from '../../components/ui'

export default function Settings() {
  const [tab, setTab] = useState('pricing')
  return (
    <>
      <PageHead eyebrow="Owner" title="Settings."
                sub="What things cost, what the company says about itself, and how the day is cut up." />
      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'pricing', label: 'Prices' },
        { key: 'services', label: 'Services' },
        { key: 'extras', label: 'Extras' },
        { key: 'company', label: 'Company' },
      ]} />
      {tab === 'pricing' && <Pricing />}
      {tab === 'services' && <Services />}
      {tab === 'extras' && <Extras />}
      {tab === 'company' && <Company />}
    </>
  )
}

/* ---------------- the price list ---------------- */
function Pricing() {
  const toast = useToast()
  const beds = useQuery(() => must(supabase.from('pricing_beds').select('*').order('beds')), [])
  const settings = useQuery(() => must(supabase.from('settings').select('*').order('key')), [])
  const freqs = useQuery(() => must(supabase.from('frequencies').select('*').order('sort_order')), [])
  const [test, setTest] = useState(null)

  const get = (k) => (settings.data || []).find(s => s.key === k)
  const setSetting = async (key, value) => {
    try {
      const saved = await must(supabase.from('settings').update({ value }).eq('key', key).select('key'))
      if (!saved?.length) throw new Error('Nothing saved.')
      settings.reload(); toast.ok('Saved.')
    } catch (e) { toast.error(e.message) }
  }

  const runTest = async () => {
    try { setTest(await quote({ service: 'maintenance', beds: 3, baths: 2, half: 0, frequency: 'biweekly', extras: [] })) }
    catch (e) { toast.error(e.message) }
  }

  if (beds.loading || settings.loading) return <Loading />

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Base price by bedrooms">
        <p className="text-[12.5px] text-ink-2 mt-0">
          This is where every quote starts. The website and the office both read these numbers — there is only one price list.
        </p>
        <table className="tbl mt-2">
          <thead><tr><th>Bedrooms</th><th style={{ width: 160 }}>Base price</th></tr></thead>
          <tbody>
            {(beds.data || []).map(b => (
              <tr key={b.beds}>
                <td className="tnum">{b.beds} bed{b.beds === 1 ? '' : 's'}</td>
                <td>
                  <MoneyInput cents={b.price_cents} onCents={async c => {
                    if (c === b.price_cents) return
                    await must(supabase.from('pricing_beds').update({ price_cents: c }).eq('beds', b.beds).select('beds'))
                    beds.reload(); toast.ok('Price updated.')
                  }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--line)' }}>
          <Field label="Each extra full bath" hint="Dollars, beyond the first">
            <Input inputMode="decimal" defaultValue={get('extra_bath_cents')?.value}
              onBlur={e => Number(e.target.value) !== Number(get('extra_bath_cents')?.value) && setSetting('extra_bath_cents', Number(e.target.value))} />
          </Field>
          <Field label="Each half bath" hint="Dollars">
            <Input inputMode="decimal" defaultValue={get('half_bath_cents')?.value}
              onBlur={e => Number(e.target.value) !== Number(get('half_bath_cents')?.value) && setSetting('half_bath_cents', Number(e.target.value))} />
          </Field>
        </div>
      </Card>

      <div className="grid gap-4 content-start">
        <Card title="Recurring discounts">
          <table className="tbl">
            <thead><tr><th>Frequency</th><th style={{ width: 120 }}>Discount</th><th style={{ width: 90 }}>Active</th></tr></thead>
            <tbody>
              {(freqs.data || []).map(f => (
                <tr key={f.key}>
                  <td>{f.label}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Input className="!w-[70px]" inputMode="numeric" defaultValue={f.discount_bps / 100}
                        disabled={!f.recurring}
                        onBlur={async e => {
                          const bps = Math.round(Number(e.target.value) * 100)
                          if (bps === f.discount_bps) return
                          await must(supabase.from('frequencies').update({ discount_bps: bps }).eq('key', f.key).select('key'))
                          freqs.reload(); toast.ok('Discount updated.')
                        }} />
                      <span className="text-[13px] text-ink-3">%</span>
                    </div>
                  </td>
                  <td>
                    <input type="checkbox" checked={f.active} onChange={async e => {
                      await must(supabase.from('frequencies').update({ active: e.target.checked }).eq('key', f.key).select('key'))
                      freqs.reload()
                    }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Field label="First recurring visit multiplier" className="mt-3.5"
                 hint="A first visit is a full reset. It is never cheaper than this many times the base.">
            <Input inputMode="decimal" defaultValue={get('first_visit_min_multiplier')?.value}
              onBlur={e => Number(e.target.value) !== Number(get('first_visit_min_multiplier')?.value) && setSetting('first_visit_min_multiplier', Number(e.target.value))} />
          </Field>
        </Card>

        <Card title="Prove it">
          <p className="text-[12.5px] text-ink-2 mt-0">
            Runs a real quote through the same function the website uses, so you can see what a change actually did.
          </p>
          <Button onClick={runTest}>Price a 3 bed, 2 bath, every 2 weeks</Button>
          {test && (
            <div className="mt-3 pt-3 text-[13.5px]" style={{ borderTop: '1px solid var(--line)' }}>
              <div>First visit <b className="num text-[20px] align-middle">{money(test.first_cents)}</b></div>
              <div className="mt-1">Then <b>{money(test.after_cents)}</b> {test.frequency_label?.toLowerCase()} — a {test.discount_bps / 100}% saving.</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ---------------- services ---------------- */
function Services() {
  const toast = useToast()
  const rows = useQuery(() => must(supabase.from('services').select('*').order('sort_order')), [])
  const save = async (s, fields) => {
    try {
      const saved = await must(supabase.from('services').update(fields).eq('key', s.key).select('key'))
      if (!saved?.length) throw new Error('Nothing saved.')
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }
  if (rows.loading) return <Loading />
  return (
    <Card pad={false}>
      <table className="tbl">
        <thead>
          <tr>
            <th>Service</th><th style={{ width: 120 }}>Multiplier</th>
            <th style={{ width: 110 }}>Recurring</th><th style={{ width: 130 }}>Quote only</th><th style={{ width: 90 }}>Active</th>
          </tr>
        </thead>
        <tbody>
          {(rows.data || []).map(s => (
            <tr key={s.key}>
              <td>
                <Input defaultValue={s.label} onBlur={e => e.target.value !== s.label && save(s, { label: e.target.value })} />
                <div className="text-[11px] text-ink-3 mt-1 tnum">{s.key}</div>
              </td>
              <td>
                <Input className="!w-[80px]" inputMode="decimal" defaultValue={s.multiplier} disabled={s.quote_only}
                  onBlur={e => Number(e.target.value) !== Number(s.multiplier) && save(s, { multiplier: Number(e.target.value) })} />
              </td>
              <td><input type="checkbox" checked={s.allows_frequency} onChange={e => save(s, { allows_frequency: e.target.checked })} /></td>
              <td><input type="checkbox" checked={s.quote_only} onChange={e => save(s, { quote_only: e.target.checked })} /></td>
              <td><input type="checkbox" checked={s.active} onChange={e => save(s, { active: e.target.checked })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-[12px] text-ink-3 m-0">
        The multiplier is applied to the base price. A quote-only service does not produce a number online — it produces a walkthrough.
      </p>
    </Card>
  )
}

/* ---------------- extras ---------------- */
function Extras() {
  const toast = useToast()
  const rows = useQuery(() => must(supabase.from('service_extras').select('*').order('sort_order')), [])
  const [name, setName] = useState('')
  const [price, setPrice] = useState(0)

  const save = async (x, fields) => {
    try {
      const saved = await must(supabase.from('service_extras').update(fields).eq('key', x.key).select('key'))
      if (!saved?.length) throw new Error('Nothing saved.')
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }

  const add = async () => {
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!key) return
    try {
      await must(supabase.from('service_extras').insert({
        key, name: name.trim(), price_cents: price,
        sort_order: Math.max(0, ...(rows.data || []).map(r => r.sort_order)) + 1,
      }).select('key').single())
      setName(''); setPrice(0); toast.ok('Extra added.'); rows.reload()
    } catch (e) { toast.error(e.message.includes('duplicate') ? 'There is already an extra with that name.' : e.message) }
  }

  if (rows.loading) return <Loading />

  return (
    <>
      <Card pad={false} className="mb-4">
        <table className="tbl">
          <thead><tr><th>Extra</th><th style={{ width: 150 }}>Price</th><th style={{ width: 90 }}>Active</th></tr></thead>
          <tbody>
            {(rows.data || []).map(x => (
              <tr key={x.key}>
                <td><Input defaultValue={x.name} onBlur={e => e.target.value !== x.name && save(x, { name: e.target.value })} /></td>
                <td><MoneyInput cents={x.price_cents} onCents={c => c !== x.price_cents && save(x, { price_cents: c })} /></td>
                <td><input type="checkbox" checked={x.active} onChange={e => save(x, { active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Add an extra">
        <div className="flex items-end gap-3">
          <Field label="What it is" className="flex-1">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Inside the washing machine" />
          </Field>
          <Field label="Price" className="w-[150px]"><MoneyInput cents={price} onCents={setPrice} /></Field>
          <Button variant="primary" onClick={add} disabled={!name.trim()}>Add</Button>
        </div>
      </Card>
    </>
  )
}

/* ---------------- company ---------------- */
function Company() {
  const toast = useToast()
  const rows = useQuery(() => must(supabase.from('settings').select('*').order('key')), [])
  const get = (k) => (rows.data || []).find(s => s.key === k)
  const company = get('company')?.value || {}
  const windows = get('arrival_windows')?.value || []
  const [newWindow, setNewWindow] = useState('')

  const setSetting = async (key, value, msg) => {
    try {
      const saved = await must(supabase.from('settings').update({ value }).eq('key', key).select('key'))
      if (!saved?.length) throw new Error('Nothing saved.')
      rows.reload(); if (msg) toast.ok(msg)
    } catch (e) { toast.error(e.message) }
  }

  if (rows.loading) return <Loading />

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card title="Company details">
        <p className="text-[12.5px] text-ink-2 mt-0">These appear on invoices, estimates and in the portal.</p>
        <div className="grid gap-3 mt-3">
          {[['name', 'Name'], ['phone', 'Phone'], ['email', 'Email'], ['city', 'City'], ['state', 'State'],
            ['office_hours', 'Office hours'], ['instagram', 'Instagram'], ['site', 'Website']].map(([k, label]) => (
            <Field key={k} label={label}>
              <Input defaultValue={company[k] || ''}
                onBlur={e => e.target.value !== (company[k] || '') && setSetting('company', { ...company, [k]: e.target.value }, 'Saved.')} />
            </Field>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 content-start">
        <Card title="Arrival windows">
          <p className="text-[12.5px] text-ink-2 mt-0">
            The choices a customer gets when they book, and the ones the board offers.
          </p>
          <ul className="m-0 p-0 list-none mt-2">
            {windows.map((w, i) => (
              <li key={w} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: 'var(--line)' }}>
                <span className="text-[13.5px] flex-1 tnum">{w}</span>
                <ArmedButton size="sm" variant="ghost" confirmLabel="Remove?"
                  onConfirm={() => setSetting('arrival_windows', windows.filter((_, k) => k !== i), 'Window removed.')}>
                  Remove
                </ArmedButton>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2 mt-3">
            <Field label="Add a window" className="flex-1">
              <Input value={newWindow} onChange={e => setNewWindow(e.target.value)} placeholder="4:00 – 6:00 pm"
                     onKeyDown={e => { if (e.key === 'Enter' && newWindow.trim()) { setSetting('arrival_windows', [...windows, newWindow.trim()], 'Added.'); setNewWindow('') } }} />
            </Field>
            <Button variant="primary" disabled={!newWindow.trim()}
              onClick={() => { setSetting('arrival_windows', [...windows, newWindow.trim()], 'Added.'); setNewWindow('') }}>Add</Button>
          </div>
        </Card>

        <Card title="The guarantee">
          <Field label="Re-clean window, in hours"
                 hint="The website says 48. Change it here and the portal changes with it.">
            <Input inputMode="numeric" defaultValue={get('guarantee_hours')?.value}
              onBlur={e => Number(e.target.value) !== Number(get('guarantee_hours')?.value) && setSetting('guarantee_hours', Number(e.target.value), 'Saved.')} />
          </Field>
          <Field label="Sales tax, in basis points" className="mt-3"
                 hint="0 means no tax is added. 700 would be 7%.">
            <Input inputMode="numeric" defaultValue={get('tax_rate_bps')?.value}
              onBlur={e => Number(e.target.value) !== Number(get('tax_rate_bps')?.value) && setSetting('tax_rate_bps', Number(e.target.value), 'Saved.')} />
          </Field>
        </Card>
      </div>
    </div>
  )
}
