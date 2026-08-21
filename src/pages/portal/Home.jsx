import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { phoneFmt } from '../../lib/format'
import {
  PageHead, Card, Button, Loading, ErrorNote, EmptyState, Field, Input, Textarea, useToast,
} from '../../components/ui'

export default function PortalHome() {
  const a = useAuth()
  const toast = useToast()
  const props = useQuery(() => must(supabase.from('properties').select('*').order('created_at')), [])

  const savePlace = async (p, fields) => {
    try {
      const saved = await must(supabase.from('properties').update(fields).eq('id', p.id).select('id'))
      if (!saved?.length) throw new Error('That did not save.')
      toast.ok('Saved — the crew will see it.')
      props.reload()
    } catch (e) { toast.error(e.message) }
  }

  const saveMe = async (fields) => {
    try {
      const saved = await must(supabase.from('clients').update(fields).eq('id', a.client.id).select('id'))
      if (!saved?.length) throw new Error('That did not save.')
      toast.ok('Saved.')
      a.refresh()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <>
      <PageHead eyebrow="Your details" title="My home."
                sub="What you change here is what the crew reads before they knock." />

      <ErrorNote error={props.error} onRetry={props.reload} />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="You">
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <Input defaultValue={a.client?.first_name || ''}
                  onBlur={e => e.target.value !== a.client?.first_name && saveMe({ first_name: e.target.value })} />
              </Field>
              <Field label="Last name">
                <Input defaultValue={a.client?.last_name || ''}
                  onBlur={e => e.target.value !== (a.client?.last_name || '') && saveMe({ last_name: e.target.value })} />
              </Field>
            </div>
            <Field label="Phone" hint="The crew texts this number when they are done.">
              <Input defaultValue={a.client?.phone || ''}
                onBlur={e => e.target.value !== (a.client?.phone || '') && saveMe({ phone: e.target.value })} />
            </Field>
            <Field label="Email" hint="Where invoices and confirmations go.">
              <Input defaultValue={a.client?.email || ''} readOnly
                     style={{ background: 'var(--paper2)' }} />
            </Field>
            <p className="text-[12px] text-ink-3 m-0">
              Your email is the address you sign in with — call the office on {phoneFmt('9045138820')} to change it.
            </p>
          </div>
        </Card>

        <div className="grid gap-4 content-start">
          {props.loading ? <Loading /> : (props.data || []).length === 0 ? (
            <Card><EmptyState title="No property on file." body="Message the office and they will add it." /></Card>
          ) : props.data.map(p => (
            <Card key={p.id} title={p.label}>
              <div className="text-[14px] mb-3">
                {p.street}{p.unit ? `, ${p.unit}` : ''}<br />
                <span className="text-ink-2">{p.city}, {p.state} {p.zip}</span>
                <span className="text-[12.5px] text-ink-3 block mt-1">
                  {p.beds} bed · {p.baths} bath{p.half_baths ? ` · ${p.half_baths} half` : ''}
                </span>
              </div>
              <div className="grid gap-3 pt-3" style={{ borderTop: '1px solid var(--line)' }}>
                <Field label="How we get in" hint="Lockbox code, side door, a neighbour — whatever is true.">
                  <Textarea rows={2} defaultValue={p.entry_notes || ''}
                    onBlur={e => e.target.value !== (p.entry_notes || '') && savePlace(p, { entry_notes: e.target.value })} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pets">
                    <Input defaultValue={p.pets || ''} placeholder="Two cats, they hide"
                      onBlur={e => e.target.value !== (p.pets || '') && savePlace(p, { pets: e.target.value })} />
                  </Field>
                  <Field label="Parking">
                    <Input defaultValue={p.parking || ''} placeholder="Driveway is fine"
                      onBlur={e => e.target.value !== (p.parking || '') && savePlace(p, { parking: e.target.value })} />
                  </Field>
                </div>
                <Field label="Gate or lock code" hint="Only the office and the crew on your job can read this.">
                  <Input defaultValue={p.gate_code || ''}
                    onBlur={e => e.target.value !== (p.gate_code || '') && savePlace(p, { gate_code: e.target.value })} />
                </Field>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  )
}
