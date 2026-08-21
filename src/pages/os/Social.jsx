import { useState, useMemo } from 'react'
import { supabase, must } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { useQuery } from '../../lib/useQuery'
import { fmtStamp, fmtDayFull, ago, dayKey, addDays, startOfWeek, today, DOW, MON, parseDay } from '../../lib/format'
import {
  PageHead, Card, Chip, Button, ArmedButton, Loading, ErrorNote, EmptyState, Tabs,
  Field, Input, Textarea, Modal, useToast, Stat,
} from '../../components/ui'

const STATUS_TONE = { draft: 'mute', scheduled: 'navy', publishing: 'brass', published: 'moss', failed: 'rust', cancelled: 'mute' }

export default function Social() {
  const [tab, setTab] = useState('queue')
  const [compose, setCompose] = useState(null)   // null | {} | post

  const posts = useQuery(() => must(
    supabase.from('social_posts').select('*,staff:created_by(full_name,color)').order('scheduled_at', { ascending: true, nullsFirst: false }).limit(300)
  ), [])
  const channels = useQuery(() => must(supabase.from('social_channels').select('*').eq('active', true).order('sort_order')), [])

  const all = posts.data || []
  const queue = all.filter(p => ['draft', 'scheduled', 'publishing', 'failed'].includes(p.status))
  const done = all.filter(p => p.status === 'published')
  const connected = (channels.data || []).filter(c => c.connected)

  return (
    <>
      <PageHead eyebrow="Marketing" title="Social."
                sub="Write it once, put it in the queue, and it goes out on the day you chose.">
        <Button variant="primary" onClick={() => setCompose({})}>Write a post</Button>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="In the queue" value={queue.filter(p => p.status === 'scheduled').length} sub="dated and waiting" />
        <Stat label="Drafts" value={queue.filter(p => p.status === 'draft').length} sub="no date yet" />
        <Stat label="Published" value={done.length} />
        <Stat label="Channels connected" value={`${connected.length}/${(channels.data || []).length}`}
              tone={connected.length === 0 ? 'var(--brass)' : undefined} />
      </div>

      {connected.length === 0 && (
        <Card className="mb-4 border-l-2" style={{ borderLeftColor: 'var(--brass)' }}>
          <div className="text-[13.5px] font-semibold" style={{ color: 'var(--brass)' }}>Nothing publishes itself yet.</div>
          <p className="text-[13px] text-ink-2 m-0 mt-1">
            No channel is connected, so a scheduled post lands in the queue and waits for someone to post it by hand.
            The queue still does the work — it decides what goes out and when, and it keeps the copy.
            Connect a channel below and the same queue starts sending on its own.
          </p>
        </Card>
      )}

      <Tabs value={tab} onChange={setTab} className="mb-4" tabs={[
        { key: 'queue', label: 'Queue', count: queue.length },
        { key: 'calendar', label: 'Calendar' },
        { key: 'published', label: 'Published', count: done.length },
        { key: 'channels', label: 'Channels', count: (channels.data || []).length },
      ]} />

      <ErrorNote error={posts.error} onRetry={posts.reload} />

      {tab === 'queue' && <Queue rows={queue} loading={posts.loading} onEdit={setCompose} onChanged={posts.reload} channels={channels.data || []} />}
      {tab === 'published' && <Queue rows={done} loading={posts.loading} onEdit={setCompose} onChanged={posts.reload} channels={channels.data || []} published />}
      {tab === 'calendar' && <Calendar rows={all} onEdit={setCompose} />}
      {tab === 'channels' && <Channels rows={channels} />}

      <Compose post={compose} onClose={() => setCompose(null)} channels={channels.data || []} onDone={posts.reload} />
    </>
  )
}

/* ---------------- queue ---------------- */
function Queue({ rows, loading, onEdit, onChanged, channels, published }) {
  const toast = useToast()
  if (loading) return <Loading />
  if (!rows.length) return <Card><EmptyState title={published ? 'Nothing published yet.' : 'The queue is empty.'} body={published ? undefined : 'Write a post and give it a date.'} /></Card>

  const markPublished = async (p) => {
    try {
      await must(supabase.from('social_posts').update({
        status: 'published', published_at: new Date().toISOString(),
        results: { ...(p.results || {}), manual: 'Posted by hand from the queue' },
      }).eq('id', p.id).select('id'))
      toast.ok('Marked as published.')
      onChanged()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="grid gap-3">
      {rows.map(p => (
        <Card key={p.id}>
          <div className="flex gap-4 items-start flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Chip tone={STATUS_TONE[p.status]}>{p.status}</Chip>
                {(p.channel_keys || []).map(k => {
                  const c = channels.find(x => x.key === k)
                  return <Chip key={k} tone={c?.connected ? 'moss' : 'mute'}>{c?.label || k}</Chip>
                })}
                <span className="text-[12px] text-ink-3">
                  {p.status === 'published' ? `went out ${fmtStamp(p.published_at)}`
                    : p.scheduled_at ? `goes out ${fmtStamp(p.scheduled_at)}`
                    : 'no date yet'}
                </span>
              </div>
              <p className="text-[13.5px] whitespace-pre-wrap m-0">{p.body}</p>
              {p.failure && <p className="text-[12.5px] m-0 mt-2" style={{ color: 'var(--rust)' }}>{p.failure}</p>}
              <div className="text-[11.5px] text-ink-3 mt-2">
                written by {p.staff?.full_name || 'someone'} · {ago(p.created_at)}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!published && <Button size="sm" onClick={() => onEdit(p)}>Edit</Button>}
              {!published && p.status !== 'published' && (
                <ArmedButton size="sm" confirmLabel="Mark it sent?" onConfirm={() => markPublished(p)}>Posted it</ArmedButton>
              )}
              <ArmedButton size="sm" variant="danger" confirmLabel="Confirm delete"
                onConfirm={async () => {
                  await must(supabase.from('social_posts').delete().eq('id', p.id).select())
                  toast.ok('Deleted.'); onChanged()
                }}>Delete</ArmedButton>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ---------------- calendar ---------------- */
function Calendar({ rows, onEdit }) {
  const [anchor, setAnchor] = useState(() => startOfWeek(today()))
  const weeks = useMemo(() => Array.from({ length: 4 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => dayKey(addDays(anchor, w * 7 + d)))), [anchor])

  const byDay = useMemo(() => {
    const m = {}
    for (const p of rows) {
      if (!p.scheduled_at) continue
      const k = dayKey(new Date(p.scheduled_at))
      ;(m[k] = m[k] || []).push(p)
    }
    return m
  }, [rows])

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" onClick={() => setAnchor(addDays(anchor, -28))}>Back</Button>
        <Button size="sm" onClick={() => setAnchor(startOfWeek(today()))}>Now</Button>
        <Button size="sm" onClick={() => setAnchor(addDays(anchor, 28))}>Forward</Button>
        <span className="text-[13px] text-ink-2 ml-2">Four weeks from {fmtDayFull(dayKey(anchor))}</span>
      </div>
      <Card pad={false}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {DOW.map(d => (
            <div key={d} className="eyebrow px-2.5 py-2 border-b border-r last:border-r-0"
                 style={{ borderColor: 'var(--line2)', background: 'var(--paper2)' }}>{d}</div>
          ))}
          {weeks.flat().map(day => {
            const items = byDay[day] || []
            const isToday = day === today()
            const dt = parseDay(day)
            return (
              <div key={day} className="min-h-[92px] p-1.5 border-b border-r last:border-r-0"
                   style={{ borderColor: 'var(--line)', background: isToday ? '#F4F7FC' : '#fff' }}>
                <div className="text-[11px] tnum mb-1" style={{ color: isToday ? 'var(--navy)' : 'var(--ink3)', fontWeight: isToday ? 700 : 400 }}>
                  {dt.getDate() === 1 ? `${MON[dt.getMonth()]} 1` : dt.getDate()}
                </div>
                {items.map(p => (
                  <button key={p.id} onClick={() => onEdit(p)}
                    className="w-full text-left mb-1 px-1.5 py-1 border block"
                    style={{ borderColor: 'var(--line2)', background: 'var(--paper2)' }}>
                    <div className="text-[10.5px] truncate">{p.body.slice(0, 44)}</div>
                    <div className="text-[9.5px] text-ink-3">{(p.channel_keys || []).join(' · ') || 'no channel'}</div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}

/* ---------------- channels ---------------- */
function Channels({ rows }) {
  const toast = useToast()
  if (rows.loading) return <Loading />
  const save = async (c, fields) => {
    try {
      const saved = await must(supabase.from('social_channels').update(fields).eq('key', c.key).select('key'))
      if (!saved?.length) throw new Error('Nothing saved.')
      rows.reload()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {(rows.data || []).map(c => (
        <Card key={c.key} title={c.label}
              action={<Chip tone={c.connected ? 'moss' : 'mute'}>{c.connected ? 'connected' : 'not connected'}</Chip>}>
          <Field label="Handle">
            <Input defaultValue={c.handle || ''} onBlur={e => e.target.value !== (c.handle || '') && save(c, { handle: e.target.value || null })} />
          </Field>
          <p className="text-[12.5px] text-ink-2 mt-3 mb-0">{c.note}</p>
          <label className="flex items-center gap-2 mt-3 text-[13px] cursor-pointer">
            <input type="checkbox" checked={c.connected} onChange={e => save(c, { connected: e.target.checked })} />
            <span>Mark as connected</span>
          </label>
          <p className="text-[11.5px] text-ink-3 mt-1.5 mb-0">
            Ticking this only records that the account exists. Automatic publishing needs the platform’s developer app,
            which is a separate step — until then the queue is a to-do list that never forgets.
          </p>
        </Card>
      ))}
    </div>
  )
}

/* ---------------- compose ---------------- */
function Compose({ post, onClose, channels, onDone }) {
  const a = useAuth()
  const toast = useToast()
  const open = post !== null
  const editing = post && post.id

  const [body, setBody] = useState('')
  const [keys, setKeys] = useState([])
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)

  useMemo(() => {
    if (!open) return
    setBody(post.body || '')
    setKeys(post.channel_keys || [])
    setWhen(post.scheduled_at ? new Date(post.scheduled_at).toISOString().slice(0, 16) : '')
  }, [post?.id, open])

  const save = async (status) => {
    if (!body.trim()) { toast.error('Write something first.'); return }
    if (status === 'scheduled' && !when) { toast.error('A scheduled post needs a date and time.'); return }
    setBusy(true)
    const row = {
      body: body.trim(), channel_keys: keys,
      scheduled_at: when ? new Date(when).toISOString() : null,
      status,
    }
    try {
      if (editing) {
        const saved = await must(supabase.from('social_posts').update(row).eq('id', post.id).select('id'))
        if (!saved?.length) throw new Error('Nothing saved.')
      } else {
        await must(supabase.from('social_posts').insert({ ...row, created_by: a.user.id }).select('id').single())
      }
      toast.ok(status === 'scheduled' ? 'In the queue.' : 'Saved as a draft.')
      onClose(); onDone()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const count = body.trim().length

  return (
    <Modal open={open} onClose={onClose} width={600}
      title={editing ? 'Edit the post' : 'Write a post'}
      sub="Same words everywhere, or pick the channels that suit it."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button disabled={busy} onClick={() => save('draft')}>Save as draft</Button>
        <Button variant="primary" disabled={busy || !when} onClick={() => save('scheduled')}>
          {when ? 'Put it in the queue' : 'Pick a time first'}
        </Button>
      </>}>
      <div className="grid gap-3.5">
        <Field label="The post" hint={`${count} character${count === 1 ? '' : 's'}${count > 280 ? ' — long for X, fine for Instagram and Facebook' : ''}`}>
          <Textarea rows={6} value={body} onChange={e => setBody(e.target.value)}
            placeholder="Move-out season is here. Book a deep clean before the walk-through and get your deposit back looking like the day you moved in." />
        </Field>
        <div>
          <span className="label">Where it goes</span>
          <div className="grid sm:grid-cols-2 gap-1.5 mt-1.5">
            {channels.map(c => (
              <label key={c.key} className="flex items-center gap-2 text-[13px] cursor-pointer py-1">
                <input type="checkbox" checked={keys.includes(c.key)}
                  onChange={e => setKeys(k => e.target.checked ? [...k, c.key] : k.filter(x => x !== c.key))} />
                <span>{c.label}</span>
                {!c.connected && <span className="text-[10.5px] text-ink-3">(post by hand)</span>}
              </label>
            ))}
          </div>
        </div>
        <Field label="When it goes out">
          <Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
