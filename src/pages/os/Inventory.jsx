import { useState, useMemo } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { money, ago, fmtStamp } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, Loading, ErrorNote, EmptyState, Tabs, Input, Select,
  Field, Modal, MoneyInput, useToast, Stat, ArmedButton,
} from '../../components/ui'

export default function Inventory() {
  const a = useAuth()
  const [tab, setTab] = useState('stock')
  const [q, setQ] = useState('')
  const [add, setAdd] = useState(false)
  const [restock, setRestock] = useState(null)

  const items = useQuery(() => must(
    supabase.from('inventory_items').select('*,inventory_categories(label)').order('name')
  ), [])
  const cats = useQuery(() => must(supabase.from('inventory_categories').select('*').order('sort_order')), [])
  const moves = useQuery(() => tab !== 'ledger' ? [] : must(
    supabase.from('inventory_moves').select('*,inventory_items(name,unit),staff(full_name),jobs(number)')
      .order('created_at', { ascending: false }).limit(200)
  ), [tab])

  const rows = useMemo(() => {
    let l = (items.data || []).filter(i => i.active)
    if (tab === 'low') l = l.filter(i => Number(i.on_hand) <= Number(i.reorder_point))
    const s = q.trim().toLowerCase()
    if (s) l = l.filter(i => `${i.name} ${i.sku || ''} ${i.vendor || ''}`.toLowerCase().includes(s))
    return l
  }, [items.data, tab, q])

  const low = (items.data || []).filter(i => i.active && Number(i.on_hand) <= Number(i.reorder_point))
  const value = (items.data || []).filter(i => i.active)
    .reduce((n, i) => n + Number(i.on_hand) * i.unit_cost_cents, 0)

  return (
    <>
      <PageHead eyebrow="Supplies" title="Inventory."
                sub="What is on the shelf, what leaves on a job, and what needs ordering.">
        <Input placeholder="Search item or vendor" value={q} onChange={e => setQ(e.target.value)} style={{ width: 230 }} />
        {a.isOffice && <Button variant="primary" onClick={() => setAdd(true)}>Add an item</Button>}
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Items tracked" value={(items.data || []).filter(i => i.active).length} />
        <Stat label="At or under reorder" value={low.length} sub={low.length ? 'order these' : 'nothing to order'}
              tone={low.length ? 'var(--brass)' : undefined} />
        <Stat label="Value on the shelf" value={money(Math.round(value))} />
        <Stat label="Categories" value={(cats.data || []).length} />
      </div>

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'stock', label: 'On the shelf', count: (items.data || []).filter(i => i.active).length },
        { key: 'low', label: 'Needs ordering', count: low.length },
        { key: 'ledger', label: 'Movement' },
      ]} />

      <ErrorNote error={items.error} onRetry={items.reload} />

      {tab === 'ledger' ? (
        moves.loading ? <Loading /> : (moves.data || []).length === 0 ? (
          <Card><EmptyState title="Nothing has moved yet." body="Every restock and every job that used something shows up here." /></Card>
        ) : (
          <Card pad={false}>
            <table className="tbl">
              <thead><tr><th style={{ width: 180 }}>When</th><th>Item</th><th style={{ width: 100 }}>Change</th><th style={{ width: 110 }}>Reason</th><th style={{ width: 150 }}>Who</th><th style={{ width: 100 }}>Job</th></tr></thead>
              <tbody>
                {moves.data.map(m => (
                  <tr key={m.id}>
                    <td className="text-[12.5px] tnum">{fmtStamp(m.created_at)}</td>
                    <td className="text-[13px]">{m.inventory_items?.name}</td>
                    <td className="tnum text-[13px]" style={{ color: Number(m.delta) < 0 ? 'var(--rust)' : 'var(--moss)' }}>
                      {Number(m.delta) > 0 ? '+' : ''}{Number(m.delta)} {m.inventory_items?.unit}
                    </td>
                    <td><Chip tone={m.reason === 'restock' ? 'moss' : m.reason === 'used' ? 'navy' : 'mute'}>{m.reason}</Chip></td>
                    <td className="text-[12.5px]">{m.staff?.full_name || '—'}</td>
                    <td className="text-[12px] tnum text-ink-3">{m.jobs?.number || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      ) : items.loading ? <Loading /> : rows.length === 0 ? (
        <Card><EmptyState
          title={tab === 'low' ? 'Nothing needs ordering.' : q ? 'No item matches that.' : 'No items tracked yet.'}
          body={tab === 'low' ? 'Every item is above its reorder point.' : undefined}
          action={tab === 'stock' && !q && a.isOffice && <Button variant="primary" onClick={() => setAdd(true)}>Add the first item</Button>} /></Card>
      ) : (
        <Card pad={false}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Item</th>
                <th className="hidden md:table-cell" style={{ width: 150 }}>Category</th>
                <th style={{ width: 120 }}>On hand</th>
                <th style={{ width: 110 }}>Reorder at</th>
                <th className="hidden lg:table-cell" style={{ width: 110 }}>Unit cost</th>
                <th className="hidden lg:table-cell">Vendor</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => {
                const isLow = Number(i.on_hand) <= Number(i.reorder_point)
                return (
                  <tr key={i.id}>
                    <td>
                      <div className="font-medium">{i.name}</div>
                      {i.sku && <div className="text-[11px] tnum text-ink-3">{i.sku}</div>}
                    </td>
                    <td className="hidden md:table-cell text-[12.5px] text-ink-2">{i.inventory_categories?.label}</td>
                    <td>
                      <span className="tnum text-[15px]" style={isLow ? { color: 'var(--rust)', fontWeight: 600 } : undefined}>
                        {Number(i.on_hand)}
                      </span>
                      <span className="text-[11.5px] text-ink-3 ml-1">{i.unit}</span>
                      {isLow && <Chip tone="rust" className="ml-2">low</Chip>}
                    </td>
                    <td className="tnum text-[12.5px] text-ink-2">{Number(i.reorder_point)}</td>
                    <td className="hidden lg:table-cell tnum text-[12.5px]">{money(i.unit_cost_cents)}</td>
                    <td className="hidden lg:table-cell text-[12.5px] text-ink-2">{i.vendor || '—'}</td>
                    <td className="text-right">
                      {a.isOffice && <Button size="sm" onClick={() => setRestock(i)}>Adjust</Button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>
      )}

      <AddItem open={add} onClose={() => setAdd(false)} cats={cats.data || []} onDone={items.reload} />
      <Adjust item={restock} onClose={() => setRestock(null)} onDone={() => { items.reload(); moves.reload() }} />
    </>
  )
}

function AddItem({ open, onClose, cats, onDone }) {
  const toast = useToast()
  const [f, setF] = useState({ name: '', sku: '', category_key: 'chemical', unit: 'each', on_hand: 0, reorder_point: 0, reorder_qty: 0, cost: 0, vendor: '', location: '' })

  const save = async () => {
    try {
      const item = await must(supabase.from('inventory_items').insert({
        name: f.name.trim(), sku: f.sku.trim() || null, category_key: f.category_key,
        unit: f.unit, reorder_point: Number(f.reorder_point), reorder_qty: Number(f.reorder_qty),
        unit_cost_cents: f.cost, vendor: f.vendor || null, location: f.location || null, on_hand: 0,
      }).select('id').single())

      // opening stock is a MOVE, so the ledger and the count never disagree
      if (Number(f.on_hand) > 0) {
        await must(supabase.from('inventory_moves').insert({
          item_id: item.id, delta: Number(f.on_hand), reason: 'adjust', note: 'Opening count',
        }).select().single())
      }
      toast.ok('Item added.')
      onClose(); onDone()
      setF(x => ({ ...x, name: '', sku: '', on_hand: 0 }))
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an item" width={580}
      footer={<><Button onClick={onClose}>Cancel</Button>
               <Button variant="primary" disabled={!f.name.trim()} onClick={save}>Add it</Button></>}>
      <div className="grid gap-3.5">
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <Field label="Name"><Input value={f.name} onChange={e => setF(x => ({ ...x, name: e.target.value }))} placeholder="All-purpose cleaner, 1 gal" /></Field>
          <Field label="SKU"><Input value={f.sku} onChange={e => setF(x => ({ ...x, sku: e.target.value }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={f.category_key} onChange={e => setF(x => ({ ...x, category_key: e.target.value }))}>
              {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={f.unit} onChange={e => setF(x => ({ ...x, unit: e.target.value }))}>
              {['each', 'gallon', 'quart', 'bottle', 'case', 'roll', 'box', 'pack', 'pair'].map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <Field label="On hand now"><Input type="number" min="0" value={f.on_hand} onChange={e => setF(x => ({ ...x, on_hand: e.target.value }))} /></Field>
          <Field label="Reorder at"><Input type="number" min="0" value={f.reorder_point} onChange={e => setF(x => ({ ...x, reorder_point: e.target.value }))} /></Field>
          <Field label="Order qty"><Input type="number" min="0" value={f.reorder_qty} onChange={e => setF(x => ({ ...x, reorder_qty: e.target.value }))} /></Field>
          <Field label="Unit cost"><MoneyInput cents={f.cost} onCents={c => setF(x => ({ ...x, cost: c }))} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor"><Input value={f.vendor} onChange={e => setF(x => ({ ...x, vendor: e.target.value }))} /></Field>
          <Field label="Where it lives"><Input value={f.location} onChange={e => setF(x => ({ ...x, location: e.target.value }))} placeholder="Van 1 / shelf B" /></Field>
        </div>
      </div>
    </Modal>
  )
}

function Adjust({ item, onClose, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('restock')
  const [note, setNote] = useState('')

  const save = async () => {
    const n = Number(qty)
    if (!n) { toast.error('Enter a number that is not zero.'); return }
    const delta = (reason === 'restock' || reason === 'returned') ? Math.abs(n) : -Math.abs(n)
    try {
      await must(supabase.from('inventory_moves').insert({
        item_id: item.id, delta, reason, note: note || null, staff_id: a.user.id,
      }).select().single())
      toast.ok(`${item.name}: ${delta > 0 ? '+' : ''}${delta} ${item.unit}.`)
      setQty(''); setNote(''); onClose(); onDone()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <Modal open={!!item} onClose={onClose} title={item ? `Adjust ${item.name}` : ''}
      sub={item ? `${Number(item.on_hand)} ${item.unit} on hand right now.` : ''}
      footer={<><Button onClick={onClose}>Cancel</Button>
               <Button variant="primary" onClick={save} disabled={!Number(qty)}>Record it</Button></>}>
      <div className="grid gap-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="What happened">
            <Select value={reason} onChange={e => setReason(e.target.value)}>
              <option value="restock">Restocked — arrived</option>
              <option value="used">Used</option>
              <option value="waste">Spilled or damaged</option>
              <option value="returned">Returned to the shelf</option>
              <option value="adjust">Counted — correcting</option>
            </Select>
          </Field>
          <Field label="How many"><Input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} autoFocus /></Field>
        </div>
        <Field label="Note"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="PO 4471, arrived Tuesday" /></Field>
        <p className="text-[12px] text-ink-3 m-0">
          The count on the shelf is worked out from these movements, so nothing can drift without a line explaining it.
        </p>
      </div>
    </Modal>
  )
}
