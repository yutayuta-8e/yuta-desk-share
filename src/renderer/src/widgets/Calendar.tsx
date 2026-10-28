import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { Glass } from '../Glass'
import { Glow } from '../light/Light'
import { useFeed, useNow } from '../hooks'
import { yd } from '../api'
import { holidayName } from '@shared/holidays'
import { SUBS_CARD_STATE, type CalendarEvent } from '@shared/types'
import { DOW, ymd, parseDay, addDays, hm, md, dayLabel, spanOf, rangeLabel, markOn } from './calendarDays'

const get = () => yd.getCalendar()
const on = yd.onCalendar

/** A line under the month: an event (opens its card), or a money day or holiday (chooses its day). */
type Item = {
  key: string
  day: Date
  order: number
  kind: 'event' | 'long' | 'money' | 'hol'
  when: string
  title: string
  note?: string
  event?: CalendarEvent
}

/** What one day holds: short events, the long event passing through it (drawn as a line of stars). */
type DayInfo = { short: CalendarEvent[]; long?: { e: CalendarEvent; first: boolean; last: boolean } }

/**
 * Month view, design 2 "constellation" (2026-10-28): six weeks always, the days of the months around
 * faint; events are up to two tiny lights, an event over several days is stars joined by a line,
 * a renewal is a four-point star above right, a money day a small yen above left, a holiday takes the
 * wallpaper's colour, today is a square. Below: what is coming, or the chosen day. Subscriptions are
 * not listed there (owner, 2026-10-28): the star at the top right opens their own card.
 */
export function Calendar() {
  const data = useFeed(get, on)
  const now = useNow(60_000)
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  // null = what is coming; a day = that day (click the same day again to go back)
  const [sel, setSel] = useState<string | null>(null)
  // the event whose card is open beside the calendar (main tells us; it closes on its own)
  const [open, setOpen] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [msg, setMsg] = useState('')
  const host = useRef<HTMLDivElement>(null)
  const acc = useRef(0)
  const lock = useRef(0)
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  useEffect(() => yd.onCalCardState(setOpen), [])

  // A horizontal swipe turns exactly one month (then ignores the rest of that swipe).
  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
      if (!dx) return
      e.preventDefault()
      const t = performance.now()
      if (t < lock.current) { acc.current = 0; return }
      acc.current += dx
      if (Math.abs(acc.current) > 40) {
        const n = acc.current > 0 ? 1 : -1
        acc.current = 0; lock.current = t + 600
        const c = cursorRef.current
        setCursor(new Date(c.getFullYear(), c.getMonth() + n, 1))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const events = useMemo(() => data?.events ?? [], [data])
  const marks = useMemo(() => data?.marks ?? [], [data])
  const today = parseDay(ymd(now))

  const days = useMemo(() => {
    const m = new Map<string, DayInfo>()
    const at = (k: string) => { let v = m.get(k); if (!v) { v = { short: [] }; m.set(k, v) } return v }
    for (const e of events) {
      const [a, b] = spanOf(e)
      if (b > a) {
        // when two long events overlap, the first one keeps the line
        for (let d = a; d <= b; d = addDays(d, 1)) { const v = at(ymd(d)); if (!v.long) v.long = { e, first: +d === +a, last: +d === +b } }
      } else at(ymd(a)).short.push(e)
    }
    return m
  }, [events])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const start = addDays(first, -first.getDay())
    return Array.from({ length: 42 }, (_, i) => addDays(start, i))
  }, [cursor])

  /** The lines for one day; `coming` words them from today ("明日 14:00"), otherwise for the chosen day. */
  const itemsOf = (d: Date, coming: boolean): Item[] => {
    const k = ymd(d)
    const label = coming ? `${dayLabel(d, now)} ` : ''
    const out: Item[] = []
    const info = days.get(k)
    for (const e of info?.short ?? []) {
      if (coming && !e.allDay && new Date(e.end || e.start) < now) continue
      out.push({ key: e.id, day: d, order: e.allDay ? 0 : 1 + new Date(e.start).getHours() * 60 + new Date(e.start).getMinutes(), kind: 'event', when: label + (e.allDay ? '終日' : hm(e.start)), title: e.title, event: e })
    }
    // a long event is listed once: on its first day, or today when it is already under way
    if (info?.long && (!coming || info.long.first || +d === +today)) {
      const e = info.long.e
      out.push({ key: e.id, day: d, order: 2000, kind: 'long', when: rangeLabel(e), title: e.title, event: e })
    }
    for (const m of marks) {
      if (m.kind === 'money' && markOn(m, d)) out.push({ key: `m:${m.name}:${k}`, day: d, order: 4000, kind: 'money', when: `${label}引落`, title: m.name, note: m.note })
    }
    const hol = holidayName(k)
    if (hol) out.push({ key: `h:${k}`, day: d, order: coming ? 5000 : -1, kind: 'hol', when: `${label}祝日`, title: hol })
    return out.sort((a, b) => a.order - b.order)
  }

  // the coming two weeks, at most four lines
  const coming = useMemo(() => {
    const out: Item[] = []
    for (let i = 0; i < 14 && out.length < 4; i++) out.push(...itemsOf(addDays(today, i), true))
    return out.slice(0, 4)
  }, [days, marks, now])
  const chosen = sel ? itemsOf(parseDay(sel), false) : []

  const away = cursor.getFullYear() !== now.getFullYear() || cursor.getMonth() !== now.getMonth() || sel !== null
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
  const connect = async () => {
    setConnecting(true); setMsg('ブラウザで Google にログインしてください')
    const r = await yd.calendarConnect()
    setConnecting(false); setMsg(r.ok ? '' : r.message)
  }
  const canConnect = data && !data.connected && data.error !== 'credentials 未設置'
  const canAdd = !!data?.connected

  const choose = (d: Date, toggle = true) => {
    const k = ymd(d)
    if (d.getMonth() !== cursor.getMonth()) setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
    setSel((cur) => (toggle && cur === k ? null : k))
  }
  // events open their card level with their row; the rest choose their day
  const pick = (it: Item, e: MouseEvent<HTMLDivElement>) => {
    if (it.event) {
      const r = e.currentTarget.getBoundingClientRect()
      yd.calCardOpen({ mode: 'detail', eventId: it.event.id, anchorY: r.top + r.height / 2 })
    } else choose(it.day, false)
  }
  const addOn = (d: Date) => { if (canAdd) yd.calCardOpen({ mode: 'add', date: ymd(d) }) }

  const lead = (it: Item) => {
    if (it.kind === 'long') return <i className="bar" />
    if (it.event && it.event.id === open) return <i className="lt-star" />
    if (it.kind === 'money') return '¥'
    return null
  }
  const row = (it: Item) => (
    <div key={it.key} className={`row k-${it.kind} ${it.event && it.event.id === open ? 'on' : ''}`} onClick={(e) => pick(it, e)}>
      <span className="lead">{lead(it)}</span>
      <span className="when">{it.when}</span>
      {it.kind === 'hol' ? <span className="t hol-name">{it.title}</span> : <Glow>{it.title}</Glow>}
      {it.note && <span className="note">{it.note}</span>}
    </div>
  )

  return (
    <Glass id="calendar" className="v2-cal">
      <div ref={host} style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-nodrag>
        <div className="head">
          <Glow breathe className="month">{cursor.getMonth() + 1}月</Glow>
          <div className="head-r">
            <div className="nav">
              <button onClick={() => move(-1)} aria-label="前の月">‹</button>
              {/* back to this month and today; shown only after moving away from it */}
              {away && <button className="back" onClick={() => { setCursor(new Date(now.getFullYear(), now.getMonth(), 1)); setSel(null) }}>今日に戻る</button>}
              <button onClick={() => move(1)} aria-label="次の月">›</button>
            </div>
            {/* the subscriptions: the same star as the renewals on the days, no word (owner) */}
            <button className={`subs-btn ${open === SUBS_CARD_STATE ? 'on' : ''}`} aria-label="サブスク" onClick={() => yd.calCardOpen({ mode: 'subs' })}><i className="lt-star" /></button>
          </div>
        </div>
        <div className="grid">
          {DOW.map((d) => <span key={d} className="dow">{d}</span>)}
          {cells.map((d) => {
            const k = ymd(d)
            const info = days.get(k)
            const col = d.getDay()
            const dots = Math.min(2, info?.short.length ?? 0)
            const sub = marks.some((m) => m.kind === 'sub' && markOn(m, d))
            const money = marks.some((m) => m.kind === 'money' && markOn(m, d))
            const cls = ['day', d.getMonth() !== cursor.getMonth() ? 'other' : '', +d === +today ? 'today' : '', k === sel ? 'sel' : '', holidayName(k) ? 'hol' : ''].join(' ')
            return (
              <span key={k} className={cls} onClick={() => choose(d)} onDoubleClick={() => { choose(d, false); addOn(d) }}>
                <span className="n lt-soft">{d.getDate()}</span>
                {info?.long && <>
                  {!info.long.first && <i className={`line l ${col === 0 ? 'edge' : ''}`} />}
                  {!info.long.last && <i className={`line r ${col === 6 ? 'edge' : ''}`} />}
                  <i className="node lt-star" />
                </>}
                {dots > 0 && <span className={`dots ${info?.long ? 'aside' : ''}`}>{Array.from({ length: info?.long ? 1 : dots }, (_, i) => <i key={i} />)}</span>}
                {sub && <i className="sub lt-star" />}
                {money && <span className="yen lt-soft">¥</span>}
              </span>
            )
          })}
        </div>
        <div className="events">
          {sel && <div className="selh">{md(parseDay(sel))}</div>}
          {(sel ? chosen : coming).map(row)}
          {sel && canAdd && (
            <div className="row add" onClick={() => addOn(parseDay(sel))}><span className="lead">＋</span><span className="t">この日に予定を足す</span></div>
          )}
        </div>
        {canConnect && (
          <div className="connect">
            <button onClick={connect} disabled={connecting}>{connecting ? 'ログインを待っています' : 'Google カレンダーをつなぐ'}</button>
            {msg && <div className="v2-note">{msg}</div>}
          </div>
        )}
      </div>
    </Glass>
  )
}
